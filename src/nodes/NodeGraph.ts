import type { DB, DBTransaction, LevelPath } from '@matrixai/db';
import type {
  NodeId,
  NodeAddress,
  NodeBucket,
  NodeContact,
  NodeContactAddress,
  NodeContactAddressData,
  NodeBucketMeta,
  NodeBucketIndex,
  NodeGraphSpace,
} from './types';
import type KeyRing from '../keys/KeyRing';
import Logger from '@matrixai/logger';
import {
  CreateDestroyStartStop,
  ready,
} from '@matrixai/async-init/dist/CreateDestroyStartStop';
import { IdInternal } from '@matrixai/id';
import * as nodesUtils from './utils';
import * as nodesErrors from './errors';
import * as nodesEvents from './events';
import * as utils from '../utils';
import config from '../config';

/**
 * NodeGraph is an implementation of Kademlia for maintaining peer to peer
 * information about Polkey nodes.
 *
 * It is a database of fixed-size buckets, where each bucket
 * contains NodeId -> NodeData. The bucket index is a prefix key.
 * This means the data is ordered in terms of bucket index, and then node ID.
 * From lowest to highest.
 *
 * The NodeGraph is partitioned into 2 spaces. The reason to do this is allow
 * transactional resetting of the buckets if the own node ID changes.
 *
 * When the node ID changes, either due to key renewal or reset, we remap all
 * existing records to the other space, and then we swap the active space key.
 */
interface NodeGraph extends CreateDestroyStartStop {}
@CreateDestroyStartStop(
  new nodesErrors.ErrorNodeGraphRunning(),
  new nodesErrors.ErrorNodeGraphDestroyed(),
  {
    eventStart: nodesEvents.EventNodeGraphStart,
    eventStarted: nodesEvents.EventNodeGraphStarted,
    eventStop: nodesEvents.EventNodeGraphStop,
    eventStopped: nodesEvents.EventNodeGraphStopped,
    eventDestroy: nodesEvents.EventNodeGraphDestroy,
    eventDestroyed: nodesEvents.EventNodeGraphDestroyed,
  },
)
class NodeGraph {
  public static async createNodeGraph({
    db,
    keyRing,
    nodeIdBits = 256,
    nodeBucketLimit = config.defaultsSystem.nodesGraphBucketLimit,
    logger = new Logger(this.name),
    fresh = false,
  }: {
    db: DB;
    keyRing: KeyRing;
    nodeIdBits?: number;
    nodeBucketLimit?: number;
    logger?: Logger;
    fresh?: boolean;
  }): Promise<NodeGraph> {
    logger.info(`Creating ${this.name}`);
    const nodeGraph = new this({
      db,
      keyRing,
      nodeIdBits,
      nodeBucketLimit,
      logger,
    });
    await nodeGraph.start({ fresh });
    logger.info(`Created ${this.name}`);
    return nodeGraph;
  }

  /**
   * Bit size of the node IDs.
   * This is also the total number of buckets.
   */
  public readonly nodeIdBits: number;

  /**
   * Max number of nodes in each bucket.
   */
  public readonly nodeBucketLimit: number;

  protected logger: Logger;
  protected db: DB;
  protected keyRing: KeyRing;
  protected space: NodeGraphSpace;

  protected nodeGraphDbPath: LevelPath = [this.constructor.name];
  /**
   * Meta stores the `keyof NodeBucketMeta` -> `NodeBucketMeta[keyof NodeBucketMeta]`.
   */
  protected nodeGraphMetaDbPath: LevelPath;
  /**
   * Buckets stores `lexi(NodeBucketIndex)/NodeId/nodeContactAddress` -> `NodeContactAddressData`.
   *
   * nodeContactAddress are canoncialized to be consistent.
   */
  protected nodeGraphBucketsDbPath: LevelPath;
  /**
   * Last updated stores
   * `lexi(NodeBucketIndex)/"time"/lexi(connectedTime)/nodeId` -> `nodeId`.
   * `lexi(NodeBucketIndex)/"nodeId"/nodeId` -> `lexi(connectedTime)`.
   */
  protected nodeGraphConnectedDbPath: LevelPath;

