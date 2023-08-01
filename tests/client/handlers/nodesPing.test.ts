import type { TLSConfig } from '@/network/types';
import type GestaltGraph from '../../../src/gestalts/GestaltGraph';
import type { NodeIdEncoded } from '@/ids';
import type { Host as QUICHost } from '@matrixai/quic/dist/types';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Logger, { formatting, LogLevel, StreamHandler } from '@matrixai/logger';
import { DB } from '@matrixai/db';
import { QUICSocket } from '@matrixai/quic';
import KeyRing from '@/keys/KeyRing';
import * as keysUtils from '@/keys/utils';
import RPCServer from '@/rpc/RPCServer';
import { NodesPingHandler } from '@/client/handlers/nodesPing';
import RPCClient from '@/rpc/RPCClient';
import WebSocketServer from '@/websockets/WebSocketServer';
import WebSocketClient from '@/websockets/WebSocketClient';
import * as validationErrors from '@/validation/errors';
import { nodesPing } from '@/client';
import * as testsUtils from '../../utils/utils';
import * as tlsTestsUtils from '../../utils/tls';
import Sigchain from '../../../src/sigchain/Sigchain';
import NodeGraph from '../../../src/nodes/NodeGraph';
import TaskManager from '../../../src/tasks/TaskManager';
import NodeConnectionManager from '../../../src/nodes/NodeConnectionManager';
import NodeManager from '../../../src/nodes/NodeManager';

