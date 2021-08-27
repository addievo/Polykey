import type { ChainDataEncoded } from './types';
import type {
  ClaimId,
  ClaimEncoded,
  ClaimData,
  ClaimType,
} from '../claims/types';
import type { NodeId } from '../nodes/types';
import type { KeyManager } from '../keys';
import type { DB } from '../db';
import type { DBLevel, DBOp } from '../db/types';

import Logger from '@matrixai/logger';
import { Mutex } from 'async-mutex';
import * as sigchainErrors from './errors';
import * as claimsUtils from '../claims/utils';
import * as dbErrors from '../db/errors';

class Sigchain {
  public readonly sigchainPath: string;
  public readonly sigchainDbPath: string;
  protected readonly sequenceNumberKey: string = 'prevSequenceNumber';

  protected logger: Logger;
  protected keyManager: KeyManager;
  protected db: DB;
  protected sigchainDbDomain: string = this.constructor.name;
  protected sigchainClaimsDbDomain: Array<string> = [
    this.sigchainDbDomain,
    'claims',
  ];
  protected sigchainMetadataDbDomain: Array<string> = [
    this.sigchainDbDomain,
    'metadata',
  ];
  protected sigchainDb: DBLevel<string>;
  // ClaimId (the lexicographic integer of the sequence number)
  // -> ClaimEncoded (a JWS in General JSON Serialization)
  protected sigchainClaimsDb: DBLevel<ClaimId>;
  // Sub-level database for numerical metadata to be persisted
  // e.g. "sequenceNumber" -> current sequence number
  protected sigchainMetadataDb: DBLevel<string>;
  protected lock: Mutex = new Mutex();
  protected _started: boolean = false;

  constructor({
    keyManager,
    db,
    logger,
  }: {
    keyManager: KeyManager;
    db: DB;
    logger?: Logger;
  }) {
    this.keyManager = keyManager;
    this.logger = logger ?? new Logger('SigchainManager');
    this.db = db;
  }

  get started(): boolean {
    return this._started;
  }

  get locked(): boolean {
    return this.lock.isLocked();
  }

  public async start({
    fresh = false,
  }: {
    fresh?: boolean;
  } = {}): Promise<void> {
    try {
      if (this._started) {
        return;
      }
      this.logger.info('Starting Sigchain');
      this._started = true;
      if (!this.db.started) {
        throw new dbErrors.ErrorDBNotStarted();
      }
      // Top-level database for the sigchain domain
      const sigchainDb = await this.db.level<string>(this.sigchainDbDomain);
      // ClaimId (the lexicographic integer of the sequence number)
      // -> ClaimEncoded (a JWS in General JSON Serialization)
      const sigchainClaimsDb = await this.db.level<ClaimId>(
        this.sigchainClaimsDbDomain[1],
        sigchainDb,
      );
      // Sub-level database for numerical metadata to be persisted
      // e.g. "sequenceNumber" -> current sequence number
      const sigchainMetadataDb = await this.db.level<string>(
        this.sigchainMetadataDbDomain[1],
        sigchainDb,
      );
      if (fresh) {
        await sigchainDb.clear();
      }
      this.sigchainDb = sigchainDb;
      this.sigchainClaimsDb = sigchainClaimsDb;
      this.sigchainMetadataDb = sigchainMetadataDb;

      // Initialise the sequence number (if not already done).
      // First claim in the sigchain has a sequence number of 1.
      // Therefore, with no claims in the sigchain, the previous sequence number
      // is set to 0.
      await this._transaction(async () => {
        const sequenceNumber = await this.db.get<number | null>(
          this.sigchainMetadataDbDomain,
          this.sequenceNumberKey,
        );
        if (sequenceNumber == null) {
          await this.db.put(
            this.sigchainMetadataDbDomain,
            this.sequenceNumberKey,
            0,
          );
        }
      });

      this.logger.info('Started Sigchain');
    } catch (e) {
      this._started = false;
      throw e;
    }
  }

  public async stop() {
    if (!this._started) {
      return;
    }
    this.logger.info('Stopping Sigchain');
    this._started = false;
    this.logger.info('Stopped Sigchain');
  }

  /**
   * Run several operations within the same lock
   * This does not ensure atomicity of the underlying database
   * Database atomicity still depends on the underlying operation
   */
  public async transaction<T>(
    f: (sigchain: Sigchain) => Promise<T>,
  ): Promise<T> {
    const release = await this.lock.acquire();
    try {
      return await f(this);
    } finally {
      release();
    }
  }

  /**
   * Transaction wrapper that will not lock if the operation was executed
   * within a transaction context
   */
  protected async _transaction<T>(f: () => Promise<T>): Promise<T> {
    if (this.lock.isLocked()) {
      return await f();
    } else {
      return await this.transaction(f);
    }
  }