  constructor({
    db,
    keyRing,
    nodeIdBits,
    nodeBucketLimit,
    logger,
  }: {
    db: DB;
    keyRing: KeyRing;
    nodeIdBits: number;
    nodeBucketLimit: number;
    logger: Logger;
  }) {
    this.logger = logger;
    this.db = db;
    this.keyRing = keyRing;
    this.nodeIdBits = nodeIdBits;
    this.nodeBucketLimit = nodeBucketLimit;
  }

  public async start({
    fresh = false,
  }: { fresh?: boolean } = {}): Promise<void> {
    this.logger.info(`Starting ${this.constructor.name}`);
    const space = await this.db.withTransactionF(async (tran) => {
      if (fresh) {
        await tran.clear(this.nodeGraphDbPath);
      }
      // Space key is used to create a swappable sublevel
      // when remapping the buckets during `this.resetBuckets`
      return await this.setupSpace(tran);
    });
    // Bucket metadata sublevel: `!meta<space>!<lexi(NodeBucketIndex)>!<key> -> value`
    this.nodeGraphMetaDbPath = [...this.nodeGraphDbPath, 'meta' + space];
    // Bucket sublevel: `!buckets<space>!<lexi(NodeBucketIndex)>!<NodeId> -> NodeData`
    // The BucketIndex can range from 0 to NodeId bit-size minus 1
    // So 256 bits means 256 buckets of 0 to 255
    this.nodeGraphBucketsDbPath = [...this.nodeGraphDbPath, 'buckets' + space];
    // Last updated sublevel: `!connected<space>!<lexi(NodeBucketIndex)>!<lexi(contected)>-<NodeId> -> NodeId`
    // This is used as a sorted index of the NodeId by `connected` timestamp
    // The `NodeId` must be appended in the key in order to disambiguate `NodeId` with same `connected` timestamp
    this.nodeGraphConnectedDbPath = [
      ...this.nodeGraphDbPath,
      'connected' + space,
    ];
    this.space = space;
    this.logger.info(`Started ${this.constructor.name}`);
  }

  public async stop(): Promise<void> {
    this.logger.info(`Stopping ${this.constructor.name}`);
    this.logger.info(`Stopped ${this.constructor.name}`);
  }

  public async destroy(): Promise<void> {
    this.logger.info(`Destroying ${this.constructor.name}`);
    await this.db.clear(this.nodeGraphDbPath);
    this.logger.info(`Destroyed ${this.constructor.name}`);
  }

  /**
   * Sets up the space key
   * The space string is suffixed to the `buckets` and `meta` sublevels
   * This is used to allow swapping of sublevels when remapping buckets
   * during `this.resetBuckets`
   */
  protected async setupSpace(tran: DBTransaction): Promise<NodeGraphSpace> {
    let space = await tran.get<NodeGraphSpace>([
      ...this.nodeGraphDbPath,
      'space',
    ]);
    if (space != null) {
      return space;
    }
    space = '0';
    await tran.put([...this.nodeGraphDbPath, 'space'], space);
    return space;
  }

  /**
   * Derive the bucket index of the k-buckets from the new `NodeId`
   * The bucket key is the string encoded version of bucket index
   * that preserves lexicographic order
   */
  public bucketIndex(nodeId: NodeId): [NodeBucketIndex, string] {
    const nodeIdOwn = this.keyRing.getNodeId();
    if (nodeId.equals(nodeIdOwn)) {
      throw new nodesErrors.ErrorNodeGraphSameNodeId();
    }
    const bucketIndex = nodesUtils.bucketIndex(nodeIdOwn, nodeId);
    const bucketKey = nodesUtils.bucketKey(bucketIndex);
    return [bucketIndex, bucketKey];
  }

