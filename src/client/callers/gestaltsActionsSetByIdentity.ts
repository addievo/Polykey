import type { HandlerTypes } from '@matrixai/rpc';
import type GestaltsActionsSetByIdentity from '../handlers/gestaltsActionsSetByIdentity';
import { UnaryCaller } from '@matrixai/rpc';

type CallerTypes = HandlerTypes<GestaltsActionsSetByIdentity>;

const gestaltsActionsSetByIdentity = new UnaryCaller<
  CallerTypes['input'],
  CallerTypes['output']
>();

export default gestaltsActionsSetByIdentity;
