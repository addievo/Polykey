import type { DB } from '@matrixai/db';
import type {
  ClientRPCRequestParams,
  ClientRPCResponseResult,
  SetIdentityActionMessage,
} from '../types';
import type { IdentityId, ProviderId } from '../../ids';
import type { GestaltAction } from '../../gestalts/types';
import type GestaltGraph from '../../gestalts/GestaltGraph';
import { UnaryHandler } from '@matrixai/rpc';
import * as ids from '../../ids';
import * as gestaltsUtils from '../../gestalts/utils';
import { validateSync } from '../../validation';
import { matchSync } from '../../utils';

class GestaltsActionsUnsetByIdentity extends UnaryHandler<
  {
    gestaltGraph: GestaltGraph;
    db: DB;
  },
  ClientRPCRequestParams<SetIdentityActionMessage>,
  ClientRPCResponseResult
> {
  public handle = async (
    input: ClientRPCRequestParams<SetIdentityActionMessage>,
  ): Promise<ClientRPCResponseResult> => {
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
          [['action'], () => gestaltsUtils.parseGestaltAction(value)],
          [['providerId'], () => ids.parseProviderId(value)],
          [['identityId'], () => ids.parseIdentityId(value)],
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
      gestaltGraph.unsetGestaltAction(
        ['identity', [providerId, identityId]],
        action,
        tran,
      ),
    );
    return {};
  };
}

export default GestaltsActionsUnsetByIdentity;
