import type { NodeId, NodeIdString, NodeIdEncoded } from '../ids/types';
import type { Host, Hostname, Port } from '../network/types';
import type { QUICConfig } from '@matrixai/quic';

/**
 * Key indicating which space the NodeGraph is in
 */
type NodeGraphSpace = '0' | '1';

type NodeAddress = {
  host: Host | Hostname;
  port: Port;
};

type NodeBucketIndex = number;

type NodeBucket = Array<[NodeId, NodeData]>;

type NodeBucketMeta = {
  count: number;
};

type NodeData = {
  address: NodeAddress;
  lastUpdated: number;
};

type SeedNodes = Record<NodeIdEncoded, NodeAddress>;

/**
 * These are the config options we pass to the quic system.
 * It is re-defined here to only expose the options we want to propagate.
 * Other parameters are provided via the internal logic.
 */
type QUICClientConfig = {
  cert: string;
  key: string;
  // Optionals
  maxIdleTimeout?: number;
  keepaliveIntervalTime?: number;
  // Handled via internal logic
  ca?: never;
  verifyPeer?: never;
  verifyAllowFail?: never;
} & Partial<QUICConfig>;

export type {
  NodeId,
  NodeIdString,
  NodeIdEncoded,
  NodeAddress,
  SeedNodes,
  NodeBucketIndex,
  NodeBucketMeta,
  NodeBucket,
  NodeData,
  NodeGraphSpace,
  QUICClientConfig,
};