describe('nodesPing', () => {
  const logger = new Logger('agentUnlock test', LogLevel.WARN, [
    new StreamHandler(
      formatting.format`${formatting.level}:${formatting.keys}:${formatting.msg}`,
    ),
  ]);
  const password = 'helloWorld';
  const host = '127.0.0.1';
  let dataDir: string;
  let db: DB;
  let keyRing: KeyRing;
  let webSocketClient: WebSocketClient;
  let webSocketServer: WebSocketServer;
  let tlsConfig: TLSConfig;
  let nodeGraph: NodeGraph;
  let taskManager: TaskManager;
  let nodeConnectionManager: NodeConnectionManager;
  let quicSocket: QUICSocket;
  let nodeManager: NodeManager;
  let sigchain: Sigchain;
  let mockedPingNode: jest.SpyInstance;

  beforeEach(async () => {
    mockedPingNode = jest.spyOn(NodeManager.prototype, 'pingNode');
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    const keysPath = path.join(dataDir, 'keys');
    keyRing = await KeyRing.createKeyRing({
      password,
      keysPath,
      logger,
      passwordOpsLimit: keysUtils.passwordOpsLimits.min,
      passwordMemLimit: keysUtils.passwordMemLimits.min,
      strictMemoryLock: false,
    });
    tlsConfig = await tlsTestsUtils.createTLSConfig(keyRing.keyPair);
    const dbPath = path.join(dataDir, 'db');
    db = await DB.createDB({
      dbPath,
      logger,
    });
    sigchain = await Sigchain.createSigchain({
      db,
      keyRing,
      logger,
    });
    nodeGraph = await NodeGraph.createNodeGraph({
      db,
      keyRing,
      logger: logger.getChild('NodeGraph'),
    });
    taskManager = await TaskManager.createTaskManager({
      db,
      logger,
      lazy: true,
    });
    const crypto = tlsTestsUtils.createCrypto();
    quicSocket = new QUICSocket({
      logger,
    });
    await quicSocket.start({
      host: '127.0.0.1' as QUICHost,
    });
    nodeConnectionManager = new NodeConnectionManager({
      keyRing,
      nodeGraph,
      quicClientConfig: {
        // @ts-ignore: TLS not needed for this test
        key: undefined,
        // @ts-ignore: TLS not needed for this test
        cert: undefined,
      },
      crypto,
      quicSocket,
      connectionConnectTime: 2000,
      connectionTimeoutTime: 2000,
      logger: logger.getChild('NodeConnectionManager'),
    });
    nodeManager = new NodeManager({
      db,
      keyRing,
      nodeConnectionManager,
      nodeGraph,
      sigchain,
      taskManager,
      gestaltGraph: {} as GestaltGraph,
      logger,
    });
    await nodeConnectionManager.start({ nodeManager });
    await taskManager.startProcessing();
  });
  afterEach(async () => {
    mockedPingNode.mockRestore();
    await taskManager.stopProcessing();
    await taskManager.stopTasks();
    await webSocketServer.stop(true);
    await webSocketClient.destroy(true);
    await sigchain.stop();
    await nodeGraph.stop();
    await nodeConnectionManager.stop();
    await quicSocket.stop();
    await db.stop();
    await keyRing.stop();
    await taskManager.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('pings a node (offline)', async () => {
    // Setup
    const rpcServer = await RPCServer.createRPCServer({
      manifest: {
        nodesPing: new NodesPingHandler({
          nodeManager,
        }),
      },
      logger,
    });
    webSocketServer = await WebSocketServer.createWebSocketServer({
      connectionCallback: (streamPair) => rpcServer.handleStream(streamPair),
      host,
      tlsConfig,
      logger: logger.getChild('server'),
    });
    webSocketClient = await WebSocketClient.createWebSocketClient({
      expectedNodeIds: [keyRing.getNodeId()],
      host,
      logger: logger.getChild('client'),
      port: webSocketServer.getPort(),
    });
    const rpcClient = await RPCClient.createRPCClient({
      manifest: {
        nodesPing,
      },
      streamFactory: (ctx) => webSocketClient.startConnection(ctx),
      logger: logger.getChild('clientRPC'),
    });

    // Doing the test
    mockedPingNode.mockResolvedValue(false);
    const response = await rpcClient.methods.nodesPing({
      nodeIdEncoded:
        'vrsc24a1er424epq77dtoveo93meij0pc8ig4uvs9jbeld78n9nl0' as NodeIdEncoded,
    });
    expect(response.success).toBeFalsy();
  });
  test('pings a node (online)', async () => {
    // Setup
    const rpcServer = await RPCServer.createRPCServer({
      manifest: {
        nodesPing: new NodesPingHandler({
          nodeManager,
        }),
      },
      logger,
    });
    webSocketServer = await WebSocketServer.createWebSocketServer({
      connectionCallback: (streamPair) => rpcServer.handleStream(streamPair),
      host,
      tlsConfig,
      logger: logger.getChild('server'),
    });
    webSocketClient = await WebSocketClient.createWebSocketClient({
      expectedNodeIds: [keyRing.getNodeId()],
      host,
      logger: logger.getChild('client'),
      port: webSocketServer.getPort(),
    });
    const rpcClient = await RPCClient.createRPCClient({
      manifest: {
        nodesPing,
      },
      streamFactory: (ctx) => webSocketClient.startConnection(ctx),
      logger: logger.getChild('clientRPC'),
    });

    // Doing the test
    mockedPingNode.mockResolvedValue(true);
    const response = await rpcClient.methods.nodesPing({
      nodeIdEncoded:
        'vrsc24a1er424epq77dtoveo93meij0pc8ig4uvs9jbeld78n9nl0' as NodeIdEncoded,
    });
    expect(response.success).toBeTruthy();
  });
  test('cannot ping an invalid node', async () => {
    // Setup
    const rpcServer = await RPCServer.createRPCServer({
      manifest: {
        nodesPing: new NodesPingHandler({
          nodeManager,
        }),
      },
      logger,
    });
    webSocketServer = await WebSocketServer.createWebSocketServer({
      connectionCallback: (streamPair) => rpcServer.handleStream(streamPair),
      host,
      tlsConfig,
      logger: logger.getChild('server'),
    });
    webSocketClient = await WebSocketClient.createWebSocketClient({
      expectedNodeIds: [keyRing.getNodeId()],
      host,
      logger: logger.getChild('client'),
      port: webSocketServer.getPort(),
    });
    const rpcClient = await RPCClient.createRPCClient({
      manifest: {
        nodesPing,
      },
      streamFactory: (ctx) => webSocketClient.startConnection(ctx),
      logger: logger.getChild('clientRPC'),
    });

    // Doing the test
    await testsUtils.expectRemoteError(
      rpcClient.methods.nodesPing({
        nodeIdEncoded: 'nodeId' as NodeIdEncoded,
      }),
      validationErrors.ErrorValidation,
    );
  });
});
