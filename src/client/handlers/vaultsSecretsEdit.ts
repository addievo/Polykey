import type { DB } from '@matrixai/db';
import type {
  ClientRPCRequestParams,
  ClientRPCResponseResult,
  SecretContentMessage,
  SuccessMessage,
} from '../types';
import type VaultManager from '../../vaults/VaultManager';
import { UnaryHandler } from '@matrixai/rpc';
import * as vaultsUtils from '../../vaults/utils';
import * as vaultsErrors from '../../vaults/errors';
import * as vaultOps from '../../vaults/VaultOps';

class VaultsSecretsEdit extends UnaryHandler<
  {
    vaultManager: VaultManager;
    db: DB;
  },
  ClientRPCRequestParams<SecretContentMessage>,
  ClientRPCResponseResult<SuccessMessage>
> {
  public handle = async (
    input: ClientRPCRequestParams<SecretContentMessage>,
  ): Promise<ClientRPCResponseResult<SuccessMessage>> => {
    const { vaultManager, db } = this.container;
    await db.withTransactionF(async (tran) => {
      const vaultIdFromName = await vaultManager.getVaultId(
        input.nameOrId,
        tran,
      );
      const vaultId =
        vaultIdFromName ?? vaultsUtils.decodeVaultId(input.nameOrId);
      if (vaultId == null) {
        throw new vaultsErrors.ErrorVaultsVaultUndefined();
      }
      const secretContent = Buffer.from(input.secretContent, 'binary');
      await vaultManager.withVaults(
        [vaultId],
        async (vault) => {
          await vaultOps.updateSecret(vault, input.secretName, secretContent);
        },
        tran,
      );
    });
    return {
      success: true,
    };
  };
}

export default VaultsSecretsEdit;
