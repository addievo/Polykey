import type { HandlerTypes } from '@matrixai/rpc';
import type NotificationsClear from '../handlers/notificationsClear';
import { UnaryCaller } from '@matrixai/rpc';

type CallerTypes = HandlerTypes<NotificationsClear>;

const notificationsClear = new UnaryCaller<
  CallerTypes['input'],
  CallerTypes['output']
>();

export default notificationsClear;
