import type { SessionToken } from './types';

import * as grpc from '@grpc/grpc-js';
import * as sessionErrors from './errors';
import * as clientErrors from '../client/errors';

import Logger from '@matrixai/logger';

import { DB } from '@matrixai/db';
import { Mutex } from 'async-mutex';
import { utils as keyUtils } from '../keys';
import { ErrorKeyManagerDestroyed } from '../errors';
import { createPrivateKey, createPublicKey } from 'crypto';

import * as sessionUtils from './utils';
import { CreateDestroy, ready } from '@matrixai/async-init/dist/CreateDestroy';

/**
 * This class is created in the PolykeyAgent, and is responsible for the verification
 * of session tokens
 */
interface SessionManager extends CreateDestroy {}
@CreateDestroy()
class SessionManager {
  private _db: DB;
  private _bits: number;
  private logger: Logger;

  protected lock: Mutex = new Mutex();

  static async createSessionManager({
    db,
    bits,
    logger,
  }: {
    db: DB;
    bits: number;
    logger?: Logger;
  }): Promise<SessionManager> {
    const logger_ = logger ?? new Logger('SessionManager');

    const sessionManager = new SessionManager({ db, logger: logger_ });
    await sessionManager.create({ bits });
    return sessionManager;
  }

  /**
   * Construct a SessionManager object
   * @param logger Logger
   */
  constructor({ db, logger }: { db: DB; logger?: Logger }) {
    this._db = db;
    this.logger = logger ?? new Logger('SessionManager');
  }

  /**
   * Start the SessionManager object, stores a keyPair in the DB if one
   * is not already stored there.
   */
  private async create({ bits }: { bits: number }) {
    this.logger.info('Starting SessionManager');
    this._bits = bits;
    // If db does not contain private key, create one and store it.
    if (!(await this._db.get<string>([this.constructor.name], 'privateKey'))) {
      const keyPair = await keyUtils.generateKeyPair(bits);
      this.logger.info('Putting keypair into DB');
      await this._db.put(
        [this.constructor.name],
        'privateKey',
        keyUtils.privateKeyToPem(keyPair.privateKey),
      );
    }
    this.logger.info('Started SessionManager');
  }

  /**
   * Destroys the SessionManager object
   */
  public async destroy() {
    this.logger.info('Destroyed SessionManager');
  }

  /**
   * Creates a new keypair and stores it in the db
   */
  @ready(new ErrorKeyManagerDestroyed())
  public async refreshKey() {
    await this._transaction(async () => {
      const keyPair = await keyUtils.generateKeyPair(this._bits);
      this.logger.info('Putting new keypair into DB');
      await this._db.put(
        [this.constructor.name],
        'privateKey',
        keyUtils.privateKeyToPem(keyPair.privateKey),
      );
    });
  }

  /**
   * Generates a JWT token based on the private key in the db
   * @param expiry refer to https://github.com/panva/jose/blob/cdce59a340b87b681a003ca28a9116c1f11d3f12/docs/classes/jwt_sign.signjwt.md#setexpirationtime
   * @returns
   */
  @ready(new ErrorKeyManagerDestroyed())
  public async generateToken(expiry: string | number = '1h') {
    return await this._transaction(async () => {
      const payload = {
        token: await sessionUtils.generateRandomPayload(),
      };
      const privateKeyPem = await this._db.get<string>(
        [this.constructor.name],
        'privateKey',
      );
      if (privateKeyPem == null) {
        throw new sessionErrors.ErrorReadingPrivateKey();
      }
      return await sessionUtils.createSessionToken(
        payload,
        expiry,
        createPrivateKey(privateKeyPem),
      );
    });
  }

  /**
   * Verifies token stored in a grpc.Metadata object, stored under the
   * 'Authorization' tag, in the form "Bearer: <token>"
   * @param meta Metadata from grpc call
   */
  @ready(new ErrorKeyManagerDestroyed())
  public async verifyMetadataToken(meta: grpc.Metadata) {
    const auth = meta.get('Authorization').pop();
    if (auth == null) {
      throw new clientErrors.ErrorClientJWTTokenNotProvided();
    }
    const token = auth.toString().split(' ')[1];
    await this.verifyToken(token as SessionToken);
  }

  /**
   * Verifies a Token based on the public key derived from the private key
   * in the db
   * @throws ErrorSessionTokenInvalid
   * @throws ErrorSessionManaagerNotStarted
   * @param claim
   * @returns
   */
  @ready(new ErrorKeyManagerDestroyed())
  public async verifyToken(claim: SessionToken) {
    return await this._transaction(async () => {
      const privateKeyPem = await this._db.get<string>(
        [this.constructor.name],
        'privateKey',
      );
      if (privateKeyPem == null) {
        throw new sessionErrors.ErrorReadingPrivateKey();
      }
      const privateKey = keyUtils.privateKeyFromPem(privateKeyPem);
      const publicKey = keyUtils.publicKeyFromPrivateKey(privateKey);

      const jwtPublicKey = createPublicKey(keyUtils.publicKeyToPem(publicKey));
      try {
        return await sessionUtils.verifySessionToken(claim, jwtPublicKey);
      } catch (err) {
        throw new sessionErrors.ErrorSessionTokenInvalid();
      }
    });
  }

  public get locked(): boolean {
    return this.lock.isLocked();
  }

  /**
   * Run several operations within the same lock
   * This does not ensure atomicity of the underlying database
   * Database atomicity still depends on the underlying operation
   */
  protected async transaction<T>(
    f: (SessionManager: SessionManager) => Promise<T>,
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
}

export default SessionManager;
