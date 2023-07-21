import type { ClientRPCRequestParams, ClientRPCResponseResult } from '../types';
import type { DB } from '@matrixai/db';
import type { IdentityId, ProviderId } from '../../ids/index';
import type { GestaltAction } from '../../gestalts/types';
import type GestaltGraph from '../../gestalts/GestaltGraph';
import type { SetIdentityActionMessage } from './types';
import { UnaryHandler } from '../../rpc/handlers';
import { validateSync } from '../../validation/index';
import { matchSync } from '../../utils/index';
import * as validationUtils from '../../validation/utils';

class GestaltsActionsSetByIdentityHandler extends UnaryHandler<
  {
    gestaltGraph: GestaltGraph;
    db: DB;
  },
  ClientRPCRequestParams<SetIdentityActionMessage>,
  ClientRPCResponseResult
> {
  public async handle(
    input: ClientRPCRequestParams<SetIdentityActionMessage>,
  ): Promise<ClientRPCResponseResult> {
    const { db, gestaltGraph } = this.container;
    const {
      action,
      providerId,
      identityId,
    }: {
      action: GestaltAction;
      providerId: ProviderId;
      identityId: IdentityId;
    } = validateSync(
      (keyPath, value) => {
        return matchSync(keyPath)(
          [['action'], () => validationUtils.parseGestaltAction(value)],
          [['providerId'], () => validationUtils.parseProviderId(value)],
          [['identityId'], () => validationUtils.parseIdentityId(value)],
          () => value,
        );
      },
      {
        action: input.action,
        providerId: input.providerId,
        identityId: input.identityId,
      },
    );
    await db.withTransactionF((tran) =>
      gestaltGraph.setGestaltAction(
        ['identity', [providerId, identityId]],
        action,
        tran,
      ),
    );
    return {};
  }
}

export { GestaltsActionsSetByIdentityHandler };
