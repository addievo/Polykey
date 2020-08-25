import process from 'process';
import commander from 'commander';
import { spawn, ChildProcess, exec } from 'child_process';
import { PolykeyAgent } from '../lib/Polykey';
import { actionRunner, pkLogger, PKMessageType, determineNodePath } from '.';

const pathRegex = /^([a-zA-Z0-9_ -]+)(?::)([a-zA-Z0-9_ -]+)(?:=)?([a-zA-Z_][a-zA-Z0-9_]+)?$/;

function makeListSecretsCommand() {
  return new commander.Command('list')
    .description('list all available secrets for a given vault')
    .alias('ls')
    .option('--node-path <nodePath>', 'node path')
    .option('--verbose', 'increase verbosity level by one')
    .arguments('vault name(s) to list')
    .action(
      actionRunner(async (options) => {
        const client = PolykeyAgent.connectToAgent();

        const nodePath = determineNodePath(options);
        const isVerbose: boolean = options.verbose ?? false;
        const vaultNames: string[] = Array.from(options.args.values());

        if (!vaultNames.length) {
          throw Error('no vault names provided');
        }

        for (const vaultName of vaultNames) {
          // Get list of secrets from pk
          const secretNames = await client.listSecrets(nodePath, vaultName);

          // List secrets
          if (secretNames.length == 0 && isVerbose) {
            pkLogger(`no secrets found for vault '${vaultName}'`, PKMessageType.INFO);
          } else {
            if (isVerbose) {
              pkLogger(`secrets contained within the ${vaultName} vault:`, PKMessageType.INFO);
            }
            secretNames.forEach((secretName) => {
              pkLogger(`${vaultName}:${secretName}`, PKMessageType.INFO);
            });
          }
        }
      }),
    );
}

function makeNewSecretCommand() {
  return new commander.Command('new')
    .description("create a secret within a given vault, specify a secret path with '<vaultName>:<secretName>'")
    .option('--node-path <nodePath>', 'node path')
    .arguments("secret path of the format '<vaultName>:<secretName>'")
    .requiredOption('-f, --file-path <filePath>', 'path to the secret to be added')
    .option('--verbose', 'increase verbosity level by one')
    .action(
      actionRunner(async (options) => {
        const client = PolykeyAgent.connectToAgent();
        const nodePath = determineNodePath(options);

        const isVerbose: boolean = options.verbose ?? false;
        const secretPath: string[] = Array.from<string>(options.args.values());
        if (secretPath.length < 1 || (secretPath.length == 1 && !pathRegex.test(secretPath[0]))) {
          throw Error("please specify a new secret name using the format: '<existingVaultName>:<secretName>'");
        } else if (secretPath.length > 1) {
          throw Error('you can only add one secret at a time');
        }
        const firstEntry = secretPath[0];
        const [_, vaultName, secretName] = firstEntry.match(pathRegex)!;
        const filePath: string = options.filePath;
        try {
          // Add the secret
          const successful = await client.createSecret(nodePath, vaultName, secretName, filePath);
          pkLogger(
            `secret '${secretName}' was ${successful ? '' : 'un-'}successfully added to vault '${vaultName}'`,
            PKMessageType.SUCCESS,
          );
        } catch (err) {
          throw Error(`Error when adding secret: ${err.message}`);
        }
      }),
    );
}

function makeUpdateSecretCommand() {
  return new commander.Command('update')
    .description("update a secret within a given vault, specify a secret path with '<vaultName>:<secretName>'")
    .option('--node-path <nodePath>', 'node path')
    .arguments("secret path of the format '<vaultName>:<secretName>'")
    .requiredOption('-f, --file-path <filePath>', 'path to the new secret')
    .option('--verbose', 'increase verbosity level by one')
    .action(
      actionRunner(async (options) => {
        const client = PolykeyAgent.connectToAgent();
        const nodePath = determineNodePath(options);

        const isVerbose: boolean = options.verbose ?? false;
        const secretPath: string[] = Array.from<string>(options.args.values());
        if (secretPath.length < 1 || (secretPath.length == 1 && !pathRegex.test(secretPath[0]))) {
          throw Error("please specify the secret using the format: '<vaultName>:<secretName>'");
        } else if (secretPath.length > 1) {
          throw Error('you can only update one secret at a time');
        }
        const firstEntry = secretPath[0];
        const [_, vaultName, secretName] = firstEntry.match(pathRegex)!;
        const filePath: string = options.filePath;
        try {
          // Update the secret
          const successful = await client.updateSecret(nodePath, vaultName, secretName, filePath);
          pkLogger(
            `secret '${secretName}' was ${successful ? '' : 'un-'}successfully updated in vault '${vaultName}'`,
            successful ? PKMessageType.SUCCESS : PKMessageType.WARNING,
          );
        } catch (err) {
          throw Error(`Error when updating secret: ${err.message}`);
        }
      }),
    );
}

function makeDeleteSecretCommand() {
  return new commander.Command('delete')
    .alias('del')
    .description("delete a secret from a given vault, specify a secret path with '<vaultName>:<secretName>'")
    .arguments("secret path of the format '<vaultName>:<secretName>'")
    .option('--verbose', 'increase verbosity level by one')
    .action(
      actionRunner(async (options) => {
        const client = PolykeyAgent.connectToAgent();
        const nodePath = determineNodePath(options);

        const isVerbose: boolean = options.verbose ?? false;
        const secretPath: string[] = Array.from<string>(options.args.values());
        if (secretPath.length < 1 || (secretPath.length == 1 && !pathRegex.test(secretPath[0]))) {
          throw Error("please specify the secret using the format: '<vaultName>:<secretName>'");
        } else if (secretPath.length > 1) {
          throw Error('you can only delete one secret at a time');
        }
        const firstEntry = secretPath[0];
        const [_, vaultName, secretName] = firstEntry.match(pathRegex)!;
        try {
          // Remove secret
          const successful = await client.destroySecret(nodePath, vaultName, secretName);
          pkLogger(
            `secret '${secretName}' was ${successful ? '' : 'un-'}successfully removed from vault '${vaultName}'`,
            PKMessageType.SUCCESS,
          );
        } catch (err) {
          throw Error(`Error when removing secret: ${err.message}`);
        }
      }),
    );
}

