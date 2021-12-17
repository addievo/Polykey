import type { Authenticate } from '../types';
import * as grpc from '@grpc/grpc-js';
import { utils as grpcUtils } from '../../grpc';
import * as utilsPB from '../../proto/js/polykey/v1/utils/utils_pb';
import * as vaultsPB from '../../proto/js/polykey/v1/vaults/vaults_pb';

function vaultsPull({
  authenticate,
}: {
  authenticate: Authenticate;
}) {
  return async (
    call: grpc.ServerUnaryCall<vaultsPB.Pull, utilsPB.StatusMessage>,
    callback: grpc.sendUnaryData<utilsPB.StatusMessage>,
  ): Promise<void> => {
    const response = new utilsPB.StatusMessage();
    try {
      const metadata = await authenticate(call.metadata);
      call.sendMetadata(metadata);

      const vaultMessage = call.request.getVault();
      if (vaultMessage == null) {
        callback({ code: grpc.status.NOT_FOUND }, null);
        return;
      }
      const nodeMessage = call.request.getNode();
      if (nodeMessage == null) {
        callback({ code: grpc.status.NOT_FOUND }, null);
        return;
      }
      // Vault name
      // const vaultId = await parseVaultInput(vaultMessage, vaultManager);
      // Node id
      // const id = makeNodeId(nodeMessage.getNodeId());

      // Await vaultManager.pullVault(vaultId, id);
      response.setSuccess(true);
      callback(null, response);
      return;
    } catch (err) {
      callback(grpcUtils.fromError(err), null);
      return;
    }
  };
}

export default vaultsPull;
