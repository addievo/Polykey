import type { TLSConfig } from '@/network/types';
import type { IdentityId, ProviderId } from '@/ids/index';
import type { GestaltIdentityInfo } from '@/gestalts/types';
import type { Host as QUICHost } from '@matrixai/quic';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Logger, { formatting, LogLevel, StreamHandler } from '@matrixai/logger';
import { DB } from '@matrixai/db';
import { QUICSocket } from '@matrixai/quic';
import KeyRing from '@/keys/KeyRing';
import * as keysUtils from '@/keys/utils';
import RPCServer from '@/rpc/RPCServer';
import TaskManager from '@/tasks/TaskManager';
import { GestaltsDiscoveryByIdentityHandler } from '@/client/handlers/gestaltsDiscoveryByIdentity';
import RPCClient from '@/rpc/RPCClient';
import WebSocketServer from '@/websockets/WebSocketServer';
import WebSocketClient from '@/websockets/WebSocketClient';
import GestaltGraph from '@/gestalts/GestaltGraph';
import ACL from '@/acl/ACL';
import { gestaltsDiscoveryByIdentity } from '@/client';
import * as tlsTestsUtils from '../../utils/tls';
import Discovery from '../../../src/discovery/Discovery';
import NodeConnectionManager from '../../../src/nodes/NodeConnectionManager';
import NodeManager from '../../../src/nodes/NodeManager';
import IdentitiesManager from '../../../src/identities/IdentitiesManager';
import Sigchain from '../../../src/sigchain/Sigchain';
import NodeGraph from '../../../src/nodes/NodeGraph';

describe('gestaltsDiscoverByIdentity', () => {
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
  let taskManager: TaskManager;
  let webSocketClient: WebSocketClient;
  let webSocketServer: WebSocketServer;
  let tlsConfig: TLSConfig;
  let acl: ACL;
  let gestaltGraph: GestaltGraph;
  let identitiesManager: IdentitiesManager;
  let nodeGraph: NodeGraph;
  let sigchain: Sigchain;
  let nodeManager: NodeManager;
  let quicSocket: QUICSocket;
  let nodeConnectionManager: NodeConnectionManager;
  let discovery: Discovery;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    const keysPath = path.join(dataDir, 'keys');
    const dbPath = path.join(dataDir, 'db');
    db = await DB.createDB({
      dbPath,
      logger,
    });
    keyRing = await KeyRing.createKeyRing({
      password,
      keysPath,
      logger,
      passwordOpsLimit: keysUtils.passwordOpsLimits.min,
      passwordMemLimit: keysUtils.passwordMemLimits.min,
      strictMemoryLock: false,
    });
    taskManager = await TaskManager.createTaskManager({
      db,
      logger,
      lazy: true,
    });
    tlsConfig = await tlsTestsUtils.createTLSConfig(keyRing.keyPair);
    acl = await ACL.createACL({
      db,
      logger,
    });
    gestaltGraph = await GestaltGraph.createGestaltGraph({
      acl,
      db,
      logger,
    });
    identitiesManager = await IdentitiesManager.createIdentitiesManager({
      keyRing,
      sigchain,
      db,
      gestaltGraph,
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
      connConnectTime: 2000,
      connTimeoutTime: 2000,
      logger: logger.getChild('NodeConnectionManager'),
    });
    nodeManager = new NodeManager({
      db,
      keyRing,
      nodeConnectionManager,
      nodeGraph,
      sigchain,
      taskManager,
      gestaltGraph,
      logger,
    });
    await nodeManager.start();
    await nodeConnectionManager.start({ nodeManager });
    discovery = await Discovery.createDiscovery({
      db,
      gestaltGraph,
      identitiesManager,
      keyRing,
      logger,
      nodeManager,
      taskManager,
    });
    await taskManager.startProcessing();
  });
  afterEach(async () => {
    await taskManager.stopProcessing();
    await taskManager.stopTasks();
    await discovery.stop();
    await nodeGraph.stop();
    await nodeConnectionManager.stop();
    await quicSocket.stop();
    await nodeManager.stop();
    await sigchain.stop();
    await identitiesManager.stop();
    await webSocketServer.stop(true);
    await webSocketClient.destroy(true);
    await acl.stop();
    await gestaltGraph.stop();
    await taskManager.stop();
    await keyRing.stop();
    await db.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('discovers by identity', async () => {
    // Setup
    const rpcServer = await RPCServer.createRPCServer({
      manifest: {
        gestaltsDiscoveryByIdentity: new GestaltsDiscoveryByIdentityHandler({
          discovery,
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
        gestaltsDiscoveryByIdentity,
      },
      streamFactory: (ctx) => webSocketClient.startConnection(ctx),
      logger: logger.getChild('clientRPC'),
    });

    // Doing the test
    const identity: GestaltIdentityInfo = {
      identityId: 'identityId' as IdentityId,
      providerId: 'providerId' as ProviderId,
    };
    const mockDiscoveryByIdentity = jest
      .spyOn(Discovery.prototype, 'queueDiscoveryByIdentity')
      .mockResolvedValue();
    const request = {
      providerId: identity.providerId,
      identityId: identity.identityId,
    };
    await rpcClient.methods.gestaltsDiscoveryByIdentity(request);
    expect(mockDiscoveryByIdentity).toHaveBeenCalled();
    mockDiscoveryByIdentity.mockRestore();
  });
});
