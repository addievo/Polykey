import type * as grpc from '@grpc/grpc-js';
import type PolykeyAgent from '../PolykeyAgent';
import type { KeyManager } from '../keys';
import type { VaultManager } from '../vaults';
import type { NodeManager } from '../nodes';
import type { IdentitiesManager } from '../identities';
import type { GestaltGraph } from '../gestalts';
import type { SessionManager } from '../sessions';
import type { NotificationsManager } from '../notifications';
import type { Discovery } from '../discovery';
import type { Sigchain } from '../sigchain';
import type { GRPCServer } from '../grpc';
import type { ForwardProxy, ReverseProxy } from '../network';
import type { FileSystem } from '../types';
import type { IClientServiceServer } from '../proto/js/polykey/v1/client_service_grpc_pb';
import createStatusRPC from './rpcStatus';
import createSessionsRPC from './rpcSessions';
import createVaultRPC from './rpcVaults';
import createKeysRPC from './rpcKeys';
import createNodesRPC from './rpcNodes';
import createGestaltRPC from './rpcGestalts';
import createIdentitiesRPC from './rpcIdentities';
import createNotificationsRPC from './rpcNotifications';
import * as clientUtils from './utils';
import * as grpcUtils from '../grpc/utils';
import * as utilsPB from '../proto/js/polykey/v1/utils/utils_pb';
import { ClientServiceService } from '../proto/js/polykey/v1/client_service_grpc_pb';

/**
 * Creates the client service for use with a GRPCServer
 * @param domains An object representing all the domains / managers the client server uses.
 * @returns an IClientServer object
 */
function createClientService({
  polykeyAgent,
  keyManager,
  vaultManager,
  nodeManager,
  identitiesManager,
  gestaltGraph,
  sessionManager,
  notificationsManager,
  discovery,
  sigchain,
  grpcServerClient,
  grpcServerAgent,
  fwdProxy,
  revProxy,
  fs,
}: {
  polykeyAgent: PolykeyAgent;
  keyManager: KeyManager;
  vaultManager: VaultManager;
  nodeManager: NodeManager;
  identitiesManager: IdentitiesManager;
  gestaltGraph: GestaltGraph;
  sessionManager: SessionManager;
  notificationsManager: NotificationsManager;
  discovery: Discovery;
  sigchain: Sigchain;
  grpcServerClient: GRPCServer;
  grpcServerAgent: GRPCServer;
  fwdProxy: ForwardProxy;
  revProxy: ReverseProxy;
  fs: FileSystem;
}) {
  const authenticate = clientUtils.authenticator(sessionManager, keyManager);
  const clientService: IClientServiceServer = {
    ...createStatusRPC({
      authenticate,
      keyManager,
      grpcServerClient,
      grpcServerAgent,
      fwdProxy,
      revProxy,
    }),
    ...createSessionsRPC({
      authenticate,
      sessionManager,
    }),
    ...createVaultRPC({
      vaultManager,
      authenticate,
      fs,
    }),
    ...createKeysRPC({
      keyManager,
      nodeManager,
      authenticate,
      fwdProxy,
      revProxy,
      grpcServerClient,
    }),
    ...createIdentitiesRPC({
      identitiesManager,
      sigchain,
      nodeManager,
      authenticate,
    }),
    ...createGestaltRPC({
      gestaltGraph,
      authenticate,
      discovery,
    }),
    ...createNodesRPC({
      nodeManager,
      notificationsManager,
      authenticate,
    }),
    ...createNotificationsRPC({
      notificationsManager,
      authenticate,
    }),
    agentStop: async (
      call: grpc.ServerUnaryCall<utilsPB.EmptyMessage, utilsPB.EmptyMessage>,
      callback: grpc.sendUnaryData<utilsPB.EmptyMessage>,
    ): Promise<void> => {
      const response = new utilsPB.EmptyMessage();
      if (!polykeyAgent.running) {
        callback(null, response);
        return;
      }
      try {
        const metadata = await authenticate(call.metadata);
        call.sendMetadata(metadata);
        // Respond first to close the GRPC connection
        callback(null, response);
      } catch (err) {
        callback(grpcUtils.fromError(err), null);
        return;
      }
      // Stop is called after GRPC resources are cleared
      await polykeyAgent.stop();
      return;
    },
  };

  return clientService;
}

export default createClientService;

export { ClientServiceService };
