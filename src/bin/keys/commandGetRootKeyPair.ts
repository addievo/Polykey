import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyClient from '../../PolykeyClient';
import { clientPB, utils as clientUtils } from '../../client';
import * as utils from '../../utils';
import * as binUtils from '../utils';
import * as grpcErrors from '../../grpc/errors';

const commandGetRootKeyPair = binUtils.createCommand('root', {
  description: 'Gets the contents of the primary keypair',
  nodePath: true,
  verbose: true,
  format: true,
});
commandGetRootKeyPair.option('-pk, --private-key', 'Include the private key');
commandGetRootKeyPair.action(async (options) => {
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
  const emptyMessage = new clientPB.EmptyMessage();

  try {
    await client.start({});
    const grpcClient = client.grpcClient;

    const pCall = grpcClient.keysRootKeyPair(
      emptyMessage,
      await client.session.createCallCredentials(),
    );
    pCall.call.on('metadata', (meta) => {
      clientUtils.refreshSession(meta, client.session);
    });

    const keyPair = await pCall;

    process.stdout.write(
      binUtils.outputFormatter({
        type: options.format === 'json' ? 'json' : 'list',
        data: [`public key:\t\t${keyPair.getPublic()}...`],
      }),
    );

    if (options.privateKey) {
      process.stdout.write(
        binUtils.outputFormatter({
          type: options.format === 'json' ? 'json' : 'list',
          data: [`private key:\t\t${keyPair.getPrivate()}...`],
        }),
      );
    }
  } catch (err) {
    if (err instanceof grpcErrors.ErrorGRPCClientTimeout) {
      process.stderr.write(`${err.message}\n`);
    } else if (err instanceof grpcErrors.ErrorGRPCServerNotStarted) {
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

export default commandGetRootKeyPair;
