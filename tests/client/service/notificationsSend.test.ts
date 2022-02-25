import type { Host, Port } from '@/network/types';
import type { SignedNotification } from '@/notifications/types';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { Metadata } from '@grpc/grpc-js';
import { DB } from '@matrixai/db';
import KeyManager from '@/keys/KeyManager';
import GRPCServer from '@/grpc/GRPCServer';
import NodeConnectionManager from '@/nodes/NodeConnectionManager';
import NodeGraph from '@/nodes/NodeGraph';
import NodeManager from '@/nodes/NodeManager';
import Sigchain from '@/sigchain/Sigchain';
import ForwardProxy from '@/network/ForwardProxy';
import ReverseProxy from '@/network/ReverseProxy';
import NotificationsManager from '@/notifications/NotificationsManager';
import ACL from '@/acl/ACL';
import GRPCClientClient from '@/client/GRPCClientClient';
import notificationsSend from '@/client/service/notificationsSend';
import { ClientServiceService } from '@/proto/js/polykey/v1/client_service_grpc_pb';
import * as utilsPB from '@/proto/js/polykey/v1/utils/utils_pb';
import * as notificationsPB from '@/proto/js/polykey/v1/notifications/notifications_pb';
import * as keysUtils from '@/keys/utils';
import * as nodesUtils from '@/nodes/utils';
import * as notificationsUtils from '@/notifications/utils';
import * as clientUtils from '@/client/utils';
import * as testUtils from '../../utils';

describe('notificationsSend', () => {
  const logger = new Logger('notificationsSend test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  const password = 'helloworld';
  const authenticate = async (metaClient, metaServer = new Metadata()) =>
    metaServer;
  let mockedGenerateKeyPair: jest.SpyInstance;
  let mockedGenerateDeterministicKeyPair: jest.SpyInstance;
  let mockedSignNotification: jest.SpyInstance;
  let mockedSendNotification: jest.SpyInstance;
  beforeAll(async () => {
    const globalKeyPair = await testUtils.setupGlobalKeypair();
    mockedGenerateKeyPair = jest
      .spyOn(keysUtils, 'generateKeyPair')
      .mockResolvedValue(globalKeyPair);
    mockedGenerateDeterministicKeyPair = jest
      .spyOn(keysUtils, 'generateDeterministicKeyPair')
      .mockResolvedValue(globalKeyPair);
    mockedSignNotification = jest
      .spyOn(notificationsUtils, 'signNotification')
      .mockImplementation(async () => {
        return 'signedNotification' as SignedNotification;
      });
    mockedSendNotification = jest
      .spyOn(NodeConnectionManager.prototype, 'withConnF')
      .mockImplementation();
  });
  afterAll(async () => {
    mockedGenerateKeyPair.mockRestore();
    mockedGenerateDeterministicKeyPair.mockRestore();
    mockedSignNotification.mockRestore();
    mockedSendNotification.mockRestore();
  });
  const authToken = 'abc123';
  let dataDir: string;
  let nodeGraph: NodeGraph;
  let nodeConnectionManager: NodeConnectionManager;
  let nodeManager: NodeManager;
  let notificationsManager: NotificationsManager;
  let acl: ACL;
  let sigchain: Sigchain;
  let fwdProxy: ForwardProxy;
  let revProxy: ReverseProxy;
  let db: DB;
  let keyManager: KeyManager;
  let grpcServer: GRPCServer;
  let grpcClient: GRPCClientClient;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    const keysPath = path.join(dataDir, 'keys');
    keyManager = await KeyManager.createKeyManager({
      password,
      keysPath,
      logger,
    });
    const dbPath = path.join(dataDir, 'db');
    db = await DB.createDB({
      dbPath,
      logger,
    });
    acl = await ACL.createACL({
      db,
      logger,
    });
    fwdProxy = new ForwardProxy({
      authToken,
      logger,
    });
    await fwdProxy.start({
      tlsConfig: {
        keyPrivatePem: keyManager.getRootKeyPairPem().privateKey,
        certChainPem: await keyManager.getRootCertChainPem(),
      },
    });
    revProxy = new ReverseProxy({ logger });
    await revProxy.start({
      serverHost: '1.1.1.1' as Host,
      serverPort: 1 as Port,
      tlsConfig: {
        keyPrivatePem: keyManager.getRootKeyPairPem().privateKey,
        certChainPem: await keyManager.getRootCertChainPem(),
      },
    });
    sigchain = await Sigchain.createSigchain({
      db,
      keyManager,
      logger,
    });
    nodeGraph = await NodeGraph.createNodeGraph({
      db,
      keyManager,
      logger: logger.getChild('NodeGraph'),
    });
    nodeConnectionManager = new NodeConnectionManager({
      keyManager,
      nodeGraph,
      fwdProxy,
      revProxy,
      connConnectTime: 2000,
      connTimeoutTime: 2000,
      logger: logger.getChild('NodeConnectionManager'),
    });
    await nodeConnectionManager.start();
    nodeManager = new NodeManager({
      db,
      keyManager,
      nodeGraph,
      nodeConnectionManager,
      sigchain,
      logger,
    });
    notificationsManager =
      await NotificationsManager.createNotificationsManager({
        acl,
        db,
        nodeConnectionManager,
        nodeManager,
        keyManager,
        logger,
      });
    const clientService = {
      notificationsSend: notificationsSend({
        authenticate,
        notificationsManager,
      }),
    };
    grpcServer = new GRPCServer({ logger });
    await grpcServer.start({
      services: [[ClientServiceService, clientService]],
      host: '127.0.0.1' as Host,
      port: 0 as Port,
    });
    grpcClient = await GRPCClientClient.createGRPCClientClient({
      nodeId: keyManager.getNodeId(),
      host: '127.0.0.1' as Host,
      port: grpcServer.getPort(),
      logger,
    });
  });
  afterEach(async () => {
    await grpcClient.destroy();
    await grpcServer.stop();
    await notificationsManager.stop();
    await nodeGraph.stop();
    await nodeConnectionManager.stop();
    await sigchain.stop();
    await revProxy.stop();
    await fwdProxy.stop();
    await acl.stop();
    await db.stop();
    await keyManager.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('sends a notification', async () => {
    const receiverNodeIdEncoded =
      'vrsc24a1er424epq77dtoveo93meij0pc8ig4uvs9jbeld78n9nl0';
    const generalMessage = new notificationsPB.General();
    generalMessage.setMessage('test');
    const request = new notificationsPB.Send();
    request.setData(generalMessage);
    request.setReceiverId(receiverNodeIdEncoded);
    const response = await grpcClient.notificationsSend(
      request,
      clientUtils.encodeAuthFromPassword(password),
    );
    expect(response).toBeInstanceOf(utilsPB.EmptyMessage);
    // Check we signed and sent the notification
    expect(mockedSignNotification.mock.calls.length).toBe(1);
    expect(mockedSendNotification.mock.calls.length).toBe(1);
    expect(
      nodesUtils.encodeNodeId(mockedSendNotification.mock.calls[0][0]),
    ).toEqual(receiverNodeIdEncoded);
    // Check notification content
    expect(mockedSignNotification.mock.calls[0][0]).toEqual({
      data: {
        type: 'General',
        message: 'test',
      },
      senderId: nodesUtils.encodeNodeId(keyManager.getNodeId()),
      isRead: false,
    });
  });
});
