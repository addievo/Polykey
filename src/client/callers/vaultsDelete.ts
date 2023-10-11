import type { HandlerTypes } from '@matrixai/rpc';
import type VaultsDelete from '../handlers/vaultsDelete';
import { UnaryCaller } from '@matrixai/rpc';

type CallerTypes = HandlerTypes<VaultsDelete>;

const vaultsDelete = new UnaryCaller<
  CallerTypes['input'],
  CallerTypes['output']
>();

export default vaultsDelete;
