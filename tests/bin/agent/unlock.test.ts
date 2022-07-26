import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import Session from '@/sessions/Session';
import config from '@/config';
import * as testBinUtils from '../utils';
import { runTestIfPlatforms } from '../../utils';
import { globalRootKeyPems } from '../../globalRootKeyPems';

describe('unlock', () => {
  const logger = new Logger('unlock test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  let agentDir;
  let agentPassword;
  let agentClose;
  beforeEach(async () => {
    ({ agentDir, agentPassword, agentClose } =
      await testBinUtils.setupTestAgent(globalRootKeyPems[0], logger));
  });
  afterEach(async () => {
    await agentClose();
  });
  runTestIfPlatforms('linux', 'docker')(
    'unlock acquires session token',
    async () => {
      // Fresh session, to delete the token
      const session = await Session.createSession({
        sessionTokenPath: path.join(agentDir, config.defaults.tokenBase),
        fs,
        logger,
        fresh: true,
      });
      let exitCode, stdout;
      ({ exitCode } = await testBinUtils.pkStdio(
        ['agent', 'unlock'],
        {
          PK_NODE_PATH: agentDir,
          PK_PASSWORD: agentPassword,
        },
        agentDir,
      ));
      expect(exitCode).toBe(0);
      // Run command without password
      ({ exitCode, stdout } = await testBinUtils.pkStdio(
        ['agent', 'status', '--format', 'json'],
        {
          PK_NODE_PATH: agentDir,
        },
        agentDir,
      ));
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({ status: 'LIVE' });
      // Run command with PK_TOKEN
      ({ exitCode, stdout } = await testBinUtils.pkStdio(
        ['agent', 'status', '--format', 'json'],
        {
          PK_NODE_PATH: agentDir,
          PK_TOKEN: await session.readToken(),
        },
        agentDir,
      ));
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({ status: 'LIVE' });
      await session.stop();
    },
  );
});
