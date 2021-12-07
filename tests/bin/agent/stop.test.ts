import os from 'os';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { Status } from '@/status';
import config from '@/config';
import * as binUtils from '@/bin/utils';
import * as binErrors from '@/bin/errors';
import * as testBinUtils from '../utils';

describe('stop', () => {
  const logger = new Logger('stop test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
  });
  afterEach(async () => {
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test(
    'stop LIVE agent',
    async () => {
      const password = 'abc123';
      const { exitCode } = await testBinUtils.pkStdio(
        [
          'agent',
          'start',
          // 1024 is the smallest size and is faster to start
          '--root-key-pair-bits',
          '1024',
        ],
        {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
          PK_PASSWORD: password,
        },
        dataDir,
      );
      expect(exitCode).toBe(0);
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        fs,
        logger,
      });
      await testBinUtils.pkStdio(
        [
          'agent',
          'stop',
        ],
        {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
          PK_PASSWORD: password,
        },
        dataDir
      );
      await status.waitFor('DEAD');
    },
    global.defaultTimeout * 2,
  );
  test(
    'stopping is idempotent during concurrent calls and STOPPING or DEAD status',
    async () => {
      const password = 'abc123';
      const passwordPath = path.join(dataDir, 'password');
      await fs.promises.writeFile(passwordPath, password);
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        fs,
        logger,
      });
      const { exitCode } = await testBinUtils.pkStdio(
        [
          'agent',
          'start',
          // 1024 is the smallest size and is faster to start
          '--root-key-pair-bits',
          '1024',
        ],
        {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
          PK_PASSWORD: password,
        },
        dataDir,
      );
      expect(exitCode).toBe(0);
      // Simultaneous calls to stop must use pkExec
      const [agentStop1, agentStop2] = await Promise.all([
        testBinUtils.pkExec(
          [
            'agent',
            'stop',
            '--password-file',
            passwordPath,
          ],
          {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
          },
          dataDir,
        ),
        testBinUtils.pkExec(
          [
            'agent',
            'stop',
            '--password-file',
            passwordPath,
          ],
          {
            PK_NODE_PATH: path.join(dataDir, 'polykey'),
          },
          dataDir,
        ),
      ]);
      await status.waitFor('STOPPING');
      const agentStop3 = await testBinUtils.pkStdio(
        [
          'agent',
          'stop',
          '--node-path',
          path.join(dataDir, 'polykey'),
        ],
        {
          PK_PASSWORD: password,
        },
        dataDir,
      );
      await status.waitFor('DEAD');
      const agentStop4 = await testBinUtils.pkStdio(
        [
          'agent',
          'stop',
          '--password-file',
          passwordPath,
        ],
        {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
        },
        dataDir,
      );
      expect(agentStop1.exitCode).toBe(0);
      expect(agentStop2.exitCode).toBe(0);
      expect(agentStop3.exitCode).toBe(0);
      expect(agentStop4.exitCode).toBe(0);
    },
    global.defaultTimeout * 2
  );
  test(
    'stopping starting agent results in error',
    async () => {
      const password = 'abc123';
      const status = new Status({
        statusPath: path.join(dataDir, 'polykey', config.defaults.statusBase),
        fs,
        logger,
      });
      await testBinUtils.pkSpawn(
        [
          'agent',
          'start',
          // 1024 is the smallest size and is faster to start
          '--root-key-pair-bits',
          '1024',
          '--verbose'
        ],
        {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
          PK_PASSWORD: password,
        },
        dataDir,
        logger
      );
      await status.waitFor('STARTING');
      const { exitCode, stderr } = await testBinUtils.pkStdio(
        [
          'agent',
          'stop',
        ],
        {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
        },
        dataDir,
      );
      testBinUtils.expectProcessError(
        exitCode,
        stderr,
        new binErrors.ErrorCLIStatusStarting()
      );
      await status.waitFor('LIVE');
      await testBinUtils.pkStdio(
        [
          'agent',
          'stop',
        ],
        {
          PK_NODE_PATH: path.join(dataDir, 'polykey'),
          PK_PASSWORD: password,
        },
        dataDir,
      );
      await status.waitFor('DEAD');
    },
    global.defaultTimeout * 2
  );
});
