import type { Host, Port } from '../../network/types';
import { errors } from '../../grpc';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { clientPB } from '../../client';
import PolykeyClient from '../../PolykeyClient';
import { createCommand, outputFormatter } from '../utils';
import { ErrorNodeGraphNodeNotFound } from '../../errors';
import { ErrorFindNodeFailed } from '@/bin/errors';
import { buildAddress } from '../../network/utils';

const commandFindNode = createCommand('find', {
  description: {
    description: 'Tries to find a node in the DHT',
    args: {
      node: 'Id of the node.',
    },
  },
  nodePath: true,
  verbose: true,
  format: true,
});
commandFindNode.arguments('<node>');
commandFindNode.action(async (node, options) => {
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

    const nodeMessage = new clientPB.NodeMessage();
    nodeMessage.setName(node);

    const result = { success: false, message: '', id: '', host: '', port: 0 };
    try {
      const res = await grpcClient.nodesFind(
        nodeMessage,
        await client.session.createCallCredentials(),
      );
      result.success = true;
      result.id = res.getId();
      result.host = res.getHost();
      result.port = res.getPort();
      result.message = `Found node at ${buildAddress(
        result.host as Host,
        result.port as Port,
      )}`;
    } catch (err) {
      if (!(err instanceof ErrorNodeGraphNodeNotFound)) throw err;
      // else failed to find the node.
      result.success = false;
      result.id = node;
      result.host = '';
      result.port = 0;
      result.message = `Failed to find node ${result.id}`;
    }

    let output: any = result;
    if (options.format === 'human') output = [result.message];

    process.stdout.write(
      outputFormatter({
        type: options.format === 'json' ? 'json' : 'list',
        data: output,
      }),
    );
    //Like ping it should error when failing to find node for automation reasons.
    if (!result.success) throw new ErrorFindNodeFailed(result.message);
  } catch (err) {
    if (err instanceof errors.ErrorGRPCClientTimeout) {
      process.stderr.write(`${err.message}\n`);
    } else if (err instanceof errors.ErrorGRPCServerNotStarted) {
      process.stderr.write(`${err.message}\n`);
    } else if (err instanceof ErrorFindNodeFailed) {
      //Do nothing, error already printed in stdout.
    } else {
      process.stdout.write(
        outputFormatter({
          type: options.format === 'json' ? 'json' : 'list',
          data: ['Error:', err.message],
        }),
      );
    }
    throw err;
  } finally {
    await client.stop();
  }
});

export default commandFindNode;
