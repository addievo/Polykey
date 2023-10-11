import type { HandlerTypes } from '@matrixai/rpc';
import type IdentitiesInfoConnectedGet from '../handlers/identitiesInfoConnectedGet';
import { ServerCaller } from '@matrixai/rpc';

type CallerTypes = HandlerTypes<IdentitiesInfoConnectedGet>;

const identitiesInfoConnectedGet = new ServerCaller<
  CallerTypes['input'],
  CallerTypes['output']
>();

export default identitiesInfoConnectedGet;