  /**
   * Helper function to create claims internally in the Sigchain class.
   * Wraps claims::createClaim() with the static information common to all
   * claims in this sigchain (i.e. the private key).
   */
  protected async createClaim({
    hPrev,
    seq,
    data,
    alg,
  }: {
    hPrev: string | null;
    seq: number;
    data: ClaimData;
    alg?: string;
  }): Promise<ClaimEncoded> {
    // Get kid from the claim data
    let kid: NodeId;
    if (data.type == 'node') {
      kid = data.node1;
    } else {
      kid = data.node;
    }
    return await claimsUtils.createClaim({
      privateKey: this.keyManager.getRootKeyPairPem().privateKey,
      hPrev: hPrev,
      seq: seq,
      data: data,
      kid: kid,
      alg: alg,
    });
  }

  /**
   * Appends a claim (of any type) to the sigchain.
   */
  public async addClaim(claimData: ClaimData): Promise<void> {
    await this._transaction(async () => {
      // Compose the properties of the Claim payload
      // 1. Sequence number:
      const prevSequenceNumber = await this.getSequenceNumber();
      const newSequenceNumber = prevSequenceNumber + 1;
      // 2. Hash of previous claim:
      let hashPrevious;
      if (prevSequenceNumber == 0) {
        // If no other claims, then set as null
        hashPrevious = null;
      } else {
        // Otherwise, create a hash of the previous claim
        const previousClaim = await this.getClaim(prevSequenceNumber);
        hashPrevious = claimsUtils.hashClaim(previousClaim);
      }

      const claim = await this.createClaim({
        hPrev: hashPrevious,
        seq: newSequenceNumber,
        data: claimData,
      });
      // Add the claim to the sigchain database, and update the sequence number
      const ops: Array<DBOp> = [
        {
          type: 'put',
          domain: this.sigchainClaimsDbDomain,
          key: claimsUtils.numToLexiString(newSequenceNumber) as ClaimId,
          value: claim,
        },
        {
          type: 'put',
          domain: this.sigchainMetadataDbDomain,
          key: this.sequenceNumberKey,
          value: newSequenceNumber,
        },
      ];
      await this.db.batch(ops);
    });
  }

  /**
   * Retrieve every claim from the entire sigchain.
   * i.e. from 1 to prevSequenceNumber
   * @returns record of ClaimId -> base64url encoded claims. Use
   * claimUtils.decodeClaim() to decode each claim.
   */
  public async getChainData(): Promise<ChainDataEncoded> {
    return await this._transaction(async () => {
      const chainData: ChainDataEncoded = {};
      for await (const o of this.sigchainClaimsDb.createReadStream()) {
        const claimId = (o as any).key as ClaimId;
        const encryptedClaim = (o as any).value;
        const claim = this.db.unserializeDecrypt<ClaimEncoded>(encryptedClaim);
        chainData[claimId] = claim;
      }
      return chainData;
    });
  }

  /**
   * Retrieve every claim of a specific claim type from the sigchain.
   * TODO: Currently, all claims in the sigchain are regarded as additions -
   * we have no notion of revocations/deletions. Thus, this method simply
   * fetches ALL claims in the sigchain that are of the passed type.
   * NOTE: no verification of claim performed here. This should be done by the
   * requesting client.
   */
  public async getClaims(claimType: ClaimType): Promise<Array<ClaimEncoded>> {
    return await this._transaction(async () => {
      const relevantClaims: Array<ClaimEncoded> = [];
      for await (const o of this.sigchainClaimsDb.createReadStream()) {
        const data = (o as any).value;
        const claim = this.db.unserializeDecrypt<ClaimEncoded>(data);
        const decodedClaim = claimsUtils.decodeClaim(claim);
        if (decodedClaim.payload.data.type == claimType) {
          relevantClaims.push(claim);
        }
      }
      return relevantClaims;
    });
  }

  /**
   * Retrieves the sequence number from the metadata database of the most recent
   * claim in the sigchain (i.e. the previous sequence number).
   * @returns previous sequence number
   */
  public async getSequenceNumber(): Promise<number> {
    return await this._transaction(async () => {
      const sequenceNumber = await this.db.get<number>(
        this.sigchainMetadataDbDomain,
        this.sequenceNumberKey,
      );
      // Should never be reached: getSigchainDb() has a check whether sigchain
      // has been started (where the sequence number is initialised)
      if (sequenceNumber == undefined) {
        throw new sigchainErrors.ErrorSigchainSequenceNumUndefined();
      }
      return sequenceNumber;
    });
  }

  /**
   * Retrieves a claim from the sigchain. If not found, throws exception.
   * Use if you always expect a claim for this particular sequence number
   * (otherwise, if you want to check for existence, just use getSigchainDb()
   * and check if returned value is undefined).
   * @param sequenceNumber the sequence number of the claim to retrieve
   * @returns the claim (a JWS)
   */
  public async getClaim(sequenceNumber: number): Promise<ClaimEncoded> {
    return await this._transaction(async () => {
      const claim = await this.db.get<ClaimEncoded>(
        this.sigchainClaimsDbDomain,
        claimsUtils.numToLexiString(sequenceNumber) as ClaimId,
      );
      if (claim == undefined) {
        throw new sigchainErrors.ErrorSigchainClaimUndefined();
      }
      return claim;
    });
  }

  public async clearDB() {
    this.sigchainDb.clear();

    await this._transaction(async () => {
      await this.db.put(
        this.sigchainMetadataDbDomain,
        this.sequenceNumberKey,
        0,
      );
    });
  }
}

export default Sigchain;
