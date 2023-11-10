import type { NodeId, NodeIdString, NodeIdEncoded } from '../ids/types';
import type { Host, Hostname, Port } from '../network/types';

/**
 * Key indicating which space the NodeGraph is in
 */
type NodeGraphSpace = '0' | '1';

/**
 * Node address scopes allows the classification of the address.
 * Local means that the address is locally routable.
 * Global means that the address is globally routable.
 */
type NodeAddressScope = 'local' | 'global';

/**
 * Node address.
 */
type NodeAddress = {
  /**
   * Host can be a host IP address or a hostname string.
   */
  host: Host | Hostname;
  /**
   * Port of the node.
   */
  port: Port;
  /**
   * Scopes can be used to classify the address.
   * Multiple scopes is understood as set-union.
   */
  scopes: Array<NodeAddressScope>;
};

type NodeBucketIndex = number;

type NodeBucket = Array<[NodeId, NodeData]>;

type NodeBucketMeta = {
  count: number;
};

/**
 * This is the record value stored in the NodeGraph.
 */
type NodeData = {
  /**
   * The address of the node.
   */
  address: NodeAddress;
  /**
   * Unix timestamp of when it was last updated.
   */
  lastUpdated: number;
};

type SeedNodes = Record<NodeIdEncoded, NodeAddress>;

enum ConnectionErrorCode {
  ForceClose = 1,
}

enum ConnectionErrorReason {
  ForceClose = 'NodeConnection is forcing destruction',
}

export type {
  NodeId,
  NodeIdString,
  NodeIdEncoded,
  NodeAddressScope,
  NodeAddress,
  SeedNodes,
  NodeBucketIndex,
  NodeBucketMeta,
  NodeBucket,
  NodeData,
  NodeGraphSpace,
};

export { ConnectionErrorCode, ConnectionErrorReason };
