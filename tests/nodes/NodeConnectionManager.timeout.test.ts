import type { NodeId, NodeIdString, SeedNodes } from '@/nodes/types';
import type { Host, Port } from '@/network/types';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DB } from '@matrixai/db';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { IdInternal } from '@matrixai/id';
import PolykeyAgent from '@/PolykeyAgent';
import KeyManager from '@/keys/KeyManager';
import NodeGraph from '@/nodes/NodeGraph';
import NodeConnectionManager from '@/nodes/NodeConnectionManager';
import ForwardProxy from '@/network/ForwardProxy';
import ReverseProxy from '@/network/ReverseProxy';
import * as nodesUtils from '@/nodes/utils';
import * as keysUtils from '@/keys/utils';
import * as grpcUtils from '@/grpc/utils';
import { sleep } from '@/utils';

describe(`${NodeConnectionManager.name} timeout test`, () => {
  const logger = new Logger(
    `${NodeConnectionManager.name} test`,
    LogLevel.WARN,
    [new StreamHandler()],
  );
  grpcUtils.setLogger(logger.getChild('grpc'));

  const nodeConnectionManagerLogger = logger.getChild(
    'nodeConnectionManagerUT',
  );
  // Constants
  const password = 'password';
  const nodeId1 = IdInternal.create<NodeId>([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 5,
  ]);
  const nodeId2 = IdInternal.create<NodeId>([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 8,
  ]);
  const nodeId3 = IdInternal.create<NodeId>([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 124,
  ]);

  const serverHost = '127.0.0.1' as Host;
  const serverPort = 55555 as Port;

  const dummySeedNodes: SeedNodes = {};
  dummySeedNodes[nodesUtils.encodeNodeId(nodeId1)] = {
    host: serverHost,
    port: serverPort,
  };
  dummySeedNodes[nodesUtils.encodeNodeId(nodeId2)] = {
    host: serverHost,
    port: serverPort,
  };
  dummySeedNodes[nodesUtils.encodeNodeId(nodeId3)] = {
    host: serverHost,
    port: serverPort,
  };

  const nop = async () => {};

  //
  let dataDir: string;
  let dataDir2: string;
  let keyManager: KeyManager;
  let db: DB;
  let fwdProxy: ForwardProxy;
  let revProxy: ReverseProxy;
  let nodeGraph: NodeGraph;

  let remoteNode1: PolykeyAgent;
  let remoteNode2: PolykeyAgent;
  let remoteNodeId1: NodeId;
  let remoteNodeId2: NodeId;

  const mockedGenerateDeterministicKeyPair = jest.spyOn(
    keysUtils,
    'generateDeterministicKeyPair',
  );

  beforeAll(async () => {
    mockedGenerateDeterministicKeyPair.mockImplementation((bits, _) => {
      return keysUtils.generateKeyPair(bits);
    });

    dataDir2 = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    // Creating remotes, they just exist to start connections or fail them if needed
    remoteNode1 = await PolykeyAgent.createPolykeyAgent({
      password,
      nodePath: path.join(dataDir2, 'remoteNode1'),
      logger: logger.getChild('remoteNode1'),
    });
    remoteNodeId1 = remoteNode1.keyManager.getNodeId();
    remoteNode2 = await PolykeyAgent.createPolykeyAgent({
      password,
      nodePath: path.join(dataDir2, 'remoteNode2'),
      logger: logger.getChild('remoteNode2'),
    });
    remoteNodeId2 = remoteNode2.keyManager.getNodeId();
  });

  afterAll(async () => {
    await remoteNode1.stop();
    await remoteNode1.destroy();
    await remoteNode2.stop();
    await remoteNode2.destroy();
    await fs.promises.rm(dataDir2, { force: true, recursive: true });
  });

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    const keysPath = path.join(dataDir, 'keys');
    keyManager = await KeyManager.createKeyManager({
      password,
      keysPath,
      logger: logger.getChild('keyManager'),
    });
    const dbPath = path.join(dataDir, 'db');
    db = await DB.createDB({
      dbPath,
      logger: nodeConnectionManagerLogger,
      crypto: {
        key: keyManager.dbKey,
        ops: {
          encrypt: keysUtils.encryptWithKey,
          decrypt: keysUtils.decryptWithKey,
        },
      },
    });
    nodeGraph = await NodeGraph.createNodeGraph({
      db,
      keyManager,
      logger: logger.getChild('NodeGraph'),
    });
    const tlsConfig = {
      keyPrivatePem: keyManager.getRootKeyPairPem().privateKey,
      certChainPem: keysUtils.certToPem(keyManager.getRootCert()),
    };
    fwdProxy = new ForwardProxy({
      authToken: 'auth',
      logger: logger.getChild('fwdProxy'),
    });
    await fwdProxy.start({
      tlsConfig,
    });
    revProxy = new ReverseProxy({
      logger: logger.getChild('revProxy'),
    });
    await revProxy.start({
      serverHost,
      serverPort,
      tlsConfig,
    });
    await nodeGraph.setNode(remoteNodeId1, {
      host: remoteNode1.revProxy.getIngressHost(),
      port: remoteNode1.revProxy.getIngressPort(),
    });
    await nodeGraph.setNode(remoteNodeId2, {
      host: remoteNode2.revProxy.getIngressHost(),
      port: remoteNode2.revProxy.getIngressPort(),
    });
  });

  afterEach(async () => {
    await nodeGraph.stop();
    await nodeGraph.destroy();
    await db.stop();
    await db.destroy();
    await keyManager.stop();
    await keyManager.destroy();
    await revProxy.stop();
    await fwdProxy.stop();
  });

  // Timeouts
  test('should time out a connection', async () => {
    // NodeConnectionManager under test
    let nodeConnectionManager: NodeConnectionManager | undefined;
    try {
      nodeConnectionManager = new NodeConnectionManager({
        keyManager,
        nodeGraph,
        fwdProxy,
        revProxy,
        connTimeoutTime: 500,
        logger: nodeConnectionManagerLogger,
      });
      await nodeConnectionManager.start();
      // @ts-ignore: kidnap connections
      const connections = nodeConnectionManager.connections;
      await nodeConnectionManager.withConnF(remoteNodeId1, nop);
      const connAndLock = connections.get(
        remoteNodeId1.toString() as NodeIdString,
      );
      // Check entry is in map and lock is released
      expect(connAndLock).toBeDefined();
      expect(connAndLock?.lock.isLocked()).toBeFalsy();
      expect(connAndLock?.timer).toBeDefined();
      expect(connAndLock?.connection).toBeDefined();

      // Wait for timeout
      await sleep(1000);
      const finalConnAndLock = connections.get(
        remoteNodeId1.toString() as NodeIdString,
      );
      expect(finalConnAndLock).toBeDefined();
      expect(finalConnAndLock?.lock.isLocked()).toBeFalsy();
      expect(finalConnAndLock?.timer).toBeUndefined();
      expect(finalConnAndLock?.connection).toBeUndefined();
    } finally {
      await nodeConnectionManager?.stop();
    }
  });
  test('withConnection should extend timeout', async () => {
    // NodeConnectionManager under test
    let nodeConnectionManager: NodeConnectionManager | undefined;
    try {
      nodeConnectionManager = new NodeConnectionManager({
        keyManager,
        nodeGraph,
        fwdProxy,
        revProxy,
        connTimeoutTime: 1000,
        logger: nodeConnectionManagerLogger,
      });
      await nodeConnectionManager.start();
      // @ts-ignore: kidnap connections
      const connections = nodeConnectionManager.connections;
      await nodeConnectionManager.withConnF(remoteNodeId1, nop);
      const connAndLock = connections.get(
        remoteNodeId1.toString() as NodeIdString,
      );
      // Check entry is in map and lock is released
      expect(connAndLock).toBeDefined();
      expect(connAndLock?.lock.isLocked()).toBeFalsy();
      expect(connAndLock?.timer).toBeDefined();
      expect(connAndLock?.connection).toBeDefined();

      // WithConnection should extend timeout to 1500ms
      await sleep(500);
      await nodeConnectionManager.withConnF(remoteNodeId1, async () => {
        // Do noting
      });

      // Connection should still exist after 1250 secs
      await sleep(750);
      const midConnAndLock = connections.get(
        remoteNodeId1.toString() as NodeIdString,
      );
      expect(midConnAndLock).toBeDefined();
      expect(midConnAndLock?.lock.isLocked()).toBeFalsy();
      expect(midConnAndLock?.timer).toBeDefined();
      expect(midConnAndLock?.connection).toBeDefined();

      // Should be dead after 1750 secs
      await sleep(500);
      const finalConnAndLock = connections.get(
        remoteNodeId1.toString() as NodeIdString,
      );
      expect(finalConnAndLock).toBeDefined();
      expect(finalConnAndLock?.lock.isLocked()).toBeFalsy();
      expect(finalConnAndLock?.timer).toBeUndefined();
      expect(finalConnAndLock?.connection).toBeUndefined();
    } finally {
      await nodeConnectionManager?.stop();
    }
  });
  test('should remove timeout when connection is destroyed', async () => {
    // NodeConnectionManager under test
    let nodeConnectionManager: NodeConnectionManager | undefined;
    try {
      nodeConnectionManager = new NodeConnectionManager({
        keyManager,
        nodeGraph,
        fwdProxy,
        revProxy,
        logger: nodeConnectionManagerLogger,
      });
      await nodeConnectionManager.start();
      // @ts-ignore: kidnap connections
      const connections = nodeConnectionManager.connections;
      await nodeConnectionManager.withConnF(remoteNodeId1, nop);
      const midConnAndLock = connections.get(
        remoteNodeId1.toString() as NodeIdString,
      );
      // Check entry is in map and lock is released
      expect(midConnAndLock).toBeDefined();
      expect(midConnAndLock?.lock.isLocked()).toBeFalsy();
      expect(midConnAndLock?.timer).toBeDefined();

      // Destroying the connection
      // @ts-ignore: private method
      await nodeConnectionManager.destroyConnection(remoteNodeId1);
      const finalConnAndLock = connections.get(
        remoteNodeId1.toString() as NodeIdString,
      );
      expect(finalConnAndLock).toBeDefined();
      expect(finalConnAndLock?.lock.isLocked()).toBeFalsy();
      expect(finalConnAndLock?.connection).toBeUndefined();
      expect(finalConnAndLock?.timer).toBeUndefined();
    } finally {
      await nodeConnectionManager?.stop();
    }
  });
});
