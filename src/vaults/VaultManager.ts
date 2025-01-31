import type { DBTransaction, LevelPath } from '@matrixai/db';
import type {
  VaultId,
  VaultName,
  VaultActions,
  VaultIdString,
  VaultIdEncoded,
} from './types';
import type { Vault } from './Vault';
import type { FileSystem } from '../types';
import type { PolykeyWorkerManagerInterface } from '../workers/types';
import type { NodeId } from '../ids/types';
import type KeyRing from '../keys/KeyRing';
import type NodeManager from '../nodes/NodeManager';
import type GestaltGraph from '../gestalts/GestaltGraph';
import type NotificationsManager from '../notifications/NotificationsManager';
import type ACL from '../acl/ACL';
import type { RemoteInfo } from './VaultInternal';
import type { VaultAction } from './types';
import type { LockRequest } from '@matrixai/async-locks';
import type { Key } from '../keys/types';
import path from 'path';
import { DB } from '@matrixai/db';
import { PassThrough } from 'readable-stream';
import { EncryptedFS, errors as encryptedFsErrors } from 'encryptedfs';
import Logger from '@matrixai/logger';
import {
  CreateDestroyStartStop,
  ready,
} from '@matrixai/async-init/dist/CreateDestroyStartStop';
import { IdInternal } from '@matrixai/id';
import { withF, withG } from '@matrixai/resources';
import { LockBox, RWLockWriter } from '@matrixai/async-locks';
import VaultInternal from './VaultInternal';
import * as vaultsEvents from './events';
import * as vaultsUtils from './utils';
import * as vaultsErrors from './errors';
import * as utils from '../utils';
import * as gitUtils from '../git/utils';
import * as gitErrors from '../git/errors';
import * as nodesUtils from '../nodes/utils';
import * as keysUtils from '../keys/utils';
import config from '../config';
import { mkdirExists } from '../utils/utils';

/**
 * Object map pattern for each vault
 */
type VaultMap = Map<VaultIdString, VaultInternal>;

type VaultList = Map<VaultName, VaultId>;
type VaultMetadata = {
  dirty: boolean;
  vaultName: VaultName;
  remoteInfo?: RemoteInfo;
};

interface VaultManager extends CreateDestroyStartStop {}
@CreateDestroyStartStop(
  new vaultsErrors.ErrorVaultManagerRunning(),
  new vaultsErrors.ErrorVaultManagerDestroyed(),
  {
    eventStart: vaultsEvents.EventVaultManagerStart,
    eventStarted: vaultsEvents.EventVaultManagerStarted,
    eventStop: vaultsEvents.EventVaultManagerStop,
    eventStopped: vaultsEvents.EventVaultManagerStopped,
    eventDestroy: vaultsEvents.EventVaultManagerDestroy,
    eventDestroyed: vaultsEvents.EventVaultManagerDestroyed,
  },
)
class VaultManager {
  static async createVaultManager({
    vaultsPath,
    db,
    acl,
    keyRing,
    nodeManager,
    gestaltGraph,
    notificationsManager,
    fs = require('fs'),
    logger = new Logger(this.name),
    fresh = false,
  }: {
    vaultsPath: string;
    db: DB;
    acl: ACL;
    keyRing: KeyRing;
    nodeManager: NodeManager;
    gestaltGraph: GestaltGraph;
    notificationsManager: NotificationsManager;
    fs?: FileSystem;
    logger?: Logger;
    fresh?: boolean;
  }) {
    logger.info(`Creating ${this.name}`);
    logger.info(`Setting vaults path to ${vaultsPath}`);
    const vaultManager = new this({
      vaultsPath,
      db,
      acl,
      keyRing,
      nodeManager,
      gestaltGraph,
      notificationsManager,
      fs,
      logger,
    });
    await vaultManager.start({ fresh });
    logger.info(`Created ${this.name}`);
    return vaultManager;
  }

  public readonly vaultsPath: string;
  public readonly efsPath: string;

