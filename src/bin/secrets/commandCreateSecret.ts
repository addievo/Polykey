import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { clientPB, utils as clientUtils } from '../../client';
import PolykeyClient from '../../PolykeyClient';
import * as utils from '../../utils';
import * as binUtils from '../utils';
import * as CLIErrors from '../errors';
import * as grpcErrors from '../../grpc/errors';

const commandCreateSecret = binUtils.createCommand('create', {
  description: 'Creates a secret within a given vault',
  aliases: ['touch', 'new'],
  nodePath: true,
  verbose: true,
  format: true,
});
commandCreateSecret.requiredOption(
  '-sp, --secret-path <secretPath>',
  '(required) Path to the secret to be added, specified as <vaultName>:<secretPath>',
);
commandCreateSecret.requiredOption(
  '-fp, --file-path <filePath>',
  '(required) File path containing the secret to be added',
);
commandCreateSecret.action(async (options) => {
  const clientConfig = {};
  clientConfig['logger'] = new Logger('CLI Logger', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  if (options.verbose) {
    clientConfig['logger'].setLevel(LogLevel.DEBUG);
  }
  clientConfig['nodePath'] = options.nodePath
    ? options.nodePath
    : utils.getDefaultNodePath();

  const client = new PolykeyClient(clientConfig);
  const secretMessage = new clientPB.SecretMessage();
  const vaultMessage = new clientPB.VaultMessage();
  secretMessage.setVault(vaultMessage);

  try {
    await client.start({});
    const grpcClient = client.grpcClient;

    const secretPath: string = options.secretPath;
    if (!binUtils.pathRegex.test(secretPath)) {
      throw new CLIErrors.ErrorSecretPathFormat();
    }
    const [, vaultName, secretName] = secretPath.match(binUtils.pathRegex)!;

    const content = fs.readFileSync(options.filePath, { encoding: 'utf-8' });

    vaultMessage.setName(vaultName);
    secretMessage.setName(secretName);
    secretMessage.setContent(content);

    const pCall = grpcClient.vaultsNewSecret(
      secretMessage,
      await client.session.createCallCredentials(),
    );
    pCall.call.on('metadata', (meta) => {
      clientUtils.refreshSession(meta, client.session);
    });

    const responseMessage = await pCall;
    if (responseMessage.getSuccess()) {
      process.stdout.write(
        binUtils.outputFormatter({
          type: options.format === 'json' ? 'json' : 'list',
          data: [
            `Secret: ${secretMessage.getName()} successfully created in vault: ${vaultMessage.getName()}`,
          ],
        }),
      );
    } else {
      process.stdout.write(
        binUtils.outputFormatter({
          type: options.format === 'json' ? 'json' : 'list',
          data: [
            `Failed to create secret: ${secretMessage.getName()} in vault: ${vaultMessage.getName()}`,
          ],
        }),
      );
    }
  } catch (err) {
    if (err instanceof grpcErrors.ErrorGRPCClientTimeout) {
      process.stderr.write(`${err.message}\n`);
    }
    if (err instanceof grpcErrors.ErrorGRPCServerNotStarted) {
      process.stderr.write(`${err.message}\n`);
    } else {
      process.stderr.write(
        binUtils.outputFormatter({
          type: 'error',
          description: err.description,
          message: err.message,
        }),
      );
      throw err;
    }
  } finally {
    await client.stop();
    options.nodePath = undefined;
    options.verbose = undefined;
    options.format = undefined;
  }
});

export default commandCreateSecret;