  /**
   * Locks the bucket index for exclusive operations.
   * This allows you sequence operations for any bucket.
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async lockBucket(bucketIndex: number, tran: DBTransaction) {
    const keyPath = [
      ...this.nodeGraphMetaDbPath,
      nodesUtils.bucketKey(bucketIndex),
    ];
    return await tran.lock(keyPath.join(''));
  }

  /**
   * Get a single `NodeContact`
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async getNodeContact(
    nodeId: NodeId,
    tran?: DBTransaction,
  ): Promise<NodeContact | undefined> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getNodeContact(nodeId, tran),
      );
    }
    const [bucketIndex] = this.bucketIndex(nodeId);
    const contact: NodeContact = {};
    for await (const [
      keyPath,
      nodeContactAddressData,
    ] of tran.iterator<NodeContactAddressData>(
      [
        ...this.nodeGraphBucketsDbPath,
        nodesUtils.bucketKey(bucketIndex),
        nodesUtils.bucketDbKey(nodeId),
      ],
      {
        valueAsBuffer: false,
      },
    )) {
      const nodeContactAddress = keyPath[0].toString();
      contact[nodeContactAddress] = nodeContactAddressData;
    }
    if (Object.keys(contact).length === 0) return undefined;
    return contact;
  }

  /**
   * Get all `NodeContact`.
   *
   * Results are sorted by `NodeBucketIndex` then `NodeId` then
   * `NodeContactAddress`.
   * The `order` parameter applies to both, for example:
   *   NodeBucketIndex asc, NodeID asc, NodeContactAddress asc
   *   NodeBucketIndex desc, NodeId desc, NodeContactAddress desc
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async *getNodeContacts(
    order: 'asc' | 'desc' = 'asc',
    tran?: DBTransaction,
  ): AsyncGenerator<[NodeId, NodeContact]> {
    if (tran == null) {
      // Lambda generators don't grab the `this` context, so we need to bind it
      const getNodeContacts = (tran) => this.getNodeContacts(order, tran);
      return yield* this.db.withTransactionG(async function* (tran) {
        return yield* getNodeContacts(tran);
      });
    }
    return yield* nodesUtils.collectNodeContacts(
      [...this.nodeGraphBucketsDbPath],
      tran,
      { reverse: order !== 'asc' },
    );
  }

  /**
   * Get a single `NodeContactAddressData`.
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async getNodeContactAddressData(
    nodeId: NodeId,
    nodeAddress: NodeAddress | NodeContactAddress,
    tran?: DBTransaction,
  ): Promise<NodeContactAddressData | undefined> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getNodeContactAddressData(nodeId, nodeAddress, tran),
      );
    }
    const [bucketIndex] = this.bucketIndex(nodeId);
    let nodeContactAddress: NodeContactAddress;
    if (Array.isArray(nodeAddress)) {
      nodeContactAddress = nodesUtils.nodeContactAddress(nodeAddress);
    } else {
      nodeContactAddress = nodeAddress;
    }
    return tran.get<NodeContactAddressData>([
      ...this.nodeGraphBucketsDbPath,
      nodesUtils.bucketKey(bucketIndex),
      nodesUtils.bucketDbKey(nodeId),
      nodeContactAddress,
    ]);
  }

  /**
   * Sets a single `NodeContact` for a `NodeId`.
   * This replaces the entire `NodeContact` for the `NodeId`.
   * This will increment the bucket count if it is a new `NodeID`.
   *
   * @throws {nodesErrors.ErrorNodeGraphBucketLimit} If the bucket is full.
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async setNodeContact(
    nodeId: NodeId,
    nodeContact: NodeContact,
    tran?: DBTransaction,
  ): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.setNodeContact(nodeId, nodeContact, tran),
      );
    }
    const [bucketIndex, bucketKey] = this.bucketIndex(nodeId);
    const nodeIdKey = nodesUtils.bucketDbKey(nodeId);
    const nodeContactPath = [
      ...this.nodeGraphBucketsDbPath,
      bucketKey,
      nodeIdKey,
    ];
    if ((await tran.count(nodeContactPath)) === 0) {
      // It didn't exist, so we want to increment the bucket count
      const count = await this.getBucketMetaProp(bucketIndex, 'count', tran);
      if (count >= this.nodeBucketLimit) {
        throw new nodesErrors.ErrorNodeGraphBucketLimit();
      }
      await this.setBucketMetaProp(bucketIndex, 'count', count + 1, tran);
    }
    // Clear the entire contact if it exists
    await tran.clear(nodeContactPath);
    let connectedTimeMax = 0;
    for (const nodeContactAddress in nodeContact) {
      const nodeContactAddressData = nodeContact[nodeContactAddress];
      await tran.put(
        [...nodeContactPath, nodeContactAddress],
        nodeContactAddressData,
      );
      connectedTimeMax = Math.max(
        connectedTimeMax,
        nodeContactAddressData.connectedTime,
      );
    }
    await this.setConnectedTime(nodeId, connectedTimeMax, tran);
  }

  /**
   * Sets a single `NodeContactAddressData` for a `NodeId`.
   * This will increment the bucket count if it is a new `NodeID`.
   *
   * @throws {nodesErrors.ErrorNodeGraphBucketLimit} If the bucket is full.
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async setNodeContactAddressData(
    nodeId: NodeId,
    nodeAddress: NodeAddress | NodeContactAddress,
    nodeContactAddressData: NodeContactAddressData,
    tran?: DBTransaction,
  ): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.setNodeContactAddressData(
          nodeId,
          nodeAddress,
          nodeContactAddressData,
          tran,
        ),
      );
    }
    const [bucketIndex, bucketKey] = this.bucketIndex(nodeId);
    const nodeIdKey = nodesUtils.bucketDbKey(nodeId);
    const nodeContactPath = [
      ...this.nodeGraphBucketsDbPath,
      bucketKey,
      nodeIdKey,
    ];
    if ((await tran.count(nodeContactPath)) === 0) {
      // It didn't exist, so we want to increment the bucket count
      const count = await this.getBucketMetaProp(bucketIndex, 'count', tran);
      if (count >= this.nodeBucketLimit) {
        throw new nodesErrors.ErrorNodeGraphBucketLimit();
      }
      await this.setBucketMetaProp(bucketIndex, 'count', count + 1, tran);
    }
    let nodeContactAddress: NodeContactAddress;
    if (Array.isArray(nodeAddress)) {
      nodeContactAddress = nodesUtils.nodeContactAddress(nodeAddress);
    } else {
      nodeContactAddress = nodeAddress;
    }
    await tran.put(
      [...nodeContactPath, nodeContactAddress],
      nodeContactAddressData,
    );
    await this.setConnectedTime(
      nodeId,
      nodeContactAddressData.connectedTime,
      tran,
    );
  }

  /**
   * Unsets a `NodeId` record.
   * It will decrement the bucket count if it existed.
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async unsetNodeContact(
    nodeId: NodeId,
    tran?: DBTransaction,
  ): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.unsetNodeContact(nodeId, tran),
      );
    }
    const [bucketIndex, bucketKey] = this.bucketIndex(nodeId);
    const nodeIdKey = nodesUtils.bucketDbKey(nodeId);
    const nodeContactPath = [
      ...this.nodeGraphBucketsDbPath,
      bucketKey,
      nodeIdKey,
    ];
    // Skip if node doesn't exist
    if ((await tran.count(nodeContactPath)) === 0) return;
    // Decrement the bucket count
    const count = await this.getBucketMetaProp(bucketIndex, 'count', tran);
    await this.setBucketMetaProp(bucketIndex, 'count', count - 1, tran);
    // Clear the records
    await tran.clear(nodeContactPath);
    await this.delConnectedTime(nodeId, tran);
  }

  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async unsetNodeContactAddress(
    nodeId: NodeId,
    nodeAddress: NodeAddress | NodeContactAddress,
    tran?: DBTransaction,
  ): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.unsetNodeContactAddress(nodeId, nodeAddress, tran),
      );
    }
    const [bucketIndex, bucketKey] = this.bucketIndex(nodeId);
    let nodeContactAddress: NodeContactAddress;
    if (Array.isArray(nodeAddress)) {
      nodeContactAddress = nodesUtils.nodeContactAddress(nodeAddress);
    } else {
      nodeContactAddress = nodeAddress;
    }
    const nodeIdKey = nodesUtils.bucketDbKey(nodeId);
    const nodeContactPath = [
      ...this.nodeGraphBucketsDbPath,
      bucketKey,
      nodeIdKey,
    ];

    // Skip if node doesn't exist
    const addressCount = await tran.count(nodeContactPath);
    if (addressCount === 0) return;

    // Skip if no data
    const data = tran.get<NodeContactAddressData>([
      ...this.nodeGraphBucketsDbPath,
      nodesUtils.bucketKey(bucketIndex),
      nodesUtils.bucketDbKey(nodeId),
      nodeContactAddress,
    ]);
    if (data == null) return;

    // Remove data
    await tran.del([
      ...this.nodeGraphBucketsDbPath,
      nodesUtils.bucketKey(bucketIndex),
      nodesUtils.bucketDbKey(nodeId),
      nodeContactAddress,
    ]);

    // If last address then clear node from bucket and decrement count
    if (addressCount === 1) {
      await tran.clear(nodeContactPath);
      const count = await this.getBucketMetaProp(bucketIndex, 'count', tran);
      await this.setBucketMetaProp(bucketIndex, 'count', count - 1, tran);
      await this.delConnectedTime(nodeId, tran);
    }
  }

  /**
   * Sets the `connectedTime` for a NodeId, replaces the old value if it exists
   */
  protected async setConnectedTime(
    nodeId: NodeId,
    connectedTime: number,
    tran: DBTransaction,
    path: LevelPath = this.nodeGraphConnectedDbPath,
  ) {
    const [, bucketKey] = this.bucketIndex(nodeId);
    const connectedPath = [...path, bucketKey];
    const nodeIdKey = nodesUtils.bucketDbKey(nodeId);
    const newConnectedKey = nodesUtils.connectedKey(connectedTime);

    // Lookup the old time and delete it
    const oldConnectedKey = await tran.get(
      [...connectedPath, 'nodeId', nodeIdKey],
      true,
    );
    if (oldConnectedKey != null) {
      await tran.del([...connectedPath, 'time', oldConnectedKey, nodeIdKey]);
    }
    // Set the new values
    await tran.put(
      [...connectedPath, 'nodeId', nodeIdKey],
      newConnectedKey,
      true,
    );
    await tran.put(
      [...connectedPath, 'time', newConnectedKey, nodeIdKey],
      nodeIdKey,
      true,
    );
  }