  protected fs: FileSystem;
  protected logger: Logger;
  protected db: DB;
  protected acl: ACL;
  protected keyRing: KeyRing;
  protected nodeManager: NodeManager;
  protected gestaltGraph: GestaltGraph;
  protected notificationsManager: NotificationsManager;
  protected vaultsDbPath: LevelPath = [this.constructor.name];
  protected vaultsNamesDbPath: LevelPath = [this.constructor.name, 'names'];
  // VaultId -> VaultMetadata
  protected vaultMap: VaultMap = new Map();
  protected vaultLocks: LockBox<RWLockWriter> = new LockBox();
  protected vaultKey: Buffer;
  protected efsDb: DB;
  protected efs: EncryptedFS;
  protected vaultIdGenerator = vaultsUtils.createVaultIdGenerator();

  constructor({
    vaultsPath,
    db,
    acl,
    keyRing,
    nodeManager,
    gestaltGraph,
    notificationsManager,
    fs,
    logger,
  }: {
    vaultsPath: string;
    db: DB;
    acl: ACL;
    keyRing: KeyRing;
    nodeManager: NodeManager;
    gestaltGraph: GestaltGraph;
    notificationsManager: NotificationsManager;
    fs: FileSystem;
    logger: Logger;
  }) {
    this.logger = logger;
    this.vaultsPath = vaultsPath;
    this.efsPath = path.join(this.vaultsPath, config.paths.efsBase);
    this.db = db;
    this.acl = acl;
    this.keyRing = keyRing;
    this.nodeManager = nodeManager;
    this.gestaltGraph = gestaltGraph;
    this.notificationsManager = notificationsManager;
    this.fs = fs;
  }

  public async start({
    fresh = false,
  }: {
    fresh?: boolean;
  } = {}): Promise<void> {
    await this.db.withTransactionF(async (tran) => {
      try {
        this.logger.info(`Starting ${this.constructor.name}`);
        if (fresh) {
          await tran.clear(this.vaultsDbPath);
          await this.fs.promises.rm(this.vaultsPath, {
            force: true,
            recursive: true,
          });
        }
        await mkdirExists(this.fs, this.vaultsPath);
        const vaultKey = await this.setupKey(tran);
        let efsDb: DB;
        let efs: EncryptedFS;
        try {
          efsDb = await DB.createDB({
            fresh,
            crypto: {
              key: vaultKey,
              ops: {
                encrypt: async (key, plainText) => {
                  return keysUtils.encryptWithKey(
                    utils.bufferWrap(key) as Key,
                    utils.bufferWrap(plainText),
                  );
                },
                decrypt: async (key, cipherText) => {
                  return keysUtils.decryptWithKey(
                    utils.bufferWrap(key) as Key,
                    utils.bufferWrap(cipherText),
                  );
                },
              },
            },
            dbPath: this.efsPath,
            logger: this.logger.getChild('EFS Database'),
          });
          efs = await EncryptedFS.createEncryptedFS({
            fresh,
            db: efsDb,
            logger: this.logger.getChild('EncryptedFileSystem'),
          });
        } catch (e) {
          if (e instanceof encryptedFsErrors.ErrorEncryptedFSKey) {
            throw new vaultsErrors.ErrorVaultManagerKey(e.message, {
              cause: e,
            });
          }
          throw new vaultsErrors.ErrorVaultManagerEFS(e.message, {
            data: {
              errno: e.errno,
              syscall: e.syscall,
              code: e.code,
              path: e.path,
            },
            cause: e,
          });
        }
        this.vaultKey = vaultKey;
        this.efsDb = efsDb;
        this.efs = efs;
        this.logger.info(`Started ${this.constructor.name}`);
      } catch (e) {
        this.logger.warn(`Failed Starting ${this.constructor.name}`);
        await this.efs?.stop();
        await this.efsDb?.stop();
        throw e;
      }
    });
  }

  public async stop(): Promise<void> {
    this.logger.info(`Stopping ${this.constructor.name}`);

    // Iterate over vaults in memory and destroy them, ensuring that
    // the working directory commit state is saved
    const promises: Array<Promise<void>> = [];
    for (const vaultIdString of this.vaultMap.keys()) {
      const vaultId = IdInternal.fromString<VaultId>(vaultIdString);
      promises.push(
        withF(
          [this.vaultLocks.lock([vaultId.toString(), RWLockWriter, 'write'])],
          async () => {
            const vault = this.vaultMap.get(vaultIdString);
            if (vault == null) return;
            await vault.stop();
            this.vaultMap.delete(vaultIdString);
          },
        ),
      );
    }
    await Promise.all(promises);
    await this.efs.stop();
    await this.efsDb.stop();
    this.vaultMap = new Map();
    this.logger.info(`Stopped ${this.constructor.name}`);
  }

