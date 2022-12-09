import type { RecoveryCode } from '@/keys/types';
import type { StatusLive } from '@/status/types';
import type { NodeId } from '@/ids/types';
import type { Host, Port } from '@/network/types';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import process from 'process';
import * as jestMockProps from 'jest-mock-props';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import Status from '@/status/Status';
import * as statusErrors from '@/status/errors';
import config from '@/config';
import * as keysUtils from '@/keys/utils';
import * as testUtils from '../../utils';

describe('start', () => {
  const logger = new Logger('start test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
  });
  afterEach(async () => {
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  testUtils.testIf(
    testUtils.isTestPlatformEmpty || testUtils.isTestPlatformDocker,
  )(
    'start in foreground',
    async () => {
      const password = 'abc123';
      const polykeyPath = path.join(dataDir, 'polykey');
      await fs.promises.mkdir(polykeyPath);
      const agentProcess = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--node-path',
          path.join(dataDir, 'polykey'),
          '--client-host',
          '127.0.0.1',
          '--proxy-host',
          '127.0.0.1',
          '--workers',
          '0',
          '--verbose',
          '--format',
          'json',
        ],
        {
          env: {
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger,
      );
      const rlOut = readline.createInterface(agentProcess.stdout!);
      const stdout = await new Promise<string>((resolve, reject) => {
        rlOut.once('line', resolve);
        rlOut.once('close', reject);
      });
      const statusLiveData = JSON.parse(stdout);
      expect(statusLiveData).toMatchObject({
        pid: expect.any(Number),
        nodeId: expect.any(String),
        clientHost: expect.any(String),
        clientPort: expect.any(Number),
        agentHost: expect.any(String),
        agentPort: expect.any(Number),
        proxyHost: expect.any(String),
        proxyPort: expect.any(Number),
        forwardHost: expect.any(String),
        forwardPort: expect.any(Number),
        recoveryCode: expect.any(String),
      });
      expect(
        statusLiveData.recoveryCode.split(' ').length === 12 ||
          statusLiveData.recoveryCode.split(' ').length === 24,
      ).toBe(true);
      agentProcess.kill('SIGTERM');
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        statusLockPath: path.join(
          dataDir,
          'polykey',
          config.defaults.statusLockBase,
        ),
        fs,
        logger,
      });
      const statusInfo = (await status.waitFor('DEAD'))!;
      expect(statusInfo.status).toBe('DEAD');
    },
    globalThis.defaultTimeout * 2,
  );
  testUtils.testIf(testUtils.isTestPlatformEmpty)(
    'start in background',
    async () => {
      const password = 'abc123';
      const passwordPath = path.join(dataDir, 'password');
      await fs.promises.writeFile(passwordPath, password);
      const agentProcess = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--password-file',
          passwordPath,
          '--client-host',
          '127.0.0.1',
          '--proxy-host',
          '127.0.0.1',
          '--background',
          '--background-out-file',
          path.join(dataDir, 'out.log'),
          '--background-err-file',
          path.join(dataDir, 'err.log'),
          '--workers',
          '0',
          '--verbose',
          '--format',
          'json',
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger,
      );
      const agentProcessExit = new Promise<void>((resolve, reject) => {
        agentProcess.on('exit', (code, signal) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `Agent process exited with code: ${code} and signal: ${signal}`,
              ),
            );
          }
        });
      });
      const rlOut = readline.createInterface(agentProcess.stdout!);
      const stdout = await new Promise<string>((resolve, reject) => {
        rlOut.once('line', resolve);
        rlOut.once('close', reject);
      });
      const statusLiveData = JSON.parse(stdout);
      expect(statusLiveData).toMatchObject({
        pid: expect.any(Number),
        nodeId: expect.any(String),
        clientHost: expect.any(String),
        clientPort: expect.any(Number),
        agentHost: expect.any(String),
        agentPort: expect.any(Number),
        proxyHost: expect.any(String),
        proxyPort: expect.any(Number),
        forwardHost: expect.any(String),
        forwardPort: expect.any(Number),
        recoveryCode: expect.any(String),
      });
      // The foreground process PID should nto be the background process PID
      expect(statusLiveData.pid).not.toBe(agentProcess.pid);
      expect(
        statusLiveData.recoveryCode.split(' ').length === 12 ||
          statusLiveData.recoveryCode.split(' ').length === 24,
      ).toBe(true);
      await agentProcessExit;
      // Make sure that the daemon does output the recovery code
      // The recovery code was already written out on agentProcess
      const polykeyAgentOut = await fs.promises.readFile(
        path.join(dataDir, 'out.log'),
        'utf-8',
      );
      expect(polykeyAgentOut).toHaveLength(0);
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        statusLockPath: path.join(
          dataDir,
          'polykey',
          config.defaults.statusLockBase,
        ),
        fs,
        logger,
      });
      const statusInfo1 = (await status.readStatus())!;
      expect(statusInfo1).toBeDefined();
      expect(statusInfo1.status).toBe('LIVE');
      process.kill(statusInfo1.data.pid, 'SIGINT');
      // Check for graceful exit
      const statusInfo2 = await status.waitFor('DEAD');
      expect(statusInfo2.status).toBe('DEAD');
    },
    globalThis.defaultTimeout * 2,
  );
  testUtils.testIf(
    testUtils.isTestPlatformEmpty || testUtils.isTestPlatformDocker,
  )(
    'concurrent starts results in 1 success',
    async () => {
      const password = 'abc123';
      // One of these processes is blocked
      const [agentProcess1, agentProcess2] = await Promise.all([
        testUtils.pkSpawn(
          [
            'agent',
            'start',
            '--client-host',
            '127.0.0.1',
            '--proxy-host',
            '127.0.0.1',
            '--workers',
            '0',
            '--verbose',
            '--format',
            'json',
          ],
          {
            env: {
              PK_NODE_PATH: path.join(dataDir, 'polykey'),
              PK_PASSWORD: password,
              PK_PASSWORD_OPS_LIMIT: 'min',
              PK_PASSWORD_MEM_LIMIT: 'min',
            },
            cwd: dataDir,
            command: globalThis.testCmd,
          },
          logger.getChild('agentProcess1'),
        ),
        testUtils.pkSpawn(
          [
            'agent',
            'start',
            '--client-host',
            '127.0.0.1',
            '--proxy-host',
            '127.0.0.1',
            '--workers',
            '0',
            '--verbose',
            '--format',
            'json',
          ],
          {
            env: {
              PK_NODE_PATH: path.join(dataDir, 'polykey'),
              PK_PASSWORD: password,
              PK_PASSWORD_OPS_LIMIT: 'min',
              PK_PASSWORD_MEM_LIMIT: 'min',
            },
            cwd: dataDir,
            command: globalThis.testCmd,
          },
          logger.getChild('agentProcess2'),
        ),
      ]);
      // These will be the last line of STDERR
      // The readline library will automatically trim off newlines
      let stdErrLine1;
      let stdErrLine2;
      const rlErr1 = readline.createInterface(agentProcess1.stderr!);
      const rlErr2 = readline.createInterface(agentProcess2.stderr!);
      rlErr1.on('line', (l) => {
        stdErrLine1 = l;
      });
      rlErr2.on('line', (l) => {
        stdErrLine2 = l;
      });
      // eslint-disable-next-line prefer-const
      let [index, exitCode] = await new Promise<
        [number, number | null, NodeJS.Signals | null]
      >((resolve) => {
        agentProcess1.once('exit', (code, signal) => {
          resolve([0, code, signal]);
        });
        agentProcess2.once('exit', (code, signal) => {
          resolve([1, code, signal]);
        });
      });
      const errorStatusLocked = new statusErrors.ErrorStatusLocked();
      // It's either the first or second process
      if (index === 0) {
        testUtils.expectProcessError(exitCode!, stdErrLine1, [
          errorStatusLocked,
        ]);
        agentProcess2.kill('SIGQUIT');
      } else if (index === 1) {
        testUtils.expectProcessError(exitCode!, stdErrLine2, [
          errorStatusLocked,
        ]);
        agentProcess1.kill('SIGQUIT');
      }
    },
    globalThis.defaultTimeout * 2,
  );
  testUtils.testIf(
    testUtils.isTestPlatformEmpty || testUtils.isTestPlatformDocker,
  )(
    'concurrent with bootstrap results in 1 success',
    async () => {
      const password = 'abc123';
      // One of these processes is blocked
      const [agentProcess, bootstrapProcess] = await Promise.all([
        testUtils.pkSpawn(
          [
            'agent',
            'start',
            '--client-host',
            '127.0.0.1',
            '--proxy-host',
            '127.0.0.1',
            '--workers',
            '0',
            '--verbose',
            '--format',
            'json',
          ],
          {
            env: {
              PK_NODE_PATH: path.join(dataDir, 'polykey'),
              PK_PASSWORD: password,
              PK_PASSWORD_OPS_LIMIT: 'min',
              PK_PASSWORD_MEM_LIMIT: 'min',
            },
            cwd: dataDir,
            command: globalThis.testCmd,
          },
          logger.getChild('agentProcess'),
        ),
        testUtils.pkSpawn(
          ['bootstrap', '--fresh', '--verbose', '--format', 'json'],
          {
            env: {
              PK_NODE_PATH: path.join(dataDir, 'polykey'),
              PK_PASSWORD: password,
              PK_PASSWORD_OPS_LIMIT: 'min',
              PK_PASSWORD_MEM_LIMIT: 'min',
            },
            cwd: dataDir,
            command: globalThis.testCmd,
          },
          logger.getChild('bootstrapProcess'),
        ),
      ]);
      // These will be the last line of STDERR
      // The readline library will automatically trim off newlines
      let stdErrLine1;
      let stdErrLine2;
      const rlErr1 = readline.createInterface(agentProcess.stderr!);
      const rlErr2 = readline.createInterface(bootstrapProcess.stderr!);
      rlErr1.on('line', (l) => {
        stdErrLine1 = l;
      });
      rlErr2.on('line', (l) => {
        stdErrLine2 = l;
      });
      // eslint-disable-next-line prefer-const
      let [index, exitCode] = await new Promise<
        [number, number | null, NodeJS.Signals | null]
      >((resolve) => {
        agentProcess.once('exit', (code, signal) => {
          resolve([0, code, signal]);
        });
        bootstrapProcess.once('exit', (code, signal) => {
          resolve([1, code, signal]);
        });
      });
      const errorStatusLocked = new statusErrors.ErrorStatusLocked();
      // It's either the first or second process
      if (index === 0) {
        testUtils.expectProcessError(exitCode!, stdErrLine1, [
          errorStatusLocked,
        ]);
        bootstrapProcess.kill('SIGTERM');
      } else if (index === 1) {
        testUtils.expectProcessError(exitCode!, stdErrLine2, [
          errorStatusLocked,
        ]);
        agentProcess.kill('SIGTERM');
      }
    },
    globalThis.defaultTimeout * 2,
  );
  testUtils.testIf(
    testUtils.isTestPlatformEmpty || testUtils.isTestPlatformDocker,
  )(
    'start with existing state',
    async () => {
      const password = 'abc123';
      const agentProcess1 = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--client-host',
          '127.0.0.1',
          '--proxy-host',
          '127.0.0.1',
          '--workers',
          '0',
          '--verbose',
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger,
      );
      const rlOut = readline.createInterface(agentProcess1.stdout!);
      await new Promise<RecoveryCode>((resolve, reject) => {
        rlOut.once('line', resolve);
        rlOut.once('close', reject);
      });
      agentProcess1.kill('SIGHUP');
      const agentProcess2 = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--client-host',
          '127.0.0.1',
          '--proxy-host',
          '127.0.0.1',
          '--workers',
          '0',
          '--verbose',
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger,
      );
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        statusLockPath: path.join(
          dataDir,
          'polykey',
          config.defaults.statusLockBase,
        ),
        fs,
        logger,
      });
      await status.waitFor('LIVE');
      agentProcess2.kill('SIGHUP');
      // Check for graceful exit
      const statusInfo = (await status.waitFor('DEAD'))!;
      expect(statusInfo.status).toBe('DEAD');
    },
    globalThis.defaultTimeout * 2,
  );
  testUtils.testIf(
    testUtils.isTestPlatformEmpty || testUtils.isTestPlatformDocker,
  )(
    'start when interrupted, requires fresh on next start',
    async () => {
      const password = 'password';
      const agentProcess1 = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--client-host',
          '127.0.0.1',
          '--proxy-host',
          '127.0.0.1',
          '--workers',
          '0',
          '--verbose',
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger.getChild('agentProcess1'),
      );
      const rlErr = readline.createInterface(agentProcess1.stderr!);
      // Interrupt when generating the root key pair
      await new Promise<void>((resolve, reject) => {
        rlErr.once('close', reject);
        rlErr.on('line', (l) => {
          // This line is brittle
          // It may change if the log format changes
          // Make sure to keep it updated at the exact point when the DB is created
          if (l === 'INFO:polykey.PolykeyAgent.DB:Created DB') {
            agentProcess1.kill('SIGINT');
            resolve();
          }
        });
      });
      // Unlike bootstrapping, agent start can succeed under certain compatible partial state
      // However in some cases, state will conflict, and the start will fail with various errors
      // In such cases, the `--fresh` option must be used
      const agentProcess2 = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--client-host',
          '127.0.0.1',
          '--proxy-host',
          '127.0.0.1',
          '--workers',
          '0',
          '--fresh',
          '--verbose',
          '--format',
          'json',
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger.getChild('agentProcess2'),
      );
      const rlOut = readline.createInterface(agentProcess2.stdout!);
      const stdout = await new Promise<string>((resolve, reject) => {
        rlOut.once('line', resolve);
        rlOut.once('close', reject);
      });
      const statusLiveData = JSON.parse(stdout);
      expect(statusLiveData).toMatchObject({
        pid: expect.any(Number),
        nodeId: expect.any(String),
        clientHost: expect.any(String),
        clientPort: expect.any(Number),
        agentHost: expect.any(String),
        agentPort: expect.any(Number),
        proxyHost: expect.any(String),
        proxyPort: expect.any(Number),
        forwardHost: expect.any(String),
        forwardPort: expect.any(Number),
        recoveryCode: expect.any(String),
      });
      expect(
        statusLiveData.recoveryCode.split(' ').length === 12 ||
          statusLiveData.recoveryCode.split(' ').length === 24,
      ).toBe(true);
      agentProcess2.kill('SIGQUIT');
      await testUtils.processExit(agentProcess2);
      // Check for graceful exit
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        statusLockPath: path.join(
          dataDir,
          'polykey',
          config.defaults.statusLockBase,
        ),
        fs,
        logger,
      });
      const statusInfo = (await status.readStatus())!;
      expect(statusInfo.status).toBe('DEAD');
    },
    globalThis.defaultTimeout * 2,
  );
  testUtils.testIf(
    testUtils.isTestPlatformEmpty || testUtils.isTestPlatformDocker,
  )(
    'start from recovery code',
    async () => {
      const password1 = 'abc123';
      const password2 = 'new password';
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        statusLockPath: path.join(
          dataDir,
          'polykey',
          config.defaults.statusLockBase,
        ),
        fs,
        logger,
      });
      const agentProcess1 = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--node-path',
          path.join(dataDir, 'polykey'),
          '--client-host',
          '127.0.0.1',
          '--proxy-host',
          '127.0.0.1',
          '--workers',
          '0',
          '--verbose',
          '--format',
          'json',
        ],
        {
          env: {
            PK_PASSWORD: password1,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger.getChild('agentProcess1'),
      );
      const rlOut = readline.createInterface(agentProcess1.stdout!);
      const stdout = await new Promise<string>((resolve, reject) => {
        rlOut.once('line', resolve);
        rlOut.once('close', reject);
      });
      const statusLiveData = JSON.parse(stdout);
      const recoveryCode = statusLiveData.recoveryCode;
      const statusInfo1 = (await status.readStatus())!;
      agentProcess1.kill('SIGTERM');
      await testUtils.processExit(agentProcess1);
      const recoveryCodePath = path.join(dataDir, 'recovery-code');
      await fs.promises.writeFile(recoveryCodePath, recoveryCode + '\n');
      // When recovering, having the wrong bit size is not a problem
      const agentProcess2 = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--recovery-code-file',
          recoveryCodePath,
          '--client-host',
          '127.0.0.1',
          '--proxy-host',
          '127.0.0.1',
          '--workers',
          '0',
          '--verbose',
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password2,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger.getChild('agentProcess2'),
      );
      const statusInfo2 = await status.waitFor('LIVE');
      expect(statusInfo2.status).toBe('LIVE');
      // Node Id hasn't changed
      expect(statusInfo1.data.nodeId).toStrictEqual(statusInfo2.data.nodeId);
      agentProcess2.kill('SIGTERM');
      await testUtils.processExit(agentProcess2);
      // Check that the password has changed
      const agentProcess3 = await testUtils.pkSpawn(
        ['agent', 'start', '--workers', '0', '--verbose'],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password2,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger.getChild('agentProcess3'),
      );
      const statusInfo3 = await status.waitFor('LIVE');
      expect(statusInfo3.status).toBe('LIVE');
      // Node ID hasn't changed
      expect(statusInfo1.data.nodeId).toStrictEqual(statusInfo3.data.nodeId);
      agentProcess3.kill('SIGTERM');
      await testUtils.processExit(agentProcess3);
      // Checks deterministic generation using the same recovery code
      // First by deleting the polykey state
      await fs.promises.rm(path.join(dataDir, 'polykey'), {
        force: true,
        recursive: true,
      });
      const agentProcess4 = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--client-host',
          '127.0.0.1',
          '--proxy-host',
          '127.0.0.1',
          '--workers',
          '0',
          '--verbose',
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password2,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
            PK_RECOVERY_CODE: recoveryCode,
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger.getChild('agentProcess4'),
      );
      const statusInfo4 = await status.waitFor('LIVE');
      expect(statusInfo4.status).toBe('LIVE');
      // Same Node ID as before
      expect(statusInfo1.data.nodeId).toStrictEqual(statusInfo4.data.nodeId);
      agentProcess4.kill('SIGTERM');
      await testUtils.processExit(agentProcess4);
    },
    globalThis.defaultTimeout * 3,
  );
  testUtils.testIf(
    testUtils.isTestPlatformEmpty || testUtils.isTestPlatformDocker,
  )(
    'start with network configuration',
    async () => {
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        statusLockPath: path.join(
          dataDir,
          'polykey',
          config.defaults.statusLockBase,
        ),
        fs,
        logger,
      });
      const password = 'abc123';
      // Make sure these ports are not occupied
      const clientHost = '127.0.0.2';
      const clientPort = 55555;
      const proxyHost = '127.0.0.3';
      const proxyPort = 55556;
      const agentProcess = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--workers',
          '0',
          '--client-host',
          clientHost,
          '--client-port',
          clientPort.toString(),
          '--proxy-host',
          proxyHost,
          '--proxy-port',
          proxyPort.toString(),
          '--verbose',
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger.getChild('agentProcess'),
      );
      const statusInfo = await status.waitFor('LIVE');
      expect(statusInfo.data.clientHost).toBe(clientHost);
      expect(statusInfo.data.clientPort).toBe(clientPort);
      agentProcess.kill('SIGTERM');
      // Check for graceful exit
      await status.waitFor('DEAD');
    },
    globalThis.defaultTimeout * 2,
  );
  testUtils.testIf(
    testUtils.isTestPlatformEmpty || testUtils.isTestPlatformDocker,
  )(
    'start with --private-key-file override',
    async () => {
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        statusLockPath: path.join(
          dataDir,
          'polykey',
          config.defaults.statusLockBase,
        ),
        fs,
        logger,
      });
      const password = 'abc123';
      const keyPair = keysUtils.generateKeyPair();
      const nodeId = keysUtils.publicKeyToNodeId(keyPair.publicKey);
      const privateKeyJWK = keysUtils.privateKeyToJWK(keyPair.privateKey);
      const privateKeyJWE = keysUtils.wrapWithPassword(
        password,
        privateKeyJWK,
        keysUtils.passwordOpsLimits.min,
        keysUtils.passwordMemLimits.min,
      );
      const privateKeyPath = path.join(dataDir, 'private.jwe');
      await fs.promises.writeFile(
        privateKeyPath,
        JSON.stringify(privateKeyJWE),
        {
          encoding: 'utf-8',
        },
      );
      const agentProcess = await testUtils.pkSpawn(
        [
          'agent',
          'start',
          '--workers',
          '0',
          '--verbose',
          '--private-key-file',
          privateKeyPath,
        ],
        {
          env: {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
          command: globalThis.testCmd,
        },
        logger,
      );
      const statusInfo = await status.waitFor('LIVE');
      expect(nodeId.equals(statusInfo.data.nodeId)).toBe(true);
      agentProcess.kill('SIGINT');
      // Check for graceful exit
      await status.waitFor('DEAD');
    },
    globalThis.defaultTimeout * 2,
  );
  // TestUtils.describeIf(testUtils.isTestPlatformEmpty)
  describe('start with global agent', () => {
    let agentDataDir;
    let agent1Status: StatusLive;
    let agent1Close: () => Promise<void>;
    let agent2Status: StatusLive;
    let agent2Close: () => Promise<void>;
    let seedNodeId1: NodeId;
    let seedNodeHost1: Host;
    let seedNodePort1: Port;
    let seedNodeId2: NodeId;
    let seedNodeHost2: Host;
    let seedNodePort2: Port;
    beforeEach(async () => {
      // Additional seed node
      agentDataDir = await fs.promises.mkdtemp(
        path.join(globalThis.tmpDir, 'polykey-test-'),
      );
      ({ agentStatus: agent1Status, agentClose: agent1Close } =
        await testUtils.setupTestAgent(logger));
      ({ agentStatus: agent2Status, agentClose: agent2Close } =
        await testUtils.setupTestAgent(logger));
      seedNodeId1 = agent1Status.data.nodeId;
      seedNodeHost1 = agent1Status.data.proxyHost;
      seedNodePort1 = agent1Status.data.proxyPort;
      seedNodeId2 = agent2Status.data.nodeId;
      seedNodeHost2 = agent2Status.data.proxyHost;
      seedNodePort2 = agent2Status.data.proxyPort;
    });
    afterEach(async () => {
      await agent1Close();
      await agent2Close();
      await fs.promises.rm(agentDataDir, {
        force: true,
        recursive: true,
      });
    });
    test(
      'start with seed nodes option',
      async () => {
        const password = 'abc123';
        const nodePath = path.join(dataDir, 'polykey');
        const statusPath = path.join(nodePath, config.defaults.statusBase);
        const statusLockPath = path.join(
          nodePath,
          config.defaults.statusLockBase,
        );
        const status = new Status({
          statusPath,
          statusLockPath,
          fs,
          logger,
        });
        const mockedConfigDefaultsNetwork = jestMockProps
          .spyOnProp(config.defaults, 'network')
          .mockValue({
            mainnet: {
              [seedNodeId2]: {
                host: seedNodeHost2,
                port: seedNodePort2,
              },
            },
            testnet: {},
          });
        await testUtils.pkStdio(
          [
            'agent',
            'start',
            '--client-host',
            '127.0.0.1',
            '--proxy-host',
            '127.0.0.1',
            '--workers',
            '0',
            '--seed-nodes',
            `${seedNodeId1}@${seedNodeHost1}:${seedNodePort1};<defaults>`,
            '--network',
            'mainnet',
            '--verbose',
          ],
          {
            env: {
              PK_NODE_PATH: nodePath,
              PK_PASSWORD: password,
              PK_PASSWORD_OPS_LIMIT: 'min',
              PK_PASSWORD_MEM_LIMIT: 'min',
            },
            cwd: dataDir,
          },
        );
        await testUtils.pkStdio(['agent', 'stop'], {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
        });
        mockedConfigDefaultsNetwork.mockRestore();
        await status.waitFor('DEAD');
      },
      globalThis.defaultTimeout * 2,
    );
    test(
      'start with seed nodes environment variable',
      async () => {
        const password = 'abc123';
        const nodePath = path.join(dataDir, 'polykey');
        const statusPath = path.join(nodePath, config.defaults.statusBase);
        const statusLockPath = path.join(
          nodePath,
          config.defaults.statusLockBase,
        );
        const status = new Status({
          statusPath,
          statusLockPath,
          fs,
          logger,
        });
        const mockedConfigDefaultsNetwork = jestMockProps
          .spyOnProp(config.defaults, 'network')
          .mockValue({
            mainnet: {},
            testnet: {
              [seedNodeId2]: {
                host: seedNodeHost2,
                port: seedNodePort2,
              },
            },
          });
        await testUtils.pkStdio(
          [
            'agent',
            'start',
            '--client-host',
            '127.0.0.1',
            '--proxy-host',
            '127.0.0.1',
            '--workers',
            '0',
            '--verbose',
          ],
          {
            env: {
              PK_NODE_PATH: nodePath,
              PK_PASSWORD: password,
              PK_PASSWORD_OPS_LIMIT: 'min',
              PK_PASSWORD_MEM_LIMIT: 'min',
              PK_SEED_NODES: `<defaults>;${seedNodeId1}@${seedNodeHost1}:${seedNodePort1}`,
              PK_NETWORK: 'testnet',
            },
            cwd: dataDir,
          },
        );
        await testUtils.pkStdio(['agent', 'stop'], {
          env: {
            PK_NODE_PATH: nodePath,
            PK_PASSWORD: password,
            PK_PASSWORD_OPS_LIMIT: 'min',
            PK_PASSWORD_MEM_LIMIT: 'min',
          },
          cwd: dataDir,
        });
        mockedConfigDefaultsNetwork.mockRestore();
        await status.waitFor('DEAD');
      },
      globalThis.defaultTimeout * 2,
    );
  });
});
