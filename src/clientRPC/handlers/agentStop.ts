import type { RPCRequestParams, RPCResponseResult } from '../types';
import type PolykeyAgent from '../../PolykeyAgent';
import { running, status } from '@matrixai/async-init';
import { UnaryHandler } from '../../RPC/handlers';
import { UnaryCaller } from '../../RPC/callers';

const agentStop = new UnaryCaller<RPCRequestParams, RPCResponseResult>();

class AgentStopHandler extends UnaryHandler<
  {
    pkAgent: PolykeyAgent;
  },
  RPCRequestParams,
  RPCResponseResult
> {
  public async handle(): Promise<RPCResponseResult> {
    const { pkAgent } = this.container;
    // If not running or in stopping status, then respond successfully
    if (!pkAgent[running] || pkAgent[status] === 'stopping') {
      return {};
    }
    // Stop PK agent in the background, allow the RPC time to respond
    setTimeout(async () => {
      await pkAgent.stop();
    }, 500);
    return {};
  }
}

export { agentStop, AgentStopHandler };
