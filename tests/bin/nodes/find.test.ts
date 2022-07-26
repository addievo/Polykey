import type { Host, Port } from '@/network/types';
import type { NodeId } from '@/nodes/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from '@/PolykeyAgent';
import * as nodesUtils from '@/nodes/utils';
import { sysexits } from '@/errors';
import * as testBinUtils from '../utils';
import * as testNodesUtils from '../../nodes/utils';
import { globalRootKeyPems } from '../../globalRootKeyPems';
import { runTestIfPlatforms } from '../../utils';

describe('find', () => {
  const logger = new Logger('find test', LogLevel.WARN, [new StreamHandler()]);
  const password = 'helloworld';
  let dataDir: string;
  let nodePath: string;
  let polykeyAgent: PolykeyAgent;
  let remoteOnline: PolykeyAgent;
  let remoteOffline: PolykeyAgent;
  let remoteOnlineNodeId: NodeId;
  let remoteOfflineNodeId: NodeId;
  let remoteOnlineHost: Host;
  let remoteOnlinePort: Port;
  let remoteOfflineHost: Host;
  let remoteOfflinePort: Port;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(global.tmpDir, 'polykey-test-'),
    );
    nodePath = path.join(dataDir, 'keynode');
    polykeyAgent = await PolykeyAgent.createPolykeyAgent({
      password,
      nodePath,
      networkConfig: {
        proxyHost: '127.0.0.1' as Host,
        forwardHost: '127.0.0.1' as Host,
        agentHost: '127.0.0.1' as Host,
        clientHost: '127.0.0.1' as Host,
      },
      nodeConnectionManagerConfig: {
        connConnectTime: 2000,
        connTimeoutTime: 2000,
      },
      keysConfig: {
        privateKeyPemOverride: globalRootKeyPems[0],
      },
      seedNodes: {}, // Explicitly no seed nodes on startup
      logger,
    });
    // Setting up a remote keynode
    remoteOnline = await PolykeyAgent.createPolykeyAgent({
      password,
      nodePath: path.join(dataDir, 'remoteOnline'),
      networkConfig: {
        proxyHost: '127.0.0.1' as Host,
        forwardHost: '127.0.0.1' as Host,
        agentHost: '127.0.0.1' as Host,
        clientHost: '127.0.0.1' as Host,
      },
      keysConfig: {
        privateKeyPemOverride: globalRootKeyPems[1],
      },
      logger,
    });
    remoteOnlineNodeId = remoteOnline.keyManager.getNodeId();
    remoteOnlineHost = remoteOnline.proxy.getProxyHost();
    remoteOnlinePort = remoteOnline.proxy.getProxyPort();
    await testNodesUtils.nodesConnect(polykeyAgent, remoteOnline);
    // Setting up an offline remote keynode
    remoteOffline = await PolykeyAgent.createPolykeyAgent({
      password,
      nodePath: path.join(dataDir, 'remoteOffline'),
      networkConfig: {
        proxyHost: '127.0.0.1' as Host,
        forwardHost: '127.0.0.1' as Host,
        agentHost: '127.0.0.1' as Host,
        clientHost: '127.0.0.1' as Host,
      },
      keysConfig: {
        privateKeyPemOverride: globalRootKeyPems[2],
      },
      logger,
    });
    remoteOfflineNodeId = remoteOffline.keyManager.getNodeId();
    remoteOfflineHost = remoteOffline.proxy.getProxyHost();
    remoteOfflinePort = remoteOffline.proxy.getProxyPort();
    await testNodesUtils.nodesConnect(polykeyAgent, remoteOffline);
    await remoteOffline.stop();
  });
  afterEach(async () => {
    await polykeyAgent.stop();
    await polykeyAgent.destroy();
    await remoteOnline.stop();
    await remoteOnline.destroy();
    await remoteOffline.stop();
    await remoteOffline.destroy();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  runTestIfPlatforms('linux')('finds an online node', async () => {
    const { exitCode, stdout } = await testBinUtils.pkStdio(
      [
        'nodes',
        'find',
        nodesUtils.encodeNodeId(remoteOnlineNodeId),
        '--format',
        'json',
      ],
      {
        PK_NODE_PATH: nodePath,
        PK_PASSWORD: password,
      },
      dataDir,
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      success: true,
      message: `Found node at ${remoteOnlineHost}:${remoteOnlinePort}`,
      id: nodesUtils.encodeNodeId(remoteOnlineNodeId),
      host: remoteOnlineHost,
      port: remoteOnlinePort,
    });
  });
  runTestIfPlatforms('linux')('finds an offline node', async () => {
    const { exitCode, stdout } = await testBinUtils.pkStdio(
      [
        'nodes',
        'find',
        nodesUtils.encodeNodeId(remoteOfflineNodeId),
        '--format',
        'json',
      ],
      {
        PK_NODE_PATH: nodePath,
        PK_PASSWORD: password,
      },
      dataDir,
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      success: true,
      message: `Found node at ${remoteOfflineHost}:${remoteOfflinePort}`,
      id: nodesUtils.encodeNodeId(remoteOfflineNodeId),
      host: remoteOfflineHost,
      port: remoteOfflinePort,
    });
  });
  runTestIfPlatforms('linux')(
    'fails to find an unknown node',
    async () => {
      const unknownNodeId = nodesUtils.decodeNodeId(
        'vrcacp9vsb4ht25hds6s4lpp2abfaso0mptcfnh499n35vfcn2gkg',
      );
      const { exitCode, stdout } = await testBinUtils.pkStdio(
        [
          'nodes',
          'find',
          nodesUtils.encodeNodeId(unknownNodeId!),
          '--format',
          'json',
        ],
        {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        dataDir,
      );
      expect(exitCode).toBe(sysexits.GENERAL);
      expect(JSON.parse(stdout)).toEqual({
        success: false,
        message: `Failed to find node ${nodesUtils.encodeNodeId(
          unknownNodeId!,
        )}`,
        id: nodesUtils.encodeNodeId(unknownNodeId!),
        host: '',
        port: 0,
      });
    },
    global.failedConnectionTimeout,
  );
});
