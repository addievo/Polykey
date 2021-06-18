import type { NodeId } from '@/nodes/types';
import type { VaultId } from '@/vaults/types';

import os from 'os';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { ACL, errors as aclErrors } from '@/acl';
import { KeyManager } from '@/keys';

describe('ACL', () => {
  const logger = new Logger('ACL Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let keyManager: KeyManager;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    const keysPath = `${dataDir}/keys`;
    keyManager = new KeyManager({ keysPath, logger });
    await keyManager.start({ password: 'password' });
  });
  afterEach(async () => {
    await keyManager.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('construction has no side effects', async () => {
    const aclPath = `${dataDir}/acl`;
    new ACL({ aclPath, keyManager, logger });
    await expect(fs.promises.stat(aclPath)).rejects.toThrow(/ENOENT/);
  });
  test('async start constructs the acl leveldb', async () => {
    const aclPath = `${dataDir}/acl`;
    const acl = new ACL({ aclPath, keyManager, logger });
    await acl.start();
    const aclPathContents = await fs.promises.readdir(aclPath);
    expect(aclPathContents).toContain('acl_db');
    await acl.stop();
  });
  test('start and stop preserves the acl key', async () => {
    const aclPath = `${dataDir}/acl`;
    const acl = new ACL({ aclPath, keyManager, logger });
    await acl.start();
    const aclDbKey = await keyManager.getKey('ACL');
    expect(aclDbKey).not.toBeUndefined();
    await acl.stop();
    await acl.start();
    const aclDbKey_ = await keyManager.getKey('ACL');
    expect(aclDbKey_).not.toBeUndefined();
    await acl.stop();
    expect(aclDbKey).toEqual(aclDbKey_);
  });
  test('trust and untrust gestalts', async () => {
    const aclPath = `${dataDir}/acl`;
    const acl = new ACL({ aclPath, keyManager, logger });
    await acl.start();
    // gestalt 1
    await acl.setNodesPerm(['g1-first', 'g1-second'] as Array<NodeId>, {
      trust: true,
      vaults: {
        v1: ['pull'],
      },
    });
    // gestalt2
    await acl.setNodesPerm(['g2-first', 'g2-second'] as Array<NodeId>, {
      trust: true,
      vaults: {
        v2: ['clone'],
      },
    });
    // check g1 perm
    const g1Perm1 = await acl.getNodePerm('g1-first' as NodeId);
    const g1Perm2 = await acl.getNodePerm('g1-second' as NodeId);
    expect(g1Perm1).toBeDefined();
    expect(g1Perm1).toEqual(g1Perm2);
    expect(g1Perm1!.trust).toBe(true);
    expect(g1Perm1!.vaults['v1']).toEqual(['pull']);
    // check g2 perm
    const g2Perm = await acl.getNodePerm('g2-first' as NodeId);
    const g2Perm_ = await acl.getNodePerm('g2-second' as NodeId);
    expect(g2Perm).toBeDefined();
    expect(g2Perm).toEqual(g2Perm_);
    expect(g2Perm!.trust).toBe(true);
    expect(g2Perm!.vaults['v2']).toEqual(['clone']);
    // make g1 permission untrusted
    const g1PermNew = {
      ...g1Perm1!,
      trust: false,
    };
    await acl.setNodePerm('g1-first' as NodeId, g1PermNew);
    // check that g1-second also gets the same permission
    const g1Perm3 = await acl.getNodePerm('g1-second' as NodeId);
    expect(g1Perm3).toEqual(g1PermNew);
    const nodePerms = await acl.getNodePerms();
    expect(nodePerms).toEqual([
      {
        'g1-first': g1PermNew,
        'g1-second': g1PermNew,
      },
      {
        'g2-first': g2Perm,
        'g2-second': g2Perm,
      },
    ]);
    // check that the permission object is identical
    // this should be a performance optimisation
    expect(nodePerms[0]['g1-first']).toBe(nodePerms[0]['g1-second']);
    await acl.stop();
  });
  test('setting and unsetting vault actions', async () => {
    const aclPath = `${dataDir}/acl`;
    const acl = new ACL({ aclPath, keyManager, logger });
    await acl.start();
    // the node id must exist as a gestalt first
    await expect(
      acl.setVaultAction('v1' as VaultId, 'g1-1' as NodeId, 'pull'),
    ).rejects.toThrow(aclErrors.ErrorACLNodeIdMissing);
    await acl.setNodesPerm(['g1-1'] as Array<NodeId>, {
      trust: true,
      vaults: {},
    });
    let vaultPerm;
    await acl.setVaultAction('v1' as VaultId, 'g1-1' as NodeId, 'pull');
    // idempotent
    await acl.setVaultAction('v1' as VaultId, 'g1-1' as NodeId, 'pull');
    vaultPerm = await acl.getVaultPerm('v1' as VaultId);
    expect(vaultPerm['g1-1']).toEqual({
      trust: true,
      vaults: {
        v1: ['pull'],
      },
    });
    await acl.unsetVaultAction('v1' as VaultId, 'g1-1' as NodeId, 'pull');
    // idempotent
    await acl.unsetVaultAction('v1' as VaultId, 'g1-1' as NodeId, 'pull');
    vaultPerm = await acl.getVaultPerm('v1' as VaultId);
    expect(vaultPerm['g1-1']).toEqual({
      trust: true,
      vaults: {
        v1: [],
      },
    });
    await acl.setVaultAction('v1' as VaultId, 'g1-1' as NodeId, 'pull');
    await acl.setVaultAction('v1' as VaultId, 'g1-1' as NodeId, 'clone');
    vaultPerm = await acl.getVaultPerm('v1' as VaultId);
    expect(vaultPerm['g1-1'].vaults['v1']).toContainEqual('pull');
    expect(vaultPerm['g1-1'].vaults['v1']).toContainEqual('clone');
    const vaultPerms = await acl.getVaultPerms();
    expect(vaultPerms).toEqual({
      v1: {
        'g1-1': {
          trust: true,
          vaults: {
            v1: ['pull', 'clone'],
          },
        },
      },
    });
    await acl.stop();
  });
  test('joining existing gestalt permissions', async () => {
    const aclPath = `${dataDir}/acl`;
    const acl = new ACL({ aclPath, keyManager, logger });
    await acl.start();
    const g1Perm = {
      trust: true,
      vaults: {
        v1: ['pull'],
      },
    };
    await acl.setNodesPerm(['g1-first', 'g1-second'] as Array<NodeId>, g1Perm);
    await acl.joinNodePerm(
      'g1-second' as NodeId,
      ['g1-third', 'g1-fourth'] as Array<NodeId>,
    );
    const nodePerm = await acl.getNodePerm('g1-fourth' as NodeId);
    expect(nodePerm).toEqual(g1Perm);
    const nodePerms = await acl.getNodePerms();
    expect(nodePerms).toEqual([
      {
        'g1-first': g1Perm,
        'g1-second': g1Perm,
        'g1-third': g1Perm,
        'g1-fourth': g1Perm,
      },
    ]);
    await acl.stop();
  });
  test('joining existing vault permisisons', async () => {
    const aclPath = `${dataDir}/acl`;
    const acl = new ACL({ aclPath, keyManager, logger });
    await acl.start();
    await acl.setNodesPerm(['g1-1'] as Array<NodeId>, {
      trust: true,
      vaults: {
        v1: ['clone'],
      },
    });
    await acl.setVaultAction('v1' as VaultId, 'g1-1' as NodeId, 'pull');
    await acl.joinVaultPerms('v1' as VaultId, ['v2', 'v3'] as Array<VaultId>);
    const vaultPerm1 = await acl.getVaultPerm('v1' as VaultId);
    const vaultPerm2 = await acl.getVaultPerm('v2' as VaultId);
    const vaultPerm3 = await acl.getVaultPerm('v3' as VaultId);
    expect(vaultPerm1).toEqual(vaultPerm2);
    expect(vaultPerm2).toEqual(vaultPerm3);
    expect(vaultPerm1['g1-1'].vaults['v1']).toContainEqual('clone');
    expect(vaultPerm1['g1-1'].vaults['v1']).toContainEqual('pull');
    const vaultPerms = await acl.getVaultPerms();
    expect(vaultPerms).toMatchObject({
      v1: {
        'g1-1': {
          trust: true,
          vaults: {
            v1: ['clone', 'pull'],
            v2: ['clone', 'pull'],
            v3: ['clone', 'pull'],
          },
        },
      },
      v2: {
        'g1-1': {
          trust: true,
          vaults: {
            v1: ['clone', 'pull'],
            v2: ['clone', 'pull'],
            v3: ['clone', 'pull'],
          },
        },
      },
      v3: {
        'g1-1': {
          trust: true,
          vaults: {
            v1: ['clone', 'pull'],
            v2: ['clone', 'pull'],
            v3: ['clone', 'pull'],
          },
        },
      },
    });
    // object identity for performance
    expect(vaultPerms['v1']['g1-1']).toEqual(vaultPerms['v2']['g1-1']);
    expect(vaultPerms['v2']['g1-1']).toEqual(vaultPerms['v3']['g1-1']);
    await acl.stop();
  });
  test('node removal', async () => {
    const aclPath = `${dataDir}/acl`;
    const acl = new ACL({ aclPath, keyManager, logger });
    await acl.start();
    const g1Perm = {
      trust: true,
      vaults: {
        v1: ['pull'],
      },
    };
    await acl.setNodesPerm(['g1-first', 'g1-second'] as Array<NodeId>, g1Perm);
    await acl.unsetNodePerm('g1-first' as NodeId);
    expect(await acl.getNodePerm('g1-first' as NodeId)).toBeUndefined();
    const g1Perm_ = await acl.getNodePerm('g1-second' as NodeId);
    expect(g1Perm_).toEqual(g1Perm);
    await acl.unsetNodePerm('g1-second' as NodeId);
    expect(await acl.getNodePerm('g1-second' as NodeId)).toBeUndefined();
    expect(await acl.getNodePerms()).toHaveLength(0);
    await acl.stop();
  });
  test('vault removal', async () => {
    const aclPath = `${dataDir}/acl`;
    const acl = new ACL({ aclPath, keyManager, logger });
    await acl.start();
    const g1Perm = {
      trust: true,
      vaults: {},
    };
    await acl.setNodesPerm(['g1-first', 'g1-second'] as Array<NodeId>, g1Perm);
    // v1 and v2 are pointing to the same gestalt
    // but using different node ids as the representative
    await acl.setVaultAction('v1' as VaultId, 'g1-first' as NodeId, 'clone');
    await acl.setVaultAction('v2' as VaultId, 'g1-second' as NodeId, 'pull');
    let vaultPerm;
    vaultPerm = await acl.getVaultPerm('v2' as VaultId);
    expect(vaultPerm).toEqual({
      'g1-second': {
        trust: true,
        vaults: {
          v1: ['clone'],
          v2: ['pull'],
        },
      },
    });
    // v1 gets removed
    await acl.unsetVaultPerms('v1' as VaultId);
    vaultPerm = await acl.getVaultPerm('v2' as VaultId);
    expect(vaultPerm).toEqual({
      'g1-second': {
        trust: true,
        vaults: {
          v2: ['pull'],
        },
      },
    });
    await acl.stop();
  });
  test('transactional operations', async () => {
    const aclPath = `${dataDir}/acl`;
    const acl = new ACL({ aclPath, keyManager, logger });
    await acl.start();
    const p1 = acl.getNodePerms();
    const p2 = acl.transaction(async (acl) => {
      await acl.setNodesPerm(['g1-first', 'g1-second'] as Array<NodeId>, {
        trust: true,
        vaults: {},
      });
      await acl.setNodesPerm(['g2-first', 'g2-second'] as Array<NodeId>, {
        trust: true,
        vaults: {},
      });
      await acl.setVaultAction('v1' as VaultId, 'g1-first' as NodeId, 'pull');
      await acl.setVaultAction('v1' as VaultId, 'g2-first' as NodeId, 'clone');
      await acl.joinNodePerm(
        'g1-second' as NodeId,
        ['g1-third', 'g1-fourth'] as Array<NodeId>,
      );
      // v3 and v4 joins v1
      // this means v3 and v4 now has g1 and g2 permissions
      await acl.joinVaultPerms('v1' as VaultId, ['v3', 'v4'] as Array<VaultId>);
      // removing v3
      await acl.unsetVaultPerms('v3' as VaultId);
      // removing g1-second
      await acl.unsetNodePerm('g1-second' as NodeId);
      // unsetting pull just for v1 for g1
      await acl.unsetVaultAction('v1' as VaultId, 'g1-first' as NodeId, 'pull');
      return await acl.getNodePerms();
    });
    const p3 = acl.getNodePerms();
    const results = await Promise.all([p1, p2, p3]);
    expect(results[0]).toEqual([]);
    expect(results[1]).toEqual([
      {
        'g1-first': {
          trust: true,
          vaults: {
            v1: [],
            v4: ['pull'],
          },
        },
        'g1-fourth': {
          trust: true,
          vaults: {
            v1: [],
            v4: ['pull'],
          },
        },
        'g1-third': {
          trust: true,
          vaults: {
            v1: [],
            v4: ['pull'],
          },
        },
      },
      {
        'g2-first': {
          trust: true,
          vaults: {
            v1: ['clone'],
            v4: ['clone'],
          },
        },
        'g2-second': {
          trust: true,
          vaults: {
            v1: ['clone'],
            v4: ['clone'],
          },
        },
      },
    ]);
    expect(results[2]).toEqual(results[1]);
    await acl.stop();
  });
});
