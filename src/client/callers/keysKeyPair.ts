import type { HandlerTypes } from '@matrixai/rpc';
import type KeysKeyPair from '../handlers/keysKeyPair';
import { UnaryCaller } from '@matrixai/rpc';

type CallerTypes = HandlerTypes<KeysKeyPair>;

const keysKeyPair = new UnaryCaller<
  CallerTypes['input'],
  CallerTypes['output']
>();

export default keysKeyPair;
