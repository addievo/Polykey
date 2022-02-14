import type * as grpc from '@grpc/grpc-js';
import type { NodeConnectionManager } from '../../nodes';
import type { NodeId } from '../../nodes/types';
import { utils as grpcUtils } from '../../grpc';
import { utils as nodesUtils } from '../../nodes';
import { validateSync, utils as validationUtils } from '../../validation';
import { matchSync } from '../../utils';
import * as nodesPB from '../../proto/js/polykey/v1/nodes/nodes_pb';

/**
 * Retrieves the local nodes (i.e. from the current node) that are closest
 * to some provided node ID.
 */
function nodesClosestLocalNodesGet({
  nodeConnectionManager,
}: {
  nodeConnectionManager: NodeConnectionManager;
}) {
  return async (
    call: grpc.ServerUnaryCall<nodesPB.Node, nodesPB.NodeTable>,
    callback: grpc.sendUnaryData<nodesPB.NodeTable>,
  ): Promise<void> => {
    try {
      const response = new nodesPB.NodeTable();
      const {
        nodeId,
      }: {
        nodeId: NodeId;
      } = validateSync(
        (keyPath, value) => {
          return matchSync(keyPath)(
            [['nodeId'], () => validationUtils.parseNodeId(value)],
            () => value,
          );
        },
        {
          nodeId: call.request.getNodeId(),
        },
      );
      // Get all local nodes that are closest to the target node from the request
      const closestNodes = await nodeConnectionManager.getClosestLocalNodes(
        nodeId,
      );
      for (const node of closestNodes) {
        const addressMessage = new nodesPB.Address();
        addressMessage.setHost(node.address.host);
        addressMessage.setPort(node.address.port);
        // Add the node to the response's map (mapping of node ID -> node address)
        response
          .getNodeTableMap()
          .set(nodesUtils.encodeNodeId(node.id), addressMessage);
      }
      callback(null, response);
      return;
    } catch (e) {
      callback(grpcUtils.fromError(e));
      return;
    }
  };
}

export default nodesClosestLocalNodesGet;