  public async destroy(): Promise<void> {
    this.logger.info(`Destroying ${this.constructor.name}`);
    await this.efsDb.start({
      fresh: false,
      crypto: {
        key: this.vaultKey,
        ops: {
          encrypt: async (key, plainText) => {
            return keysUtils.encryptWithKey(
              utils.bufferWrap(key) as Key,
              utils.bufferWrap(plainText),
            );
          },
          decrypt: async (key, cipherText) => {
            return keysUtils.decryptWithKey(
              utils.bufferWrap(key) as Key,
              utils.bufferWrap(cipherText),
            );
          },
        },
      },
    });
    await this.efs.destroy();
    await this.efsDb.stop();
    await this.efsDb.destroy();
    // Clearing all vaults db data
    await this.db.clear(this.vaultsDbPath);
    // Is it necessary to remove the vaults' domain?
    await this.fs.promises.rm(this.vaultsPath, {
      force: true,
      recursive: true,
    });
    this.logger.info(`Destroyed ${this.constructor.name}`);
  }

  public setWorkerManager(workerManager: PolykeyWorkerManagerInterface) {
    this.efs.setWorkerManager(workerManager);
  }

  public unsetWorkerManager() {
    this.efs.unsetWorkerManager();
  }

  /**
   * Constructs a new vault instance with a given name and
   * stores it in memory
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async createVault(
    vaultName: VaultName,
    tran?: DBTransaction,
  ): Promise<VaultId> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.createVault(vaultName, tran),
      );
    }
    // Adding vault to name map
    const vaultId = await this.generateVaultId();
    await tran.lock([...this.vaultsNamesDbPath, vaultName].join(''));
    const vaultIdBuffer = await tran.get(
      [...this.vaultsNamesDbPath, vaultName],
      true,
    );
    // Check if the vault name already exists;
    if (vaultIdBuffer != null) {
      throw new vaultsErrors.ErrorVaultsVaultDefined();
    }
    await tran.put(
      [...this.vaultsNamesDbPath, vaultName],
      vaultId.toBuffer(),
      true,
    );
    const vaultIdString = vaultId.toString() as VaultIdString;
    return await this.vaultLocks.withF(
      [vaultId.toString(), RWLockWriter, 'write'],
      async () => {
        // Creating vault
        const vault = await VaultInternal.createVaultInternal({
          vaultId,
          vaultName,
          keyRing: this.keyRing,
          efs: this.efs,
          logger: this.logger.getChild(VaultInternal.name),
          db: this.db,
          vaultsDbPath: this.vaultsDbPath,
          fresh: true,
          tran,
        });
        // Adding vault to object map
        this.vaultMap.set(vaultIdString, vault);
        return vault.vaultId;
      },
    );
  }

  /**
   * Retrieves the vault metadata using the VaultId
   * and parses it to return the associated vault name
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async getVaultMeta(
    vaultId: VaultId,
    tran?: DBTransaction,
  ): Promise<VaultMetadata | undefined> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getVaultMeta(vaultId, tran),
      );
    }

    // First check if the metadata exists
    const vaultIdEncoded = vaultsUtils.encodeVaultId(vaultId);
    const vaultDbPath: LevelPath = [...this.vaultsDbPath, vaultIdEncoded];
    // Return if metadata has no data
    if ((await tran.count(vaultDbPath)) === 0) return;
    // Obtain the metadata;
    const dirty = (await tran.get<boolean>([
      ...vaultDbPath,
      VaultInternal.dirtyKey,
    ]))!;
    const vaultName = (await tran.get<VaultName>([
      ...vaultDbPath,
      VaultInternal.nameKey,
    ]))!;
    const remoteInfo = await tran.get<RemoteInfo>([
      ...vaultDbPath,
      VaultInternal.remoteKey,
    ]);
    return {
      dirty,
      vaultName,
      remoteInfo,
    };
  }

  /**
   * Removes the metadata and EFS state of a vault using a
   * given VaultId
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async destroyVault(
    vaultId: VaultId,
    tran?: DBTransaction,
  ): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.destroyVault(vaultId, tran),
      );
    }

    await this.vaultLocks.withF(
      [vaultId.toString(), RWLockWriter, 'write'],
      async () => {
        await tran.lock([...this.vaultsDbPath, vaultId].join(''));
        // Ensure protection from write skew
        await tran.getForUpdate([
          ...this.vaultsDbPath,
          vaultsUtils.encodeVaultId(vaultId),
          VaultInternal.nameKey,
        ]);
        const vaultMeta = await this.getVaultMeta(vaultId, tran);
        if (vaultMeta == null) return;
        const vaultName = vaultMeta.vaultName;
        this.logger.info(
          `Destroying Vault ${vaultsUtils.encodeVaultId(vaultId)}`,
        );
        const vaultIdString = vaultId.toString() as VaultIdString;
        const vault = await this.getVault(vaultId, tran);
        // Destroying vault state and metadata
        await vault.stop();
        await vault.destroy(tran);
        // Removing from map
        this.vaultMap.delete(vaultIdString);
        // Removing name->id mapping
        await tran.del([...this.vaultsNamesDbPath, vaultName]);
      },
    );
    this.logger.info(`Destroyed Vault ${vaultsUtils.encodeVaultId(vaultId)}`);
  }

  /**
   * Removes vault from the vault map
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async closeVault(
    vaultId: VaultId,
    tran?: DBTransaction,
  ): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) => this.closeVault(vaultId, tran));
    }

    if ((await this.getVaultName(vaultId, tran)) == null) {
      throw new vaultsErrors.ErrorVaultsVaultUndefined();
    }
    const vaultIdString = vaultId.toString() as VaultIdString;
    await this.vaultLocks.withF(
      [vaultId.toString(), RWLockWriter, 'write'],
      async () => {
        await tran.lock([...this.vaultsDbPath, vaultId].join(''));
        const vault = await this.getVault(vaultId, tran);
        await vault.stop();
        this.vaultMap.delete(vaultIdString);
      },
    );
  }

  /**
   * Lists the vault name and associated VaultId of all
   * the vaults stored
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async listVaults(tran?: DBTransaction): Promise<VaultList> {
    if (tran == null) {
      return this.db.withTransactionF((tran) => this.listVaults(tran));
    }

    const vaults: VaultList = new Map();
    // Stream of vaultName VaultId key value pairs
    for await (const [vaultNameBuffer, vaultIdBuffer] of tran.iterator(
      this.vaultsNamesDbPath,
    )) {
      const vaultName = vaultNameBuffer.toString() as VaultName;
      const vaultId = IdInternal.fromBuffer<VaultId>(vaultIdBuffer);
      vaults.set(vaultName, vaultId);
    }
    return vaults;
  }

  /**
   * Changes the vault name metadata of a VaultId
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async renameVault(
    vaultId: VaultId,
    newVaultName: VaultName,
    tran?: DBTransaction,
  ): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.renameVault(vaultId, newVaultName, tran),
      );
    }

    await this.vaultLocks.withF(
      [vaultId.toString(), RWLockWriter, 'write'],
      async () => {
        await tran.lock(
          [...this.vaultsNamesDbPath, newVaultName]
            .map((v) => v.toString())
            .join(''),
          [...this.vaultsDbPath, vaultId].map((v) => v.toString()).join(''),
        );
        this.logger.info(
          `Renaming Vault ${vaultsUtils.encodeVaultId(vaultId)}`,
        );
        // Checking if new name exists
        if (await this.getVaultId(newVaultName, tran)) {
          throw new vaultsErrors.ErrorVaultsVaultDefined();
        }
        // Ensure protection from write skew
        await tran.getForUpdate([
          ...this.vaultsDbPath,
          vaultsUtils.encodeVaultId(vaultId),
          VaultInternal.nameKey,
        ]);
        // Checking if vault exists
        const vaultMetadata = await this.getVaultMeta(vaultId, tran);
        if (vaultMetadata == null) {
          throw new vaultsErrors.ErrorVaultsVaultUndefined();
        }
        const oldVaultName = vaultMetadata.vaultName;
        // Updating metadata with new name;
        const vaultDbPath = [
          ...this.vaultsDbPath,
          vaultsUtils.encodeVaultId(vaultId),
        ];
        await tran.put([...vaultDbPath, VaultInternal.nameKey], newVaultName);
        // Updating name->id map
        await tran.del([...this.vaultsNamesDbPath, oldVaultName]);
        await tran.put(
          [...this.vaultsNamesDbPath, newVaultName],
          vaultId.toBuffer(),
          true,
        );
      },
    );
  }

  /**
   * Retrieves the VaultId associated with a vault name
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async getVaultId(
    vaultName: VaultName,
    tran?: DBTransaction,
  ): Promise<VaultId | undefined> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getVaultId(vaultName, tran),
      );
    }

    await tran.lock([...this.vaultsNamesDbPath, vaultName].join(''));
    const vaultIdBuffer = await tran.get(
      [...this.vaultsNamesDbPath, vaultName],
      true,
    );
    if (vaultIdBuffer == null) return;
    return IdInternal.fromBuffer<VaultId>(vaultIdBuffer);
  }

  /**
   * Retrieves the vault name associated with a VaultId
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async getVaultName(
    vaultId: VaultId,
    tran?: DBTransaction,
  ): Promise<VaultName | undefined> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getVaultName(vaultId, tran),
      );
    }
    const metadata = await this.getVaultMeta(vaultId, tran);
    return metadata?.vaultName;
  }

  /**
   * Returns a dictionary of VaultActions for each node
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async getVaultPermission(
    vaultId: VaultId,
    tran?: DBTransaction,
  ): Promise<Record<NodeId, VaultActions>> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getVaultPermission(vaultId, tran),
      );
    }

    const rawPermissions = await this.acl.getVaultPerm(vaultId, tran);
    const permissions: Record<NodeId, VaultActions> = {};
    // Getting the relevant information
    for (const nodeId in rawPermissions) {
      permissions[nodeId] = rawPermissions[nodeId].vaults[vaultId];
    }
    return permissions;
  }

  /**
   * Sets clone, pull and scan permissions of a vault for a
   * gestalt and send a notification to this gestalt
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async shareVault(
    vaultId: VaultId,
    nodeId: NodeId,
    tran?: DBTransaction,
  ): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.shareVault(vaultId, nodeId, tran),
      );
    }

    const vaultMeta = await this.getVaultMeta(vaultId, tran);
    if (vaultMeta == null) throw new vaultsErrors.ErrorVaultsVaultUndefined();
    // NodeId permissions translated to other nodes in
    // a gestalt by other domains
    await this.gestaltGraph.setGestaltAction(['node', nodeId], 'scan', tran);
    await this.acl.setVaultAction(vaultId, nodeId, 'pull', tran);
    await this.acl.setVaultAction(vaultId, nodeId, 'clone', tran);
    await this.notificationsManager.sendNotification(nodeId, {
      type: 'VaultShare',
      vaultId: vaultsUtils.encodeVaultId(vaultId),
      vaultName: vaultMeta.vaultName,
      actions: {
        clone: null,
        pull: null,
      },
    });
  }

  /**
   * Unsets clone, pull and scan permissions of a vault for a
   * gestalt
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async unshareVault(
    vaultId: VaultId,
    nodeId: NodeId,
    tran?: DBTransaction,
  ): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.unshareVault(vaultId, nodeId, tran),
      );
    }

    const vaultMeta = await this.getVaultMeta(vaultId, tran);
    if (!vaultMeta) throw new vaultsErrors.ErrorVaultsVaultUndefined();
    await this.gestaltGraph.unsetGestaltAction(['node', nodeId], 'scan', tran);
    await this.acl.unsetVaultAction(vaultId, nodeId, 'pull', tran);
    await this.acl.unsetVaultAction(vaultId, nodeId, 'clone', tran);
  }

  /**
   * Clones the contents of a remote vault into a new local
   * vault instance
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async cloneVault(
    nodeId: NodeId,
    vaultNameOrId: VaultId | VaultName,
    tran?: DBTransaction,
    force: boolean = false,
  ): Promise<VaultId> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.cloneVault(nodeId, vaultNameOrId, tran),
      );
    }

    const vaultId = await this.generateVaultId();
    const vaultIdString = vaultId.toString() as VaultIdString;
    this.logger.info(
      `Cloning Vault ${vaultsUtils.encodeVaultId(vaultId)} on Node ${nodeId}`,
    );
    return await this.vaultLocks.withF(
      [vaultId.toString(), RWLockWriter, 'write'],
      async () => {
        const vault = await VaultInternal.cloneVaultInternal({
          targetNodeId: nodeId,
          targetVaultNameOrId: vaultNameOrId,
          vaultId,
          db: this.db,
          nodeManager: this.nodeManager,
          vaultsDbPath: this.vaultsDbPath,
          keyRing: this.keyRing,
          efs: this.efs,
          logger: this.logger.getChild(VaultInternal.name),
          tran,
        });
        this.vaultMap.set(vaultIdString, vault);
        const vaultMetadata = (await this.getVaultMeta(vaultId, tran))!;
        const baseVaultName = vaultMetadata.vaultName;
        // Need to check if the name is taken, 10 attempts
        let newVaultName = baseVaultName;

        // Get the list of existing vaults
        const existingVaults = await this.listVaults(tran);

        if (existingVaults.has(newVaultName)) {
          if (force) {
            newVaultName = `${newVaultName}_1`;
          } else {
            throw new vaultsErrors.ErrorVaultsNameConflict(
              `A vault with the name '${newVaultName}' already exists. Use --override to force cloning.`,
            );
          }
        }

        let attempts = 1;
        while (true) {
          const existingVaultId = await tran.get([
            ...this.vaultsNamesDbPath,
            newVaultName,
          ]);
          if (existingVaultId == null) break;
          newVaultName = `${baseVaultName}-${attempts}`;
          if (attempts >= 50) {
            throw new vaultsErrors.ErrorVaultsNameConflict(
              `Too many copies of ${baseVaultName}`,
            );
          }
          attempts++;
        }
        // Set the vaultName -> vaultId mapping
        await tran.put(
          [...this.vaultsNamesDbPath, newVaultName],
          vaultId.toBuffer(),
          true,
        );
        // Update vault metadata
        await tran.put(
          [
            ...this.vaultsDbPath,
            vaultsUtils.encodeVaultId(vaultId),
            VaultInternal.nameKey,
          ],
          newVaultName,
        );
        this.logger.info(
          `Cloned Vault ${vaultsUtils.encodeVaultId(
            vaultId,
          )} on Node ${nodeId}`,
        );
        return vault.vaultId;
      },
    );
  }

  /**
   * Pulls the contents of a remote vault into an existing vault
   * instance
   */
  public async pullVault({
    vaultId,
    pullNodeId,
    pullVaultNameOrId,
    tran,
  }: {
    vaultId: VaultId;
    pullNodeId?: NodeId;
    pullVaultNameOrId?: VaultId | VaultName;
    tran?: DBTransaction;
  }): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.pullVault({ vaultId, pullNodeId, pullVaultNameOrId, tran }),
      );
    }

    if ((await this.getVaultName(vaultId, tran)) == null) return;
    await this.vaultLocks.withF(
      [vaultId.toString(), RWLockWriter, 'write'],
      async () => {
        await tran.lock([...this.vaultsDbPath, vaultId].join(''));
        const vault = await this.getVault(vaultId, tran);
        await vault.pullVault({
          nodeManager: this.nodeManager,
          pullNodeId,
          pullVaultNameOrId,
          tran,
        });
      },
    );
  }

  /**
   * Handler for receiving http GET requests when being
   * cloned or pulled from
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async *handleInfoRequest(
    vaultId: VaultId,
    tran?: DBTransaction,
  ): AsyncGenerator<Buffer> {
    if (tran == null) {
      const handleInfoRequest = (tran) => this.handleInfoRequest(vaultId, tran);
      return yield* this.db.withTransactionG(async function* (tran) {
        return yield* handleInfoRequest(tran);
      });
    }
    const efs = this.efs;
    const vault = await this.getVault(vaultId, tran);
    return yield* withG(
      [
        this.vaultLocks.lock([vaultId.toString(), RWLockWriter, 'read']),
        vault.getLock().read(),
      ],
      async function* (): AsyncGenerator<Buffer, void> {
        // Adherence to git protocol
        yield Buffer.from(
          gitUtils.createGitPacketLine('# service=git-upload-pack\n'),
        );
        yield Buffer.from('0000');
        // Read the commit state of the vault
        const uploadPack = await gitUtils.uploadPack({
          fs: efs,
          dir: path.join(vaultsUtils.encodeVaultId(vaultId), 'contents'),
          gitdir: path.join(vaultsUtils.encodeVaultId(vaultId), '.git'),
          advertiseRefs: true,
        });
        for (const buffer of uploadPack) {
          yield buffer;
        }
      },
    );
  }

  /**
   * Handler for receiving http POST requests when being
   * cloned or pulled from
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async handlePackRequest(
    vaultId: VaultId,
    body: Buffer,
    tran?: DBTransaction,
  ): Promise<[PassThrough, PassThrough]> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.handlePackRequest(vaultId, body, tran),
      );
    }

    const vault = await this.getVault(vaultId, tran);
    return await withF(
      [
        this.vaultLocks.lock([vaultId.toString(), RWLockWriter, 'read']),
        vault.getLock().read(),
      ],
      async () => {
        if (body.toString().slice(4, 8) === 'want') {
          // Parse the request to get the wanted git object
          const wantedObjectId = body.toString().slice(9, 49);
          const packResult = await gitUtils.packObjects({
            fs: this.efs,
            dir: path.join(vaultsUtils.encodeVaultId(vaultId), 'contents'),
            gitdir: path.join(vaultsUtils.encodeVaultId(vaultId), '.git'),
            refs: [wantedObjectId],
          });
          // Generate a contents and progress stream
          const readable = new PassThrough();
          const progressStream = new PassThrough();
          const sideBand = gitUtils.mux(
            'side-band-64',
            readable,
            packResult.packstream,
            progressStream,
          );
          return [sideBand, progressStream];
        } else {
          throw new gitErrors.ErrorGitUnimplementedMethod(
            `Request of type '${body
              .toString()
              .slice(4, 8)}' not valid, expected 'want'`,
          );
        }
      },
    );
  }

  /**
   * Retrieves all the vaults for a peers node
   */
  public async *scanVaults(targetNodeId: NodeId): AsyncGenerator<{
    vaultName: VaultName;
    vaultIdEncoded: VaultIdEncoded;
    vaultPermissions: VaultAction[];
  }> {
    // Create a connection to another node
    return yield* this.nodeManager.withConnG(
      targetNodeId,
      async function* (connection): AsyncGenerator<{
        vaultName: VaultName;
        vaultIdEncoded: VaultIdEncoded;
        vaultPermissions: VaultAction[];
      }> {
        const client = connection.getClient();
        const genReadable = await client.methods.vaultsScan({});
        for await (const vault of genReadable) {
          const vaultName = vault.vaultName;
          const vaultIdEncoded = vault.vaultIdEncoded;
          const vaultPermissions = vault.vaultPermissions;
          yield { vaultName, vaultIdEncoded, vaultPermissions };
        }
      },
    );
  }

  /**
   * Returns all the shared vaults for a NodeId.
   */
  public async *handleScanVaults(
    nodeId: NodeId,
    tran?: DBTransaction,
  ): AsyncGenerator<{
    vaultId: VaultId;
    vaultName: VaultName;
    vaultPermissions: VaultAction[];
  }> {
    if (tran == null) {
      // Lambda to maintain `this` context
      const handleScanVaults = (tran) => this.handleScanVaults(nodeId, tran);
      return yield* this.db.withTransactionG(async function* (tran) {
        return yield* handleScanVaults(tran);
      });
    }

    // Checking permission
    const nodeIdEncoded = nodesUtils.encodeNodeId(nodeId);
    const permissions = await this.acl.getNodePerm(nodeId, tran);
    if (permissions == null) {
      throw new vaultsErrors.ErrorVaultsPermissionDenied(
        `No permissions found for ${nodeIdEncoded}`,
      );
    }
    if (permissions.gestalt.scan === undefined) {
      throw new vaultsErrors.ErrorVaultsPermissionDenied(
        `Scanning is not allowed for ${nodeIdEncoded}`,
      );
    }

    // Getting the list of vaults
    const vaults = permissions.vaults;
    for (const vaultIdString of Object.keys(vaults)) {
      // Getting vault permissions
      const vaultId = IdInternal.fromString<VaultId>(vaultIdString);
      const vaultPermissions = Object.keys(
        vaults[vaultIdString],
      ) as VaultAction[];
      // Getting the vault name
      const metadata = await this.getVaultMeta(vaultId, tran);
      const vaultName = metadata!.vaultName;
      const element = {
        vaultId,
        vaultName,
        vaultPermissions,
      };
      yield element;
    }
  }

  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  protected async generateVaultId(): Promise<VaultId> {
    let vaultId = this.vaultIdGenerator();
    let i = 0;
    while (await this.efs.exists(vaultsUtils.encodeVaultId(vaultId))) {
      i++;
      if (i > 50) {
        throw new vaultsErrors.ErrorVaultsCreateVaultId(
          'Could not create a unique vaultId after 50 attempts',
        );
      }
      vaultId = this.vaultIdGenerator();
    }
    return vaultId;
  }

  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  protected async getVault(
    vaultId: VaultId,
    tran: DBTransaction,
  ): Promise<VaultInternal> {
    if (tran == null) {
      return this.db.withTransactionF((tran) => this.getVault(vaultId, tran));
    }
    const vaultIdString = vaultId.toString() as VaultIdString;
    // 1. get the vault, if it exists then return that
    const vault = this.vaultMap.get(vaultIdString);
    if (vault != null) return vault;
    // No vault or state exists then we throw error?
    if ((await this.getVaultMeta(vaultId, tran)) == null) {
      throw new vaultsErrors.ErrorVaultsVaultUndefined(
        `Vault ${vaultsUtils.encodeVaultId(vaultId)} doesn't exist`,
      );
    }
    // 2. if the state exists then create, add to map and return that
    const newVault = await VaultInternal.createVaultInternal({
      vaultId,
      keyRing: this.keyRing,
      efs: this.efs,
      logger: this.logger.getChild(VaultInternal.name),
      db: this.db,
      vaultsDbPath: this.vaultsDbPath,
      tran,
    });
    this.vaultMap.set(vaultIdString, newVault);
    return newVault;
  }

  /**
   * Takes a function and runs it with the listed vaults. locking is handled automatically
   * @param vaultIds List of vault ID for vaults you wish to use
   * @param f Function you wish to run with the provided vaults
   * @param tran
   */
  @ready(new vaultsErrors.ErrorVaultManagerNotRunning())
  public async withVaults<T>(
    vaultIds: VaultId[],
    f: (...args: Vault[]) => Promise<T>,
    tran?: DBTransaction,
  ): Promise<T> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.withVaults(vaultIds, f, tran),
      );
    }

    // Obtaining locks
    const vaultLocks: Array<LockRequest<RWLockWriter>> = vaultIds.map(
      (vaultId) => {
        return [vaultId.toString(), RWLockWriter, 'read'];
      },
    );
    // Running the function with locking
    return await this.vaultLocks.withF(...vaultLocks, async () => {
      // Getting the vaults while locked
      const vaults = await Promise.all(
        vaultIds.map(async (vaultId) => {
          return await this.getVault(vaultId, tran);
        }),
      );
      return await f(...vaults);
    });
  }

  protected async setupKey(tran: DBTransaction): Promise<Buffer> {
    let key: Buffer | undefined;
    key = await tran.get([...this.vaultsDbPath, 'key'], true);
    // If the EFS already exists, but the key doesn't, then we have lost the key
    if (key == null && (await this.existsEFS())) {
      throw new vaultsErrors.ErrorVaultManagerKey();
    }
    if (key != null) {
      return key;
    }
    this.logger.info('Generating vaults key');
    key = keysUtils.generateKey();
    await tran.put([...this.vaultsDbPath, 'key'], key, true);
    return key;
  }

  protected async existsEFS(): Promise<boolean> {
    try {
      return (await this.fs.promises.readdir(this.efsPath)).length > 0;
    } catch (e) {
      if (e.code === 'ENOENT') {
        return false;
      }
      throw new vaultsErrors.ErrorVaultManagerEFS(e.message, {
        data: {
          errno: e.errno,
          syscall: e.syscall,
          code: e.code,
          path: e.path,
        },
        cause: e,
      });
    }
  }
}

export default VaultManager;
