import type { NodeId, NodeInfo } from '@/nodes/types';

import fs from 'fs';
import os from 'os';
import path from 'path';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import * as grpc from '@grpc/grpc-js';

import { KeyManager } from '@/keys';
import { NodeManager } from '@/nodes';
import { VaultManager } from '@/vaults';
import { Sigchain } from '@/sigchain';
import { ACL } from '@/acl';
import { GestaltGraph } from '@/gestalts';
import { agentPB, GRPCClientAgent } from '@/agent';
import { ForwardProxy, ReverseProxy } from '@/network';
import { DB } from '@/db';
import { NotificationsManager } from '@/notifications';

import * as testUtils from './utils';

describe('GRPC agent', () => {
  const logger = new Logger('AgentServerTest', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  const node1: NodeInfo = {
    id: '12345' as NodeId,
    chain: {},
  };

  let client: GRPCClientAgent;
  let server: grpc.Server;
  let port: number;

  let dataDir: string;
  let keysPath: string;
  let vaultsPath: string;
  let dbPath: string;

  let keyManager: KeyManager;
  let vaultManager: VaultManager;
  let nodeManager: NodeManager;
  let sigchain: Sigchain;
  let acl: ACL;
  let gestaltGraph: GestaltGraph;
  let db: DB;
  let notificationsManager: NotificationsManager;

  let fwdProxy: ForwardProxy;
  let revProxy: ReverseProxy;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    keysPath = path.join(dataDir, 'keys');
    vaultsPath = path.join(dataDir, 'vaults');
    dbPath = path.join(dataDir, 'db');

    fwdProxy = new ForwardProxy({
      authToken: 'abc',
      logger: logger,
    });

    revProxy = new ReverseProxy({
      logger: logger,
    });

    keyManager = new KeyManager({
      keysPath,
      fs: fs,
      logger: logger,
    });

    db = new DB({
      dbPath: dbPath,
      fs: fs,
      logger: logger,
    });

    acl = new ACL({
      db: db,
      logger: logger,
    });

    gestaltGraph = new GestaltGraph({
      db: db,
      acl: acl,
      logger: logger,
    });

    sigchain = new Sigchain({
      keyManager: keyManager,
      db: db,
      logger: logger,
    });

    nodeManager = new NodeManager({
      db: db,
      sigchain: sigchain,
      keyManager: keyManager,
      fwdProxy: fwdProxy,
      revProxy: revProxy,
      fs: fs,
      logger: logger,
    });

    notificationsManager = new NotificationsManager({
      acl: acl,
      db: db,
      nodeManager: nodeManager,
      keyManager: keyManager,
      messageCap: 5,
      logger: logger,
    });

    vaultManager = new VaultManager({
      vaultsPath: vaultsPath,
      keyManager: keyManager,
      nodeManager: nodeManager,
      db: db,
      acl: acl,
      gestaltGraph: gestaltGraph,
      fs: fs,
      logger: logger,
    });

    await keyManager.start({ password: 'password' });
    await db.start({ keyPair: keyManager.getRootKeyPair() });
    await acl.start();
    await gestaltGraph.start();
    await nodeManager.start({ nodeId: 'NODEID' as NodeId });
    await notificationsManager.start();
    await vaultManager.start({});

    [server, port] = await testUtils.openTestAgentServer({
      vaultManager,
      nodeManager,
      sigchain,
      notificationsManager,
    });

    client = await testUtils.openTestAgentClient(port);
  });
  afterEach(async () => {
    await testUtils.closeTestAgentClient(client);
    await testUtils.closeTestAgentServer(server);

    await vaultManager.stop();
    await notificationsManager.stop();
    await nodeManager.stop();
    await gestaltGraph.stop();
    await acl.stop();
    await db.stop();
    await keyManager.stop();

    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('echo', async () => {
    const echoMessage = new agentPB.EchoMessage();
    echoMessage.setChallenge('yes');
    await client.echo(echoMessage);
    const response = await client.echo(echoMessage);
    expect(response.getChallenge()).toBe('yes');
  });
  test('can check permissions', async () => {
    const vault = await vaultManager.createVault('TestAgentVault');
    await gestaltGraph.setNode(node1);
    await vaultManager.setVaultPermissions('12345' as NodeId, vault.vaultId);
    await vaultManager.unsetVaultPermissions('12345' as NodeId, vault.vaultId);
    const vaultPermMessage = new agentPB.VaultPermMessage();
    vaultPermMessage.setNodeid('12345');
    vaultPermMessage.setVaultid(vault.vaultId);
    const response = await client.checkVaultPermissions(vaultPermMessage);
    expect(response.getPermission()).toBeFalsy();
    await vaultManager.setVaultPermissions('12345' as NodeId, vault.vaultId);
    const response2 = await client.checkVaultPermissions(vaultPermMessage);
    expect(response2.getPermission()).toBeTruthy();
    await vaultManager.deleteVault(vault.vaultId);
  });
  test('can scan vaults', async () => {
    const vault = await vaultManager.createVault('TestAgentVault');
    await gestaltGraph.setNode(node1);
    const NodeIdMessage = new agentPB.NodeIdMessage();
    NodeIdMessage.setNodeid('12345');
    const response = client.scanVaults(NodeIdMessage);
    const data: string[] = [];
    for await (const resp of response) {
      const chunk = resp.getVault_asU8();
      data.push(Buffer.from(chunk).toString());
    }
    expect(data).toStrictEqual([]);
    await vaultManager.setVaultPermissions('12345' as NodeId, vault.vaultId);
    const response2 = client.scanVaults(NodeIdMessage);
    const data2: string[] = [];
    for await (const resp of response2) {
      const chunk = resp.getVault_asU8();
      data2.push(Buffer.from(chunk).toString());
    }
    expect(data2).toStrictEqual([`${vault.vaultName}\t${vault.vaultId}`]);
    await vaultManager.deleteVault(vault.vaultId);
  });
});
