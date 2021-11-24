import type { Metadata } from '@grpc/grpc-js';

import CommandPolykey from '../CommandPolykey';
import * as binUtils from '../utils';
import * as binOptions from '../options';
import * as parsers from '../parsers';

class CommandUpdate extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('update');
    this.description('Update a Secret');
    this.argument(
      '<directoryPath>',
      'On disk path to the secret file with the contents of the updated secret',
    );
    this.argument(
      '<secretPath>',
      'Path to where the secret to be updated, specified as <vaultName>:<directoryPath>',
      parsers.parseSecretPath,
    );
    this.addOption(binOptions.nodeId);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.action(async (directoryPath, secretPath, options) => {
      const { default: PolykeyClient } = await import('../../PolykeyClient');
      const vaultsPB = await import(
        '../../proto/js/polykey/v1/vaults/vaults_pb'
      );
      const secretsPB = await import(
        '../../proto/js/polykey/v1/secrets/secrets_pb'
      );

      const client = await PolykeyClient.createPolykeyClient({
        nodePath: options.nodePath,
        logger: this.logger.getChild(PolykeyClient.name),
      });

      const meta = await parsers.parseAuth({
        passwordFile: options.passwordFile,
        fs: this.fs,
      });

      try {
        const grpcClient = client.grpcClient;
        const vaultMessage = new vaultsPB.Vault();
        const secretMessage = new secretsPB.Secret();
        secretMessage.setVault(vaultMessage);
        vaultMessage.setNameOrId(secretPath[0]);
        secretMessage.setSecretName(secretPath[1]);

        const content = await this.fs.promises.readFile(directoryPath);
        secretMessage.setSecretContent(content);

        await binUtils.retryAuth(
          (auth?: Metadata) =>
            grpcClient.vaultsSecretsEdit(secretMessage, auth),
          meta,
        );

        process.stdout.write(
          binUtils.outputFormatter({
            type: options.format === 'json' ? 'json' : 'list',
            data: [
              `Updated secret: ${secretMessage.getSecretName()} in vault: ${vaultMessage.getNameOrId()}`,
            ],
          }),
        );
      } finally {
        await client.stop();
      }
    });
  }
}

export default CommandUpdate;
