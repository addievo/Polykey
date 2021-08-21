import PolykeyClient from '../../PolykeyClient';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { createCommand, outputFormatter } from '../utils';
import { clientPB, utils as clientUtils } from '../../client';

const echo = createCommand('echo', {
  description: {
    description: 'Calls echo',
    args: {
      text: 'Text to echo',
    },
  },
  nodePath: true,
  verbose: true,
  format: true,
});
echo.arguments('<text>');
echo.action(async (text, options) => {
  const clientConfig = {};
  clientConfig['logger'] = new Logger('CLI Logger', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  if (options.verbose) {
    clientConfig['logger'].setLevel(LogLevel.DEBUG);
  }
  if (options.nodePath) {
    clientConfig['nodePath'] = options.nodePath;
  }

  const client = new PolykeyClient(clientConfig);

  try {
    await client.start({});
    const grpcClient = client.grpcClient;

    const echoMessage = new clientPB.EchoMessage();
    echoMessage.setChallenge(text);

    const pCall = grpcClient.echo(echoMessage);
    pCall.call.on('metadata', (meta) => {
      clientUtils.refreshSession(meta, client.session);
    });

    const responseMessage = await pCall;
    process.stdout.write(
      outputFormatter({
        type: options.format === 'json' ? 'json' : 'list',
        data: [`${responseMessage.getChallenge()}`],
      }),
    );
  } catch (e) {
    process.stderr.write(
      outputFormatter({
        // If set as --format json, we would expect output to be in JSON. But,
        // for stderr output, we should override this with 'error'
        type: 'error',
        description: e.description,
        message: e.message,
      }),
    );
    throw e;
  } finally {
    await client.stop();
  }
});

export default echo;
