import type { HandlerTypes } from '@matrixai/rpc';
import type GestaltsDiscoveryByNode from '../handlers/gestaltsDiscoveryByNode';
import { UnaryCaller } from '@matrixai/rpc';

type CallerTypes = HandlerTypes<GestaltsDiscoveryByNode>;

const gestaltsDiscoveryByNode = new UnaryCaller<
  CallerTypes['input'],
  CallerTypes['output']
>();

export default gestaltsDiscoveryByNode;
