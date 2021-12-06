import type { StdioOptions } from 'child_process';
import type { AgentChildProcessInput, AgentChildProcessOutput } from '../types';
import type PolykeyAgent from '../../PolykeyAgent';
import type { RecoveryCode } from '../../keys/types';
import path from 'path';
import child_process from 'child_process';
import process from 'process';
import CommandPolykey from '../CommandPolykey';
import * as binOptions from '../utils/options';
import * as binProcessors from '../utils/processors';
import * as binErrors from '../errors';
import { promise } from '../../utils';
import config from '../../config';

class CommandStart extends CommandPolykey {
  constructor(...args: ConstructorParameters<typeof CommandPolykey>) {
    super(...args);
    this.name('start');
    this.description('Start the Polykey Agent');
    this.addOption(binOptions.recoveryCodeFile);
    this.addOption(binOptions.rootKeyPairBits);
    this.addOption(binOptions.clientHost);
    this.addOption(binOptions.clientPort);
    this.addOption(binOptions.ingressHost);
    this.addOption(binOptions.ingressPort);
    this.addOption(binOptions.background);
    this.addOption(binOptions.backgroundOutFile);
    this.addOption(binOptions.backgroundErrFile);
    this.action(async (options) => {
      options.clientHost =
        options.clientHost ?? config.defaults.networkConfig.clientHost;
      options.clientPort =
        options.clientPort ?? config.defaults.networkConfig.clientPort;
      const { default: PolykeyAgent } = await import('../../PolykeyAgent');
      // Password is necessary
      // If recovery code is supplied, then this is the new password
      const password = await binProcessors.processPassword(
        options.passwordFile,
        this.fs,
      );
      const recoveryCodeIn = await binProcessors.processRecoveryCode(
        options.recoveryCodeFile,
        this.fs,
      );
      const agentConfig = {
        password,
        nodePath: options.nodePath,
        keysConfig: {
          rootKeyPairBits: options.rootKeyPairBits,
          recoveryCode: recoveryCodeIn,
        },
        networkConfig: {
          clientHost: options.clientHost,
          clientPort: options.clientPort,
          ingressHost: options.ingressHost,
          ingressPort: options.ingressPort,
        },
        fresh: options.fresh,
      };
      let recoveryCodeOut: RecoveryCode | undefined;
      if (options.background) {
        const stdio: StdioOptions = ['ignore', 'ignore', 'ignore', 'ipc'];
        if (options.backgroundOutFile != null) {
          const agentOutFile = await this.fs.promises.open(
            options.backgroundOutFile,
            'w',
          );
          stdio[1] = agentOutFile.fd;
        }
        if (options.backgroundErrFile != null) {
          const agentErrFile = await this.fs.promises.open(
            options.backgroundErrFile,
            'w',
          );
          stdio[2] = agentErrFile.fd;
        }
        const agentProcess = child_process.fork(
          path.join(__dirname, '../polykey-agent'),
          [],
          {
            cwd: process.cwd(),
            env: process.env,
            detached: true,
            serialization: 'advanced',
            stdio,
          },
        );
        const {
          p: agentProcessP,
          resolveP: resolveAgentProcessP,
          rejectP: rejectAgentProcessP,
        } = promise<void>();
        // Once the agent responds with message, it considered ok to go-ahead
        agentProcess.once('message', (messageOut: AgentChildProcessOutput) => {
          if (messageOut.status === 'SUCCESS') {
            agentProcess.unref();
            agentProcess.disconnect();
            recoveryCodeOut = messageOut.recoveryCode;
            resolveAgentProcessP();
            return;
          } else {
            rejectAgentProcessP(
              new binErrors.ErrorCLIPolykeyAgentProcess(
                'Agent process responded with error',
                messageOut.error,
              ),
            );
            return;
          }
        });
        // Handle error event during abnormal spawning, this is rare
        agentProcess.once('error', (e) => {
          rejectAgentProcessP(
            new binErrors.ErrorCLIPolykeyAgentProcess(e.message),
          );
        });
        // If the process exits during initial execution of polykey-agent script
        // Then it is an exception, because the agent process is meant to be a long-running daemon
        agentProcess.once('close', (code, signal) => {
          rejectAgentProcessP(
            new binErrors.ErrorCLIPolykeyAgentProcess(
              'Agent process closed during fork',
              {
                code,
                signal,
              },
            ),
          );
        });
        const messageIn: AgentChildProcessInput = {
          logLevel: this.logger.getEffectiveLevel(),
          agentConfig,
        };
        agentProcess.send(messageIn, (e) => {
          if (e != null)
            rejectAgentProcessP(
              new binErrors.ErrorCLIPolykeyAgentProcess(
                'Failed sending agent process message',
              ),
            );
        });
        await agentProcessP;
      } else {
        // Change process name to polykey-agent
        process.title = 'polykey-agent';
        // eslint-disable-next-line prefer-const
        let pkAgent: PolykeyAgent | undefined;
        this.exitHandlers.handlers.push(async () => {
          if (pkAgent != null) await pkAgent.stop();
        });
        pkAgent = await PolykeyAgent.createPolykeyAgent({
          fs: this.fs,
          logger: this.logger.getChild(PolykeyAgent.name),
          ...agentConfig,
        });
        recoveryCodeOut = pkAgent.keyManager.getRecoveryCode();
      }
      // Recovery code is only available if it was newly generated
      if (recoveryCodeOut != null) {
        process.stdout.write(recoveryCodeOut + '\n');
      }
    });
  }
}

export default CommandStart;