  /**
   * Deletes the `connectedTime` for a NodeId
   */
  protected async delConnectedTime(nodeId: NodeId, tran: DBTransaction) {
    const [, bucketKey] = this.bucketIndex(nodeId);
    const lastConnectedPath = [...this.nodeGraphConnectedDbPath, bucketKey];
    const nodeIdKey = nodesUtils.bucketDbKey(nodeId);

    // Look up the existing time
    const oldConnectedKey = await tran.get(
      [...lastConnectedPath, 'nodeId', nodeIdKey],
      true,
    );
    // And delete the values
    await tran.del([...lastConnectedPath, 'nodeId', nodeIdKey]);
    if (oldConnectedKey == null) return;
    await tran.del([...lastConnectedPath, 'time', oldConnectedKey, nodeIdKey]);
  }

  /**
   * Gets the `connectedTime` for a node
   */
  public async getConnectedTime(nodeId: NodeId, tran?: DBTransaction) {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getConnectedTime(nodeId, tran),
      );
    }
    const [, bucketKey] = this.bucketIndex(nodeId);
    const connectedPath = [...this.nodeGraphConnectedDbPath, bucketKey];
    const nodeIdKey = nodesUtils.bucketDbKey(nodeId);

    // Look up the existing time
    const oldConnectedKey = await tran.get(
      [...connectedPath, 'nodeId', nodeIdKey],
      true,
    );
    // Convert and return
    if (oldConnectedKey == null) return;
    return nodesUtils.parseConnectedKey(oldConnectedKey);
  }

  // ...

  /**
   * Gets a bucket.
   *
   * The bucket's node IDs is sorted lexicographically by default
   * Alternatively you can acquire them sorted by connected timestamp
   * or by distance to the own NodeId.
   *
   * @param bucketIndex
   * @param sort
   * @param order
   * @param limit Limit the number of nodes returned, note that `-1` means
   *              no limit, but `Infinity` means `0`.
   * @param tran
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async getBucket(
    bucketIndex: NodeBucketIndex,
    sort: 'nodeId' | 'distance' | 'connected' = 'nodeId',
    order: 'asc' | 'desc' = 'asc',
    limit?: number,
    tran?: DBTransaction,
  ): Promise<NodeBucket> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getBucket(bucketIndex, sort, order, limit, tran),
      );
    }
    if (bucketIndex < 0 || bucketIndex >= this.nodeIdBits) {
      throw new nodesErrors.ErrorNodeGraphBucketIndex(
        `bucketIndex must be between 0 and ${this.nodeIdBits - 1} inclusive`,
      );
    }
    const nodeIdOwn = this.keyRing.getNodeId();
    const bucketKey = nodesUtils.bucketKey(bucketIndex);
    const bucket: NodeBucket = [];
    if (sort === 'nodeId' || sort === 'distance') {
      for await (const result of nodesUtils.collectNodeContacts(
        [...this.nodeGraphBucketsDbPath, bucketKey],
        tran,
        {
          reverse: order !== 'asc',
          limit,
          pathAdjust: [''],
        },
      )) {
        bucket.push(result);
      }
      if (sort === 'distance') {
        nodesUtils.bucketSortByDistance(bucket, nodeIdOwn, order);
      }
    } else if (sort === 'connected') {
      for await (const [, nodeIdBuffer] of tran.iterator(
        [...this.nodeGraphConnectedDbPath, bucketKey, 'time'],
        {
          reverse: order !== 'asc',
          limit,
        },
      )) {
        const nodeId = IdInternal.fromBuffer<NodeId>(nodeIdBuffer);
        const nodeContact = await this.getNodeContact(
          IdInternal.fromBuffer<NodeId>(nodeIdBuffer),
          tran,
        );
        if (nodeContact == null) utils.never();
        bucket.push([nodeId, nodeContact]);
      }
    }
    return bucket;
  }

  /**
   * Gets all buckets.
   * Buckets are always sorted by `NodeBucketIndex` first
   * Then secondly by the `sort` parameter
   * The `order` parameter applies to both, for example possible sorts:
   *   NodeBucketIndex asc, NodeID asc
   *   NodeBucketIndex desc, NodeId desc
   *   NodeBucketIndex asc, distance asc
   *   NodeBucketIndex desc, distance desc
   *   NodeBucketIndex asc, connected asc
   *   NodeBucketIndex desc, connected desc
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async *getBuckets(
    sort: 'nodeId' | 'distance' | 'connected' = 'nodeId',
    order: 'asc' | 'desc' = 'asc',
    tran?: DBTransaction,
  ): AsyncGenerator<[NodeBucketIndex, NodeBucket]> {
    if (tran == null) {
      const getBuckets = (tran) => this.getBuckets(sort, order, tran);
      return yield* this.db.withTransactionG(async function* (tran) {
        return yield* getBuckets(tran);
      });
    }

    for (let i = 0; i < this.nodeIdBits; i++) {
      const bucketIndex = order === 'asc' ? i : this.nodeIdBits - i;
      const nodeBucket = await this.getBucket(
        bucketIndex,
        sort,
        order,
        undefined,
        tran,
      );
      if (nodeBucket.length > 0) yield [bucketIndex, nodeBucket];
    }
  }

  /**
   * Resets the bucket according to the new node ID.
   * Run this after new node ID is generated via renewal or reset.
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async resetBuckets(tran?: DBTransaction): Promise<void> {
    if (tran == null) {
      return this.db.withTransactionF((tran) => this.resetBuckets(tran));
    }
    // Setup new space
    const spaceNew = this.space === '0' ? '1' : '0';
    const nodeGraphMetaDbPathNew = [...this.nodeGraphDbPath, 'meta' + spaceNew];
    const nodeGraphBucketsDbPathNew = [
      ...this.nodeGraphDbPath,
      'buckets' + spaceNew,
    ];
    const nodeGraphConnectedDbPathNew = [
      ...this.nodeGraphDbPath,
      'connected' + spaceNew,
    ];
    // Clear the new space (in case it wasn't cleaned properly last time)
    await tran.clear(nodeGraphMetaDbPathNew);
    await tran.clear(nodeGraphBucketsDbPathNew);
    await tran.clear(nodeGraphConnectedDbPathNew);
    // Iterating over all entries across all buckets
    for await (const [nodeId, nodeContact] of nodesUtils.collectNodeContacts(
      [...this.nodeGraphBucketsDbPath],
      tran,
    )) {
      const nodeIdKey = nodesUtils.bucketDbKey(nodeId);
      const nodeIdOwn = this.keyRing.getNodeId();
      if (nodeId.equals(nodeIdOwn)) {
        continue;
      }
      const bucketIndexNew = nodesUtils.bucketIndex(nodeIdOwn, nodeId);
      const bucketKeyNew = nodesUtils.bucketKey(bucketIndexNew);
      const metaPathNew = [...nodeGraphMetaDbPathNew, bucketKeyNew];
      const bucketPathNew = [...nodeGraphBucketsDbPathNew, bucketKeyNew];
      const countNew = (await tran.get<number>([...metaPathNew, 'count'])) ?? 0;
      if (countNew < this.nodeBucketLimit) {
        // If the new bucket is not filled up, the node is moved to the new bucket
        await tran.put([...metaPathNew, 'count'], countNew + 1);
      } else {
        // TODO
        // If the new bucket is already filled up, the oldest node is dropped
        // skipping for now
        continue;
      }
      // Adding in node
      let connectedTimeMax = 0;
      for (const nodeContactAddress in nodeContact) {
        const nodeContactAddressData = nodeContact[nodeContactAddress];
        await tran.put(
          [...bucketPathNew, nodeIdKey, nodeContactAddress],
          nodeContactAddressData,
        );
        connectedTimeMax = Math.max(
          connectedTimeMax,
          nodeContactAddressData.connectedTime,
        );
      }
      // Set the new values
      const newConnectedKey = nodesUtils.connectedKey(connectedTimeMax);
      await tran.put(
        [...nodeGraphConnectedDbPathNew, bucketKeyNew, 'nodeId', nodeIdKey],
        newConnectedKey,
        true,
      );
      await tran.put(
        [
          ...nodeGraphConnectedDbPathNew,
          bucketKeyNew,
          'time',
          newConnectedKey,
          nodeIdKey,
        ],
        nodeIdKey,
        true,
      );
    }
    // Swap to the new space
    await tran.put([...this.nodeGraphDbPath, 'space'], spaceNew);
    // Clear old space
    await tran.clear(this.nodeGraphMetaDbPath);
    await tran.clear(this.nodeGraphBucketsDbPath);
    await tran.clear(this.nodeGraphConnectedDbPath);
    // Swap the spaces
    this.space = spaceNew;
    this.nodeGraphMetaDbPath = nodeGraphMetaDbPathNew;
    this.nodeGraphBucketsDbPath = nodeGraphBucketsDbPathNew;
    this.nodeGraphConnectedDbPath = nodeGraphConnectedDbPathNew;
  }

  /**
   * Get a bucket meta POJO.
   * This will provide default values for missing properties.
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async getBucketMeta(
    bucketIndex: NodeBucketIndex,
    tran?: DBTransaction,
  ): Promise<NodeBucketMeta> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getBucketMeta(bucketIndex, tran),
      );
    }

    if (bucketIndex < 0 || bucketIndex >= this.nodeIdBits) {
      throw new nodesErrors.ErrorNodeGraphBucketIndex(
        `bucketIndex must be between 0 and ${this.nodeIdBits - 1} inclusive`,
      );
    }
    const metaDomain = [
      ...this.nodeGraphMetaDbPath,
      nodesUtils.bucketKey(bucketIndex),
    ];
    const props = await Promise.all([
      tran.get<number>([...metaDomain, 'count']),
    ]);
    const [count] = props;
    // Bucket meta properties have defaults
    return {
      count: count ?? 0,
    };
  }

  /**
   * Get a single bucket meta property.
   * This will provide default values for missing properties.
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async getBucketMetaProp<Key extends keyof NodeBucketMeta>(
    bucketIndex: NodeBucketIndex,
    key: Key,
    tran?: DBTransaction,
  ): Promise<NodeBucketMeta[Key]> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getBucketMetaProp(bucketIndex, key, tran),
      );
    }
    if (bucketIndex < 0 || bucketIndex >= this.nodeIdBits) {
      throw new nodesErrors.ErrorNodeGraphBucketIndex(
        `bucketIndex must be between 0 and ${this.nodeIdBits - 1} inclusive`,
      );
    }
    const metaDomain = [
      ...this.nodeGraphMetaDbPath,
      nodesUtils.bucketKey(bucketIndex),
    ];
    // Bucket meta properties have defaults
    let value;
    switch (key) {
      case 'count':
        value = (await tran.get([...metaDomain, key])) ?? 0;
        break;
    }
    return value;
  }

  /**
   * Gets the closest nodes (closest based on Kademlia XOR operator) to a
   * given node ID. The returned results will be sorted by distance in
   * ascending order. If the given node ID already exists in the node graph,
   * then it will be the first result.
   *
   * @param limit - Defaults to the bucket limit.
   * @returns The `NodeBucket` which could have less than `limit` nodes if the
   *          node graph has less than the requested limit.
   */
  @ready(new nodesErrors.ErrorNodeGraphNotRunning())
  public async getClosestNodes(
    nodeId: NodeId,
    limit: number = this.nodeBucketLimit,
    tran?: DBTransaction,
  ): Promise<NodeBucket> {
    if (tran == null) {
      return this.db.withTransactionF((tran) =>
        this.getClosestNodes(nodeId, limit, tran),
      );
    }
    // Buckets map to the target node in the following way;
    // 1. 0, 1, ..., T-1 -> T
    // 2. T -> 0, 1, ..., T-1
    // 3. T+1, T+2, ..., 255 are unchanged
    // We need to obtain nodes in the following bucket order
    // 1. T
    // 2. iterate over 0 ---> T-1
    // 3. iterate over T+1 ---> K
    // If our own node ID, start at bucket 0
    // Otherwise find the bucket that the given node ID belongs to
    const nodeIdOwn = this.keyRing.getNodeId();
    const bucketIndexFirst = nodeIdOwn.equals(nodeId)
      ? 0
      : nodesUtils.bucketIndex(nodeIdOwn, nodeId);
    // Getting the whole target's bucket first
    const nodes: NodeBucket = await this.getBucket(
      bucketIndexFirst,
      undefined,
      undefined,
      undefined,
      tran,
    );
    // We need to iterate over the key stream
    // When streaming we want all nodes in the starting bucket
    // The keys takes the form `lexi<NodeBucketIndex>/NodeId`
    // We can just use `lexi<NodeBucketIndex>` to start from
    // Less than `lexi<NodeBucketIndex:101>` gets us buckets 100 and lower
    // Greater than `lexi<NodeBucketIndex:99>` gets us buckets 100 and greater
    if (nodes.length < limit && bucketIndexFirst !== 0) {
      // Just before target bucket
      const bucketIdKey = Buffer.from(
        nodesUtils.bucketKey(bucketIndexFirst - 1),
      );
      const remainingLimit = limit - nodes.length;
      // Iterate over lower buckets
      for await (const nodeEntry of nodesUtils.collectNodeContacts(
        this.nodeGraphBucketsDbPath,
        tran,
        {
          lt: [bucketIdKey, ''],
          limit: remainingLimit,
        },
      )) {
        nodes.push(nodeEntry);
      }
    }
    if (nodes.length < limit) {
      // Just after target bucket
      const bucketId = Buffer.from(nodesUtils.bucketKey(bucketIndexFirst));
      const remainingLimit = limit - nodes.length;
      // Iterate over ids further away
      for await (const nodeEntry of nodesUtils.collectNodeContacts(
        this.nodeGraphBucketsDbPath,
        tran,
        {
          gt: [bucketId, ''],
          limit: remainingLimit,
        },
      )) {
        nodes.push(nodeEntry);
      }
    }
    // If no nodes were found, return nothing
    if (nodes.length === 0) return [];
    // Need to get the whole of the last bucket
    const bucketIndexLast = nodesUtils.bucketIndex(
      nodeIdOwn,
      nodes[nodes.length - 1][0],
    );
    const lastBucket = await this.getBucket(
      bucketIndexLast,
      undefined,
      undefined,
      undefined,
      tran,
    );
    // Pop off elements of the same bucket to avoid duplicates
    let element = nodes.pop();
    while (
      element != null &&
      nodesUtils.bucketIndex(nodeIdOwn, element[0]) === bucketIndexLast
    ) {
      element = nodes.pop();
    }
    if (element != null) nodes.push(element);
    // Adding last bucket to the list
    nodes.push(...lastBucket);
    nodesUtils.bucketSortByDistance(nodes, nodeId, 'asc');
    return nodes.slice(0, limit);
  }

  /**
   * Sets a single bucket meta property.
   * Bucket meta properties cannot be mutated outside.
   */
  protected async setBucketMetaProp<Key extends keyof NodeBucketMeta>(
    bucketIndex: NodeBucketIndex,
    key: Key,
    value: NodeBucketMeta[Key],
    tran: DBTransaction,
  ): Promise<void> {
    const metaKey = [
      ...this.nodeGraphMetaDbPath,
      nodesUtils.bucketKey(bucketIndex),
      key,
    ];
    await tran.put(metaKey, value);
    return;
  }

  /**
   * Returns to total number of nodes in the `NodeGraph`
   */
  public async nodesTotal(tran?: DBTransaction): Promise<number> {
    if (tran == null) {
      return this.db.withTransactionF((tran) => this.nodesTotal(tran));
    }
    // `nodeGraphConnectedDbPath` will contain 2 entries for each `NodeId` within the `NodeGraph`
    return (await tran.count(this.nodeGraphConnectedDbPath)) / 2;
  }
}

export default NodeGraph;