function makeGetSecretCommand() {
  return new commander.Command('get')
    .description("retrieve a secret from a given vault, specify a secret path with '<vaultName>:<secretName>'")
    .arguments("secret path of the format '<vaultName>:<secretName>'")
    .option('-e, --env', 'wrap the secret in an environment variable declaration')
    .action(
      actionRunner(async (options) => {
        const client = PolykeyAgent.connectToAgent();
        const nodePath = determineNodePath(options);

        const isEnv: boolean = options.env ?? false;
        const isVerbose: boolean = options.verbose ?? false;
        const secretPath: string[] = Array.from<string>(options.args.values());
        if (secretPath.length < 1 || (secretPath.length == 1 && !pathRegex.test(secretPath[0]))) {
          throw Error("please specify the secret using the format: '<vaultName>:<secretName>'");
        } else if (secretPath.length > 1) {
          throw Error('you can only get one secret at a time');
        }
        const firstEntry = secretPath[0];
        const [_, vaultName, secretName] = firstEntry.match(pathRegex)!;
        try {
          // Retrieve secret
          const secret = await client.getSecret(nodePath, vaultName, secretName);
          if (isEnv) {
            pkLogger(`export ${secretName.toUpperCase().replace('-', '_')}='${secret.toString()}'`, PKMessageType.none);
          } else {
            pkLogger(secret.toString(), PKMessageType.none);
          }
        } catch (err) {
          throw Error(`Error when retrieving secret: ${err.message}`);
        }
      }),
    );
}

function makeSecretEnvCommand() {
  return new commander.Command('env')
    .storeOptionsAsProperties(false)
    .description(
      "run a modified environment with injected secrets, specify a secret path with '<vaultName>:<secretName>'",
    )
    .option(
      '--command <command>',
      'In the environment of the derivation, run the shell command cmd. This command is executed in an interactive shell. (Use --run to use a non-interactive shell instead.)',
    )
    .option(
      '--run <run>',
      'Like --command, but executes the command in a non-interactive shell. This means (among other things) that if you hit Ctrl-C while the command is running, the shell exits.',
    )
    .arguments(
      "secrets to inject into env, of the format '<vaultName>:<secretName>'. you can also control what the environment variable will be called using '<vaultName>:<secretName>=<variableName>', defaults to upper, snake case of the original secret name.",
    )
    .action(
      actionRunner(async (cmd) => {
        const options = cmd.opts();

        const client = PolykeyAgent.connectToAgent();
        const nodePath = determineNodePath(options);

        const isVerbose: boolean = options.verbose ?? false;
        const command: string | undefined = options.command;
        const run: string | undefined = options.run;

        const secretPathList: string[] = Array.from<string>(cmd.args.values());

        if (secretPathList.length < 1) {
          throw Error('please specify at least one secret');
        }

        // Parse secret paths in list
        const parsedPathList: { vaultName: string; secretName: string; variableName: string }[] = [];
        for (const path of secretPathList) {
          if (!pathRegex.test(path)) {
            throw Error(`secret path was not of the format '<vaultName>:<secretName>[=<variableName>]': ${path}`);
          }
          const [_, vaultName, secretName, variableName] = path.match(pathRegex)!;
          parsedPathList.push({
            vaultName,
            secretName,
            variableName: variableName ?? secretName.toUpperCase().replace('-', '_'),
          });
        }

        const secretEnv = { ...process.env };
        try {
          // Get all the secrets
          for (const obj of parsedPathList) {
            const secret = await client.getSecret(nodePath, obj.vaultName, obj.secretName);
            secretEnv[obj.variableName] = secret.toString();
          }
        } catch (err) {
          throw Error(`Error when retrieving secret: ${err.message}`);
        }
        try {
          const shellPath = process.env.SHELL ?? "sh";
          const args: string[] = [];
          if (command && run) {
            throw Error('only one of --command or --run can be specified');
          } else if (command) {
            args.push('-i');
            args.push('-c');
            args.push(`"${command}"`);
          } else if (run) {
            args.push('-c');
            args.push(`"${run}"`);
          }
          const shell = spawn(shellPath, args, {
            stdio: 'inherit',
            env: secretEnv,
            shell: true,
          });
          shell.on('close', (code) => {
            if (code != 0) {
              pkLogger(`polykey: environment terminated with code: ${code}`, PKMessageType.WARNING);
            }
          });
        } catch (err) {
          throw Error(`Error when running environment: ${err.message}`);
        }
      }),
    );
}

function makeSecretsCommand() {
  return new commander.Command('secrets')
    .description('manipulate secrets for a given vault')
    .addCommand(makeListSecretsCommand())
    .addCommand(makeNewSecretCommand())
    .addCommand(makeUpdateSecretCommand())
    .addCommand(makeDeleteSecretCommand())
    .addCommand(makeGetSecretCommand())
    .addCommand(makeSecretEnvCommand());
}

export default makeSecretsCommand;
