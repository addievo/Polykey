import type { IdentityId, IdentityInfo, ProviderId } from '@/identities/types';
import type { NodeIdEncoded, NodeInfo } from '@/nodes/types';
import type { ClaimLinkIdentity } from '@/claims/types';
import type { Gestalt } from '@/gestalts/types';
import os from 'os';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { PolykeyAgent } from '@';
import { poll } from '@/utils';
import * as claimsUtils from '@/claims/utils';
import * as identitiesUtils from '@/identities/utils';
import * as keysUtils from '@/keys/utils';
import * as nodesUtils from '@/nodes/utils';
import * as testBinUtils from '../utils';
import * as testNodesUtils from '../../nodes/utils';
import TestProvider from '../../identities/TestProvider';

function identityString(
  providerId: ProviderId,
  identityId: IdentityId,
): string {
  return `${providerId}:${identityId}`;
}

describe('CLI Identities', () => {
  const password = 'password';
  // Test dependent variables
  let dataDir: string;
  let nodePath: string;
  let passwordFile: string;
  let polykeyAgent: PolykeyAgent;
  let testProvider: TestProvider;
  let mockedBrowser: jest.SpyInstance;

  // Defining constants
  const nodeId1Encoded =
    'vrsc24a1er424epq77dtoveo93meij0pc8ig4uvs9jbeld78n9nl0' as NodeIdEncoded;
  const nodeId1 = nodesUtils.decodeNodeId(nodeId1Encoded)!;
  const nodeId2Encoded =
    'vrcacp9vsb4ht25hds6s4lpp2abfaso0mptcfnh499n35vfcn2gkg' as NodeIdEncoded;
  const nodeId2 = nodesUtils.decodeNodeId(nodeId2Encoded)!;
  const nodeId3Encoded =
    'v359vgrgmqf1r5g4fvisiddjknjko6bmm4qv7646jr7fi9enbfuug' as NodeIdEncoded;
  // Const nodeId3 = nodesUtils.decodeNodeId(nodeId3Encoded);
  const nodeId4Encoded =
    'vm5guqfrrhlrsa70qpauen8jd0lmb0v6j8r8c94p34n738vlvu7vg' as NodeIdEncoded;
  // Const nodeId4 = nodesUtils.decodeNodeId(nodeId4Encoded);
  const dummyNodeEncoded =
    'vi3et1hrpv2m2lrplcm7cu913kr45v51cak54vm68anlbvuf83ra0' as NodeIdEncoded;
  // Const dummyNode = nodesUtils.decodeNodeId(dummyNodeEncoded);

  const logger = new Logger('pkStdio Test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  const node1: NodeInfo = {
    id: nodeId1Encoded,
    chain: {},
  };
  const node2: NodeInfo = {
    id: nodeId2Encoded,
    chain: {},
  };
  const node3: NodeInfo = {
    id: nodeId3Encoded,
    chain: {},
  };
  const keynode: NodeInfo = {
    id: nodeId4Encoded,
    chain: {},
  };
  const invaldNode: NodeInfo = {
    id: dummyNodeEncoded,
    chain: {},
  };
  const identity1: IdentityInfo = {
    providerId: 'github.com' as ProviderId,
    identityId: 'abc' as IdentityId,
    claims: {},
  };
  const invalidIdentity: IdentityInfo = {
    providerId: 'github.com' as ProviderId,
    identityId: 'onetwothree' as IdentityId,
    claims: {},
  };
  const testToken = {
    providerId: 'test-provider' as ProviderId,
    identityId: 'test_user' as IdentityId,
    tokenData: {
      accessToken: 'abc123',
    },
  };

  // Helper functions
  function genCommands(options: Array<string>) {
    return ['identities', ...options, '-np', nodePath];
  }

  const mockedGenerateDeterministicKeyPair = jest.spyOn(
    keysUtils,
    'generateDeterministicKeyPair',
  );

  // Setup and teardown
  beforeAll(async () => {
    mockedGenerateDeterministicKeyPair.mockImplementation((bits, _) => {
      return keysUtils.generateKeyPair(bits);
    });

    // This handles the expensive setting up of the polykey agent.
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    nodePath = path.join(dataDir, 'keynode');
    passwordFile = path.join(dataDir, 'passwordFile');
    await fs.promises.writeFile(passwordFile, 'password');
    polykeyAgent = await PolykeyAgent.createPolykeyAgent({
      password,
      nodePath: nodePath,
      logger: logger,
    });

    keynode.id = nodesUtils.encodeNodeId(polykeyAgent.keyManager.getNodeId());

    testProvider = new TestProvider();
    polykeyAgent.identitiesManager.registerProvider(testProvider);

    mockedBrowser = jest
      .spyOn(identitiesUtils, 'browser')
      .mockImplementation(() => {});

    // Authorize session
    await testBinUtils.pkStdio(
      ['agent', 'unlock', '-np', nodePath, '--password-file', passwordFile],
      {},
      dataDir,
    );
  }, global.polykeyStartupTimeout * 2);
  afterAll(async () => {
    await polykeyAgent.stop();
    await polykeyAgent.destroy();
    mockedBrowser.mockRestore();
    await fs.promises.rmdir(dataDir, { recursive: true });
  });
  beforeEach(async () => {
    // Setting up gestalt state
    await polykeyAgent.gestaltGraph.setNode(keynode);
    await polykeyAgent.gestaltGraph.setNode(node1);
    await polykeyAgent.gestaltGraph.setNode(node2);
    await polykeyAgent.gestaltGraph.setNode(node3);
    await polykeyAgent.gestaltGraph.setIdentity(identity1);
    await polykeyAgent.gestaltGraph.linkNodeAndIdentity(node1, identity1);
  });
  afterEach(async () => {
    // This handles the cheap teardown between tests.
    // Clean up any dangling permissions.
    await polykeyAgent.gestaltGraph.clearDB();
  });

  // Tests
  describe('commandAllowGestalts', () => {
    test('Should allow permissions on node.', async () => {
      const commands = genCommands(['allow', node1.id, 'notify']);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.
      const actions = await polykeyAgent.gestaltGraph.getGestaltActionsByNode(
        nodeId1,
      );
      const actionKeys = Object.keys(actions!);
      expect(actionKeys).toContain('notify');

      const command2 = genCommands(['allow', node1.id, 'scan']);
      const result2 = await testBinUtils.pkStdio(command2, {}, dataDir);
      expect(result2.exitCode).toBe(0); // Succeeds.

      const actions2 = await polykeyAgent.gestaltGraph.getGestaltActionsByNode(
        nodeId1,
      );
      const actionKeys2 = Object.keys(actions2!);
      expect(actionKeys2).toContain('notify');
      expect(actionKeys2).toContain('scan');

      // Should fail for invalid action.
      const command3 = genCommands(['allow', node1.id, 'invalid']);
      const result3 = await testBinUtils.pkStdio(command3, {}, dataDir);
      expect(result3.exitCode).toBe(1); // Should fail.
    });
    test('Should allow permissions on Identity.', async () => {
      const commands = genCommands([
        'allow',
        identityString(identity1.providerId, identity1.identityId),
        'notify',
      ]);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.

      const actions =
        await polykeyAgent.gestaltGraph.getGestaltActionsByIdentity(
          identity1.providerId,
          identity1.identityId,
        );
      const actionKeys = Object.keys(actions!);
      expect(actionKeys).toContain('notify');

      const command2 = genCommands([
        'allow',
        identityString(identity1.providerId, identity1.identityId),
        'scan',
      ]);
      const result2 = await testBinUtils.pkStdio(command2, {}, dataDir);
      expect(result2.exitCode).toBe(0); // Succeedes.

      const actions2 =
        await polykeyAgent.gestaltGraph.getGestaltActionsByIdentity(
          identity1.providerId,
          identity1.identityId,
        );
      const actionKeys2 = Object.keys(actions2!);
      expect(actionKeys2).toContain('notify');
      expect(actionKeys2).toContain('scan');

      // Should fail for invalid action.
      const command3 = genCommands([
        'allow',
        identityString(identity1.providerId, identity1.identityId),
        'invalid',
      ]);
      const result3 = await testBinUtils.pkStdio(command3, {}, dataDir);
      expect(result3.exitCode).toBe(1); // Should fail.
    });
    test('Should fail on invalid inputs.', async () => {
      let result;
      // Invalid node.
      result = await testBinUtils.pkStdio(
        genCommands(['allow', invaldNode.id, 'scan']),
        {},
        dataDir,
      );
      expect(result.exitCode === 0).toBeFalsy(); // Fails..

      // invalid identity
      result = await testBinUtils.pkStdio(
        genCommands([
          'allow',
          identityString(
            invalidIdentity.providerId,
            invalidIdentity.identityId,
          ),
          'scan',
        ]),
        {},
        dataDir,
      );
      expect(result.exitCode === 0).toBeFalsy(); // Fails..

      // invalid permission.
      result = await testBinUtils.pkStdio(
        genCommands(['allow', invaldNode.id, 'invalidPermission']),
        {},
        dataDir,
      );
      expect(result.exitCode === 0).toBeFalsy(); // Fails..
    });
  });
  describe('commandDisallowGestalts', () => {
    test('Should disallow permissions on Node.', async () => {
      // Setting permissions.
      await polykeyAgent.gestaltGraph.setGestaltActionByNode(nodeId1, 'notify');
      await polykeyAgent.gestaltGraph.setGestaltActionByNode(nodeId1, 'scan');

      const commands = genCommands(['disallow', node1.id, 'notify']);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.

      const actions = await polykeyAgent.gestaltGraph.getGestaltActionsByNode(
        nodeId1,
      );
      const actionKeys = Object.keys(actions!);
      expect(actionKeys).toContain('scan');
      expect(actionKeys).not.toContain('notify');
    });
    test('Should disallow permissions on Identity.', async () => {
      // Setting permissions.
      await polykeyAgent.gestaltGraph.setGestaltActionByIdentity(
        identity1.providerId,
        identity1.identityId,
        'notify',
      );
      await polykeyAgent.gestaltGraph.setGestaltActionByIdentity(
        identity1.providerId,
        identity1.identityId,
        'scan',
      );

      const commands = genCommands([
        'disallow',
        identityString(identity1.providerId, identity1.identityId),
        'scan',
      ]);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.

      const actions =
        await polykeyAgent.gestaltGraph.getGestaltActionsByIdentity(
          identity1.providerId,
          identity1.identityId,
        );
      const actionKeys = Object.keys(actions!);
      expect(actionKeys).toContain('notify');
      expect(actionKeys).not.toContain('scan');
    });
    test('Should fail on invalid inputs.', async () => {
      let result;
      // Invalid node.
      result = await testBinUtils.pkStdio(
        genCommands(['disallow', invaldNode.id, 'scan']),
        {},
        dataDir,
      );
      expect(result.exitCode === 0).toBeFalsy(); // Fails..

      // invalid identity
      result = await testBinUtils.pkStdio(
        genCommands([
          'disallow',
          identityString(
            invalidIdentity.providerId,
            invalidIdentity.identityId,
          ),
          'scan',
        ]),
        {},
        dataDir,
      );
      expect(result.exitCode === 0).toBeFalsy(); // Fails..

      // invalid permission.
      result = await testBinUtils.pkStdio(
        genCommands(['disallow', node1.id, 'invalidPermission']),
        {},
        dataDir,
      );
      expect(result.exitCode === 0).toBeFalsy(); // Fails..
    });
  });
  describe('commandPermissionsGestalts', () => {
    test('Should get permissions on Node.', async () => {
      // Setting permissions.
      await polykeyAgent.gestaltGraph.setGestaltActionByNode(nodeId1, 'notify');
      await polykeyAgent.gestaltGraph.setGestaltActionByNode(nodeId1, 'scan');

      const commands = genCommands(['permissions', node1.id]);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.
      // Print result.
      expect(result.stdout).toContain('notify');
      expect(result.stdout).toContain('scan');
    });
    test('Should get permissions on Identity.', async () => {
      // Setting permissions.
      await polykeyAgent.gestaltGraph.setGestaltActionByIdentity(
        identity1.providerId,
        identity1.identityId,
        'notify',
      );
      await polykeyAgent.gestaltGraph.setGestaltActionByIdentity(
        identity1.providerId,
        identity1.identityId,
        'scan',
      );

      const commands = genCommands([
        'permissions',
        identityString(identity1.providerId, identity1.identityId),
      ]);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.
      // Print result.
      expect(result.stdout).toContain('scan');
      expect(result.stdout).toContain('notify');
    });
  });
  describe('commandTrustGestalts', () => {
    test('Should set trust on Node.', async () => {
      const commands = genCommands(['trust', node1.id]);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.

      const actions = await polykeyAgent.gestaltGraph.getGestaltActionsByNode(
        nodeId1,
      );
      const actionKeys = Object.keys(actions!);
      expect(actionKeys).toContain('notify');
    });
    test('Should set trust on Identity.', async () => {
      const commands = genCommands([
        'trust',
        identityString(identity1.providerId, identity1.identityId),
      ]);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.

      const actions =
        await polykeyAgent.gestaltGraph.getGestaltActionsByIdentity(
          identity1.providerId,
          identity1.identityId,
        );
      const actionKeys = Object.keys(actions!);
      expect(actionKeys).toContain('notify');
    });
    test('Should fail on invalid inputs.', async () => {
      // Invalid identity
      const result = await testBinUtils.pkStdio(
        genCommands([
          'trust',
          identityString(
            invalidIdentity.providerId,
            invalidIdentity.identityId,
          ),
        ]),
        {},
        dataDir,
      );
      expect(result.exitCode === 0).toBeFalsy(); // Fails..
    });
  });
  describe('commandUntrustGestalts', () => {
    test('Should unset trust on Node.', async () => {
      // Setting permissions.
      await polykeyAgent.gestaltGraph.setGestaltActionByNode(nodeId1, 'notify');
      await polykeyAgent.gestaltGraph.setGestaltActionByNode(nodeId1, 'scan');

      const commands = genCommands(['untrust', node1.id]);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.

      const actions = await polykeyAgent.gestaltGraph.getGestaltActionsByNode(
        nodeId1,
      );
      const actionKeys = Object.keys(actions!);
      expect(actionKeys).toContain('scan');
      expect(actionKeys).not.toContain('notify');
    });
    test('Should unset trust on Identity.', async () => {
      // Setting permissions.
      await polykeyAgent.gestaltGraph.setGestaltActionByIdentity(
        identity1.providerId,
        identity1.identityId,
        'notify',
      );
      await polykeyAgent.gestaltGraph.setGestaltActionByIdentity(
        identity1.providerId,
        identity1.identityId,
        'scan',
      );

      const commands = genCommands([
        'untrust',
        identityString(identity1.providerId, identity1.identityId),
      ]);
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.

      const actions =
        await polykeyAgent.gestaltGraph.getGestaltActionsByIdentity(
          identity1.providerId,
          identity1.identityId,
        );
      const actionKeys = Object.keys(actions!);
      expect(actionKeys).toContain('scan');
      expect(actionKeys).not.toContain('notify');
    });
    test('Should fail on invalid inputs.', async () => {
      let result;
      // Invalid node.
      result = await testBinUtils.pkStdio(
        genCommands(['untrust', invaldNode.id]),
        {},
        dataDir,
      );
      expect(result.exitCode === 0).toBeFalsy(); // Fails..

      // invalid identity
      result = await testBinUtils.pkStdio(
        genCommands([
          'untrust',
          identityString(
            invalidIdentity.providerId,
            invalidIdentity.identityId,
          ),
        ]),
        {},
        dataDir,
      );
      expect(result.exitCode === 0).toBeFalsy(); // Fails..
    });
  });
  describe('commandClaimIdentity', () => {
    test('Should claim an identity.', async () => {
      // Need an authenticated identity.
      await polykeyAgent.identitiesManager.putToken(
        testToken.providerId,
        testToken.identityId,
        testToken.tokenData,
      );
      const commands = [
        'identities',
        'claim',
        '-np',
        nodePath,
        testToken.providerId,
        testToken.identityId,
      ];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.
      // Unauthenticate identity
      await polykeyAgent.identitiesManager.delToken(
        testToken.providerId,
        testToken.identityId,
      );
      // Unclaim identity
      testProvider.links = {};
      testProvider.linkIdCounter = 0;
    });
    test('Should fail for unauthenticated identities.', async () => {
      const commands = [
        'identities',
        'claim',
        '-np',
        nodePath,
        testToken.providerId,
        testToken.identityId,
      ];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode === 0).toBeFalsy(); // Fails..
    });
  });
  describe('commandAuthenticateProvider', () => {
    test('Should authenticate an identity with a provider.', async () => {
      // Attempt to authenticate.
      const commands = [
        'identities',
        'authenticate',
        '-np',
        nodePath,
        testToken.providerId,
        testToken.identityId,
      ];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.
      expect(result.stdout).toContain('randomtestcode');
      // Unauthenticate identity
      await polykeyAgent.identitiesManager.delToken(
        testToken.providerId,
        testToken.identityId,
      );
    });
  });
  describe('commandAuthenticatedGet', () => {
    test('Should get authenticated identities', async () => {
      // Need an authenticated identity.
      await polykeyAgent.identitiesManager.putToken(
        testToken.providerId,
        testToken.identityId,
        testToken.tokenData,
      );
      const commands = ['identities', 'authenticated', '-np', nodePath];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.
      expect(result.stdout).toContain(testToken.providerId);
      expect(result.stdout).toContain(testToken.identityId);
      // Unauthenticate identity
      await polykeyAgent.identitiesManager.delToken(
        testToken.providerId,
        testToken.identityId,
      );
    });
    test('Should get authenticated identities from specific provider', async () => {
      // Need an authenticated identity.
      await polykeyAgent.identitiesManager.putToken(
        testToken.providerId,
        testToken.identityId,
        testToken.tokenData,
      );
      const commands = [
        'identities',
        'authenticated',
        '--provider-id',
        testToken.providerId,
        '-np',
        nodePath,
      ];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.
      expect(result.stdout).toContain(testToken.providerId);
      expect(result.stdout).toContain(testToken.identityId);
      // Unauthenticate identity
      await polykeyAgent.identitiesManager.delToken(
        testToken.providerId,
        testToken.identityId,
      );
    });
  });
  describe('commandGetGestalts', () => {
    const nodeIdEncoded = node1.id;
    test('Should list gestalt by Node', async () => {
      const commands = ['identities', 'get', '-np', nodePath, nodeIdEncoded];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(nodeIdEncoded);
      expect(result.stdout).toContain(identity1.providerId);
      expect(result.stdout).toContain(identity1.identityId);
    });
    test('Should list gestalt by Identity', async () => {
      const nodeIdEncoded = node1.id;
      const commands = [
        'identities',
        'get',
        '-np',
        nodePath,
        identityString(identity1.providerId, identity1.identityId),
      ];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(nodeIdEncoded);
      expect(result.stdout).toContain(identity1.providerId);
      expect(result.stdout).toContain(identity1.identityId);
    });
  });
  describe('commandListGestalts', () => {
    test('Should list gestalts with permissions.', async () => {
      await polykeyAgent.gestaltGraph.setGestaltActionByNode(nodeId1, 'notify');
      await polykeyAgent.gestaltGraph.setGestaltActionByNode(nodeId1, 'scan');
      await polykeyAgent.gestaltGraph.setGestaltActionByNode(nodeId2, 'scan');

      const commands = ['identities', 'list', '-np', nodePath];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.
      expect(result.stdout).toContain('notify');
      expect(result.stdout).toContain('scan');
      expect(result.stdout).toContain(node1.id);
      expect(result.stdout).toContain(node2.id);
      expect(result.stdout).toContain(node3.id);
      expect(result.stdout).toContain(identity1.providerId);
      expect(result.stdout).toContain(identity1.identityId);

      const commands2 = [
        'identities',
        'list',
        '-np',
        nodePath,
        '--format',
        'json',
      ];
      const result2 = await testBinUtils.pkStdio(commands2, {}, dataDir);
      expect(result2.exitCode).toBe(0); // Succeeds.
      expect(result2.stdout).toContain('notify');
      expect(result2.stdout).toContain('scan');
      expect(result2.stdout).toContain(node1.id);
      expect(result2.stdout).toContain(node2.id);
      expect(result2.stdout).toContain(node3.id);
      expect(result2.stdout).toContain(identity1.providerId);
      expect(result2.stdout).toContain(identity1.identityId);
    });
  });
  describe('commandSearchIdentities', () => {
    test('Should find a connected identity.', async () => {
      const provider = new TestProvider('provider' as ProviderId);
      const identity = {
        providerId: provider.id,
        identityId: 'connected_user' as IdentityId,
        name: 'User',
        email: 'user@test.com',
        url: 'test.com/user',
      };
      provider.users['connected_user'] = identity;
      provider.users[testToken.identityId].connected = ['connected_user'];
      polykeyAgent.identitiesManager.registerProvider(provider);
      // Need an authenticated identity
      await polykeyAgent.identitiesManager.putToken(
        provider.id,
        testToken.identityId,
        testToken.tokenData,
      );
      const commands = [
        'identities',
        'search',
        '-np',
        nodePath,
        '--provider-id',
        'provider',
        '--format',
        'json',
      ];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0); // Succeeds.
      expect(JSON.parse(result.stdout)).toEqual(identity);
      await polykeyAgent.identitiesManager.delToken(
        provider.id,
        testToken.identityId,
      );
      polykeyAgent.identitiesManager.unregisterProvider(provider.id);
    });
  });
  describe('commandDiscoverGestalts', () => {
    let rootDataDir;
    // Test variables
    const testProvider = new TestProvider('discovery-provider' as ProviderId);
    const identityId = 'connected-identity' as IdentityId;
    let nodeB: PolykeyAgent;
    let nodeC: PolykeyAgent;
    beforeAll(async () => {
      rootDataDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'polykey-test-'),
      );
      // Setup the remote gestalt state here
      // Setting up remote nodes.
      nodeB = await PolykeyAgent.createPolykeyAgent({
        password: 'password',
        nodePath: path.join(rootDataDir, 'nodeB'),
        keysConfig: {
          rootKeyPairBits: 2048,
        },
        logger,
      });
      nodeC = await PolykeyAgent.createPolykeyAgent({
        password: 'password',
        nodePath: path.join(rootDataDir, 'nodeC'),
        keysConfig: {
          rootKeyPairBits: 2048,
        },
        logger,
      });

      // Forming links
      // B->C
      // Adding connection details.
      await testNodesUtils.nodesConnect(polykeyAgent, nodeB);
      await testNodesUtils.nodesConnect(nodeB, nodeC);
      await testNodesUtils.nodesConnect(polykeyAgent, nodeC);
      // Adding sigchain details.
      await nodeB.nodeManager.claimNode(nodeC.keyManager.getNodeId());

      // Setting up identtiy.
      testProvider.users[identityId] = {};
      polykeyAgent.identitiesManager.registerProvider(testProvider);
      nodeB.identitiesManager.registerProvider(testProvider);
      await nodeB.identitiesManager.putToken(testProvider.id, identityId, {
        accessToken: 'def456',
      });

      const claimIdentToB: ClaimLinkIdentity = {
        type: 'identity',
        node: nodesUtils.encodeNodeId(nodeB.keyManager.getNodeId()),
        provider: testProvider.id,
        identity: identityId,
      };
      const [, claimEncoded] = await nodeB.sigchain.addClaim(claimIdentToB);
      const claim = claimsUtils.decodeClaim(claimEncoded);
      await testProvider.publishClaim(identityId, claim);
    }, global.defaultTimeout * 3);
    afterAll(async () => {
      await nodeC.stop();
      await nodeB.stop();
      // Unclaim identity
      testProvider.links = {};
      testProvider.linkIdCounter = 0;
      await fs.promises.rm(rootDataDir, {
        force: true,
        recursive: true,
      });
    });
    beforeEach(async () => {
      await polykeyAgent.gestaltGraph.clearDB();
    });
    afterEach(async () => {
      // Clean the local nodes gestalt graph here.
      await polykeyAgent.gestaltGraph.clearDB();
      await nodeB.gestaltGraph.clearDB();
      await nodeC.gestaltGraph.clearDB();
    });
    test('Should start discovery by Node', async () => {
      // Authenticate identity
      await polykeyAgent.identitiesManager.putToken(
        testProvider.id,
        testToken.identityId,
        testToken.tokenData,
      );

      const commands = [
        'identities',
        'discover',
        '-np',
        nodePath,
        nodesUtils.encodeNodeId(nodeB.keyManager.getNodeId()),
        '-vvvv',
      ];
      const result = await testBinUtils.pkStdio(commands);
      expect(result.exitCode).toBe(0);
      // Should eventually discover entire gestalt
      const gestalt = await poll<Gestalt>(
        async () => {
          const gestalts = await poll<Array<Gestalt>>(
            async () => {
              return await polykeyAgent.gestaltGraph.getGestalts();
            },
            (_, result) => {
              if (result.length === 1) return true;
              return false;
            },
            100,
          );
          return gestalts[0];
        },
        (_, result) => {
          if (result === undefined) return false;
          if (Object.keys(result.matrix).length === 3) return true;
          return false;
        },
        100,
      );
      const gestaltString = JSON.stringify(gestalt);
      expect(gestaltString).toContain(
        nodesUtils.encodeNodeId(nodeB.keyManager.getNodeId()),
      );
      expect(gestaltString).toContain(
        nodesUtils.encodeNodeId(nodeC.keyManager.getNodeId()),
      );
      expect(gestaltString).toContain(identityId);
      // Unauthenticate identity
      await polykeyAgent.identitiesManager.delToken(
        testProvider.id,
        testToken.identityId,
      );
    });
    test('Should start discovery by Identity', async () => {
      // Authenticate identity
      await polykeyAgent.identitiesManager.putToken(
        testProvider.id,
        testToken.identityId,
        testToken.tokenData,
      );
      const commands = [
        'identities',
        'discover',
        '-np',
        nodePath,
        identityString(testProvider.id, identityId),
      ];
      const result = await testBinUtils.pkStdio(commands, {}, dataDir);
      expect(result.exitCode).toBe(0);
      // Should eventually discover entire gestalt
      const gestalt = await poll<Gestalt>(
        async () => {
          const gestalts = await poll<Array<Gestalt>>(
            async () => {
              return await polykeyAgent.gestaltGraph.getGestalts();
            },
            (_, result) => {
              if (result.length === 1) return true;
              return false;
            },
            100,
          );
          return gestalts[0];
        },
        (_, result) => {
          if (result === undefined) return false;
          if (Object.keys(result.matrix).length === 3) return true;
          return false;
        },
        100,
      );
      const gestaltString = JSON.stringify(gestalt);
      expect(gestaltString).toContain(
        nodesUtils.encodeNodeId(nodeB.keyManager.getNodeId()),
      );
      expect(gestaltString).toContain(
        nodesUtils.encodeNodeId(nodeC.keyManager.getNodeId()),
      );
      expect(gestaltString).toContain(identityId);
      // Unauthenticate identity
      await polykeyAgent.identitiesManager.delToken(
        testProvider.id,
        testToken.identityId,
      );
    });
  });
});
