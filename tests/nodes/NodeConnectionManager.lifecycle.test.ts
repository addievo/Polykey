import type { Host, Port, TLSConfig } from '@/network/types';
import type { NodeAddress } from '@/nodes/types';
import type { NodeId, NodeIdEncoded, NodeIdString } from '@/ids';
import type { ObjectEmpty } from '@';
import type {
  JSONRPCRequestParams,
  JSONRPCResponseResult,
} from '@matrixai/rpc';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DB } from '@matrixai/db';
import Logger, { formatting, LogLevel, StreamHandler } from '@matrixai/logger';
import { UnaryHandler } from '@matrixai/rpc';
import KeyRing from '@/keys/KeyRing';
import NodeGraph from '@/nodes/NodeGraph';
import * as nodesUtils from '@/nodes/utils';
import * as keysUtils from '@/keys/utils';
import NodeConnectionManager from '@/nodes/NodeConnectionManager';
import { promise, sleep } from '@/utils';
import * as nodesErrors from '@/nodes/errors';
import NodeConnection from '@/nodes/NodeConnection';
import * as tlsUtils from '../utils/tls';

describe(`${NodeConnectionManager.name} lifecycle test`, () => {
  class Echo extends UnaryHandler<
    ObjectEmpty,
    JSONRPCRequestParams,
    JSONRPCResponseResult
  > {
    public handle = async (
      input: JSONRPCRequestParams,
    ): Promise<JSONRPCResponseResult> => {
      return input;
    };
  }

  const logger = new Logger(`${NodeConnection.name} test`, LogLevel.WARN, [
    new StreamHandler(
      formatting.format`${formatting.level}:${formatting.keys}:${formatting.msg}`,
    ),
  ]);
  const localHost = '127.0.0.1' as Host;
  const password = 'password';

  let dataDir: string;

  let serverTlsConfig1: TLSConfig;
  let serverTlsConfig2: TLSConfig;
  let clientTlsConfig: TLSConfig;
  let serverNodeId1: NodeId;
  let serverNodeId2: NodeId;
  let clientNodeId: NodeId;
  let serverNodeIdEncoded1: NodeIdEncoded;
  let serverNodeIdEncoded2: NodeIdEncoded;
  let keyRingPeer1: KeyRing;
  let keyRingPeer2: KeyRing;
  let nodeConnectionManagerPeer1: NodeConnectionManager;
  let nodeConnectionManagerPeer2: NodeConnectionManager;
  let serverAddress1: NodeAddress;

  let keyRingClient: KeyRing;
  let db: DB;
  let nodeGraph: NodeGraph;

  let nodeConnectionManager: NodeConnectionManager;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    const keysPathPeer1 = path.join(dataDir, 'keysPeer1');
    const keysPathPeer2 = path.join(dataDir, 'keysPeer2');
    keyRingPeer1 = await KeyRing.createKeyRing({
      password,
      keysPath: keysPathPeer1,
      passwordOpsLimit: keysUtils.passwordOpsLimits.min,
      passwordMemLimit: keysUtils.passwordMemLimits.min,
      strictMemoryLock: false,
      logger,
    });
    keyRingPeer2 = await KeyRing.createKeyRing({
      password,
      keysPath: keysPathPeer2,
      passwordOpsLimit: keysUtils.passwordOpsLimits.min,
      passwordMemLimit: keysUtils.passwordMemLimits.min,
      strictMemoryLock: false,
      logger,
    });
    const keysPath = path.join(dataDir, 'keys');
    keyRingClient = await KeyRing.createKeyRing({
      password,
      keysPath,
      passwordOpsLimit: keysUtils.passwordOpsLimits.min,
      passwordMemLimit: keysUtils.passwordMemLimits.min,
      strictMemoryLock: false,
      logger,
    });
    const serverKeyPair1 = keyRingPeer1.keyPair;
    const serverKeyPair2 = keyRingPeer2.keyPair;
    const clientKeyPair = keyRingClient.keyPair;
    serverNodeId1 = keysUtils.publicKeyToNodeId(serverKeyPair1.publicKey);
    serverNodeId2 = keysUtils.publicKeyToNodeId(serverKeyPair2.publicKey);
    clientNodeId = keysUtils.publicKeyToNodeId(clientKeyPair.publicKey);
    serverNodeIdEncoded1 = nodesUtils.encodeNodeId(serverNodeId1);
    serverNodeIdEncoded2 = nodesUtils.encodeNodeId(serverNodeId2);
    serverTlsConfig1 = await tlsUtils.createTLSConfig(serverKeyPair1);
    serverTlsConfig2 = await tlsUtils.createTLSConfig(serverKeyPair2);
    clientTlsConfig = await tlsUtils.createTLSConfig(clientKeyPair);
    nodeConnectionManagerPeer1 = new NodeConnectionManager({
      keyRing: keyRingPeer1,
      logger: logger.getChild(`${NodeConnectionManager.name}Peer1`),
      nodeGraph: {} as NodeGraph,
      tlsConfig: serverTlsConfig1,
      seedNodes: undefined,
    });
    await nodeConnectionManagerPeer1.start({
      host: localHost,
      manifest: {
        echo: new Echo({}),
      },
    });
    nodeConnectionManagerPeer2 = new NodeConnectionManager({
      keyRing: keyRingPeer2,
      logger: logger.getChild(`${NodeConnectionManager.name}Peer2`),
      nodeGraph: {} as NodeGraph,
      tlsConfig: serverTlsConfig2,
      seedNodes: undefined,
    });
    await nodeConnectionManagerPeer2.start({
      host: localHost,
      manifest: {
        echo: new Echo({}),
      },
    });

    // Setting up client dependencies
    const dbPath = path.join(dataDir, 'db');
    db = await DB.createDB({
      dbPath,
      logger,
    });
    nodeGraph = await NodeGraph.createNodeGraph({
      db,
      keyRing: keyRingClient,
      logger,
    });
    serverAddress1 = {
      host: nodeConnectionManagerPeer1.host,
      port: nodeConnectionManagerPeer1.port,
      scopes: ['global'],
    };
  });

  afterEach(async () => {
    await nodeConnectionManager?.stop();
    await nodeGraph.stop();
    await nodeGraph.destroy();
    await db.stop();
    await db.destroy();
    await keyRingClient.stop();
    await keyRingClient.destroy();

    await nodeConnectionManagerPeer1.stop();
    await nodeConnectionManagerPeer2.stop();
  });

  test('NodeConnectionManager readiness', async () => {
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });

    await nodeConnectionManager.stop();
  });
  test('NodeConnectionManager consecutive start stops', async () => {
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });

    await nodeConnectionManager.stop();
    await nodeConnectionManager.start({
      host: localHost,
    });
    await nodeConnectionManager.stop();
  });

  test('acquireConnection should create connection', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      nodeGraph,
      connectionConnectTimeoutTime: 1000,
      logger: logger.getChild(`${NodeConnectionManager.name}Local`),
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });

    const acquire =
      await nodeConnectionManager.acquireConnection(serverNodeId1);
    const [release] = await acquire();
    expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeTrue();
    await release();
    await nodeConnectionManager.stop();
  });
  test('withConnF should create connection', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });

    await nodeConnectionManager.withConnF(serverNodeId1, async () => {
      expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeTrue();
    });

    await nodeConnectionManager.stop();
  });
  test('concurrent connections should result in only 1 connection', async () => {
    // A connection is concurrently established in the forward and reverse
    // direction, we only want one connection to exist afterwards.

    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
      manifest: {
        echo: new Echo({}),
      },
    });
    const clientAddress: NodeAddress = {
      host: nodeConnectionManager.host,
      port: nodeConnectionManager.port,
      scopes: ['global'],
    };

    const forwardConnectP = nodeConnectionManager.getMultiConnection(
      [serverNodeId1],
      [serverAddress1],
    );
    const reverseConnectP = nodeConnectionManagerPeer1.getMultiConnection(
      [clientNodeId],
      [clientAddress],
    );

    await Promise.all([forwardConnectP, reverseConnectP]);
    const promA = nodeConnectionManager.withConnF(
      serverNodeId1,
      async (connection) => {
        await connection.getClient().unaryCaller('echo', { value: 'hello' });
      },
    );
    const promB = nodeConnectionManagerPeer1.withConnF(
      clientNodeId,
      async (connection) => {
        await connection.getClient().unaryCaller('echo', { value: 'hello' });
      },
    );

    // Should not throw any errors
    await Promise.all([promA, promB]);

    await nodeConnectionManager.stop();
  });
  test('should list active connections', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });

    await nodeConnectionManager.withConnF(serverNodeId1, async () => {
      expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeTrue();
    });

    const connectionsList = nodeConnectionManager.listConnections();
    expect(connectionsList).toHaveLength(1);
    expect(nodesUtils.encodeNodeId(connectionsList[0].nodeId)).toEqual(
      serverNodeIdEncoded1,
    );
    expect(connectionsList[0].address.host).toEqual(
      nodeConnectionManagerPeer1.host,
    );
    expect(connectionsList[0].address.port).toEqual(
      nodeConnectionManagerPeer1.port,
    );

    await nodeConnectionManager.stop();
  });
  test('withConnG should create connection', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });
    // @ts-ignore: kidnap protected property
    const connectionMap = nodeConnectionManager.connections;

    const gen = nodeConnectionManager.withConnG(
      serverNodeId1,
      async function* (): AsyncGenerator {
        expect(connectionMap.size).toBeGreaterThanOrEqual(1);
      },
    );

    for await (const _ of gen) {
      // Do nothing
    }

    await nodeConnectionManager.stop();
  });
  test('should fail to create connection to offline node', async () => {
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });
    // @ts-ignore: kidnap protected property
    const connectionMap = nodeConnectionManager.connections;
    const randomNodeId = keysUtils.publicKeyToNodeId(
      keysUtils.generateKeyPair().publicKey,
    );
    const gen = nodeConnectionManager.withConnG(
      randomNodeId,
      async function* (): AsyncGenerator {
        expect(connectionMap.size).toBeGreaterThanOrEqual(1);
      },
    );

    const prom = async () => {
      for await (const _ of gen) {
        // Do nothing
      }
    };
    await expect(prom).rejects.toThrow(
      nodesErrors.ErrorNodeGraphNodeIdNotFound,
    );

    await nodeConnectionManager.stop();
  });
  test('connection should persist', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });
    await nodeConnectionManager.withConnF(serverNodeId1, async () => {
      // Do nothing
    });
    expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeTrue();
    expect(nodeConnectionManager.listConnections()).toHaveLength(1);
    await nodeConnectionManager.withConnF(serverNodeId1, async () => {
      // Do nothing
    });
    expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeTrue();
    expect(nodeConnectionManager.listConnections()).toHaveLength(1);

    await nodeConnectionManager.stop();
  });
  test('should create 1 connection with concurrent creates', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });
    const waitProm = promise<void>();
    const tryConnection = () => {
      return nodeConnectionManager.withConnF(serverNodeId1, async () => {
        // Do nothing
        await waitProm.p;
      });
    };
    const tryProm = Promise.all([
      tryConnection(),
      tryConnection(),
      tryConnection(),
      tryConnection(),
      tryConnection(),
    ]);
    waitProm.resolveP();
    await tryProm;
    expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeTrue();
    expect(nodeConnectionManager.listConnections()).toHaveLength(1);

    await nodeConnectionManager.stop();
  });
  test('should destroy a connection', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });
    await nodeConnectionManager.withConnF(serverNodeId1, async () => {
      // Do nothing
    });
    expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeTrue();
    expect(nodeConnectionManager.listConnections()).toHaveLength(1);

    // @ts-ignore: Kidnap protected property
    const connectionMap = nodeConnectionManager.connections;
    const connection = connectionMap.get(
      serverNodeId1.toString() as NodeIdString,
    );
    await connection!.connection.destroy({ force: true });

    // Waiting for connection to clean up from map
    await sleep(100);
    expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeFalse();
    expect(nodeConnectionManager.listConnections()).toHaveLength(0);

    await nodeConnectionManager.stop();
  });
  test('stopping should destroy all connections', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });
    await nodeConnectionManager.withConnF(serverNodeId1, async () => {
      // Do nothing
    });
    expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeTrue();
    expect(nodeConnectionManager.listConnections()).toHaveLength(1);

    // @ts-ignore: Kidnap protected property
    const connectionMap = nodeConnectionManager.connections;
    await nodeConnectionManager.stop();

    // Waiting for connection to clean up from map
    expect(connectionMap.size).toBe(0);
  });
  test('should ping node with address', async () => {
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });
    const result = await nodeConnectionManager.pingNode(serverNodeId1, [
      {
        host: localHost as Host,
        port: nodeConnectionManagerPeer1.port,
        scopes: ['local'],
      },
    ]);
    expect(result).toBeTrue();
    expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeTrue();

    await nodeConnectionManager.stop();
  });
  test('should fail to ping non existent node', async () => {
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });
    const result = await nodeConnectionManager.pingNode(
      serverNodeId1,
      [
        {
          host: localHost as Host,
          port: 12345 as Port,
          scopes: ['local'],
        },
      ],
      { timer: 100 },
    );
    expect(result).toBeFalse();
    expect(nodeConnectionManager.hasConnection(serverNodeId1)).toBeFalse();

    await nodeConnectionManager.stop();
  });
  test('should fail to ping node if NodeId does not match', async () => {
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });
    const result = await nodeConnectionManager.pingNode(clientNodeId, [
      {
        host: localHost as Host,
        port: nodeConnectionManagerPeer1.port,
        scopes: ['local'],
      },
    ]);
    expect(result).toBeFalse();
    expect(nodeConnectionManager.hasConnection(clientNodeId)).toBeFalse();

    await nodeConnectionManager.stop();
  });
  test('use multi-connection to connect to one node with multiple addresses', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    await nodeGraph.setNode(serverNodeId2, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });

    const connectedNodes = await nodeConnectionManager.getMultiConnection(
      [serverNodeId1],
      [
        {
          host: '127.0.0.1' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.2' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.3' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
      ],
      { timer: 200 },
    );
    expect(connectedNodes.length).toBe(1);
    expect(nodesUtils.encodeNodeId(connectedNodes[0])).toBe(
      serverNodeIdEncoded1,
    );

    await nodeConnectionManager.stop();
  });
  test('use multi-connection to connect to multiple nodes with multiple addresses', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    await nodeGraph.setNode(serverNodeId2, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });

    const connectedNodes = await nodeConnectionManager.getMultiConnection(
      [serverNodeId1, serverNodeId2],
      [
        {
          host: '127.0.0.1' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.2' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.3' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.1' as Host,
          port: nodeConnectionManagerPeer2.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.2' as Host,
          port: nodeConnectionManagerPeer2.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.3' as Host,
          port: nodeConnectionManagerPeer2.port,
          scopes: ['global'],
        },
      ],
      { timer: 200 },
    );
    expect(connectedNodes.length).toBe(2);
    const connectedIdStrings = connectedNodes.map((v) =>
      nodesUtils.encodeNodeId(v),
    );
    expect(connectedIdStrings).toContain(serverNodeIdEncoded1);
    expect(connectedIdStrings).toContain(serverNodeIdEncoded2);

    await nodeConnectionManager.stop();
  });
  test('use multi-connection to connect to multiple nodes with single address', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    await nodeGraph.setNode(serverNodeId2, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });

    const connectedNodes = await nodeConnectionManager.getMultiConnection(
      [serverNodeId1, serverNodeId2],
      [
        {
          host: '127.0.0.1' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
      ],
      { timer: 200 },
    );
    expect(connectedNodes.length).toBe(1);
    const connectedIdStrings = connectedNodes.map((v) =>
      nodesUtils.encodeNodeId(v),
    );
    expect(connectedIdStrings).toContain(serverNodeIdEncoded1);
    expect(connectedIdStrings).not.toContain(serverNodeIdEncoded2);

    await nodeConnectionManager.stop();
  });
  test.todo('multi-connection respects locking');
  test('multi-connection ends early when all nodes are connected to', async () => {
    await nodeGraph.setNode(serverNodeId1, serverAddress1);
    await nodeGraph.setNode(serverNodeId2, serverAddress1);
    nodeConnectionManager = new NodeConnectionManager({
      keyRing: keyRingClient,
      logger: logger.getChild(NodeConnectionManager.name),
      nodeGraph,
      tlsConfig: clientTlsConfig,
      seedNodes: undefined,
    });
    await nodeConnectionManager.start({
      host: localHost,
    });

    const connectedNodesProm = nodeConnectionManager.getMultiConnection(
      [serverNodeId1, serverNodeId2],
      [
        {
          host: '127.0.0.1' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.2' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.3' as Host,
          port: nodeConnectionManagerPeer1.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.1' as Host,
          port: nodeConnectionManagerPeer2.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.2' as Host,
          port: nodeConnectionManagerPeer2.port,
          scopes: ['global'],
        },
        {
          host: '127.0.0.3' as Host,
          port: nodeConnectionManagerPeer2.port,
          scopes: ['global'],
        },
      ],
      { timer: 2000 },
    );
    const result = await Promise.race([
      sleep(1000).then(() => false),
      connectedNodesProm,
    ]);

    if (result === false || result === true) {
      // Wait for everything to settle
      await connectedNodesProm.catch(() => {});
      throw Error(
        'connectedNodesProm did not resolve early after connecting to all nodeIds',
      );
    }

    expect(result.length).toBe(2);
    const connectedIdStrings = result.map((v) => nodesUtils.encodeNodeId(v));
    expect(connectedIdStrings).toContain(serverNodeIdEncoded1);
    expect(connectedIdStrings).toContain(serverNodeIdEncoded2);

    await nodeConnectionManager.stop();
  });
});
