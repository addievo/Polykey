import type { Authenticate } from '../types';
import type { VaultManager } from '../../vaults';
import type * as grpc from '@grpc/grpc-js';
import type * as utilsPB from '../../proto/js/polykey/v1/utils/utils_pb';
import { utils as grpcUtils } from '../../grpc';
import { utils as vaultsUtils } from '../../vaults';
import * as vaultsPB from '../../proto/js/polykey/v1/vaults/vaults_pb';

function vaultsList({
  vaultManager,
  authenticate,
}: {
  vaultManager: VaultManager;
  authenticate: Authenticate;
}) {
  return async (
    call: grpc.ServerWritableStream<utilsPB.EmptyMessage, vaultsPB.List>,
  ): Promise<void> => {
    // Call.on('error', (e) => console.error(e));
    // call.on('close', () => console.log('Got close'));
    // call.on('finish', () => console.log('Got finish'));
    const genWritable = grpcUtils.generatorWritable(call);
    try {
      const metadata = await authenticate(call.metadata);
      call.sendMetadata(metadata);

      const vaults = await vaultManager.listVaults();
      for await (const [vaultName, vaultId] of vaults) {
        const vaultListMessage = new vaultsPB.List();
        vaultListMessage.setVaultName(vaultName);
        vaultListMessage.setVaultId(vaultsUtils.makeVaultIdPretty(vaultId));
        await genWritable.next(((_) => vaultListMessage)());
      }
      await genWritable.next(null);
      return;
    } catch (err) {
      await genWritable.throw(err);
      return;
    }
  };
}

export default vaultsList;
