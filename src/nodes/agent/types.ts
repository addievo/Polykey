import type { JSONObject, JSONRPCParams, JSONRPCResult } from '@matrixai/rpc';
import type { SignedTokenEncoded } from '../../tokens/types';
import type { ClaimIdEncoded, NodeIdEncoded, VaultIdEncoded } from '../../ids';
import type { VaultAction, VaultName } from '../../vaults/types';
import type { SignedNotification } from '../../notifications/types';
import type { JSONValue } from '../../types';

type AgentRPCRequestParams<T extends JSONObject = JSONObject> = {
  metadata?: {
    [Key: string]: JSONValue;
  } & Partial<{
    authorization: string;
  }>;
} & JSONRPCParams<T>;

type AgentRPCResponseResult<T extends JSONObject = JSONObject> = {
  metadata?: {
    [Key: string]: JSONValue;
  } & Partial<{
    authorization: string;
  }>;
} & JSONRPCResult<T>;

type ClaimIdMessage = {
  claimIdEncoded: ClaimIdEncoded;
};

type AgentClaimMessage = Partial<ClaimIdMessage> & {
  signedTokenEncoded: SignedTokenEncoded;
};

type NodeIdMessage = {
  nodeIdEncoded: NodeIdEncoded;
};

type AddressMessage = {
  host: string;
  port: number;
};

type NodeAddressMessage = NodeIdMessage & AddressMessage;

type HolePunchRequestMessage = {
  sourceNodeIdEncoded: NodeIdEncoded;
  targetNodeIdEncoded: NodeIdEncoded;
  address: AddressMessage;
  requestSignature: string;
  relaySignature: string;
};

type HolePunchSignalMessage = {
  targetNodeIdEncoded: NodeIdEncoded;
  signature: string;
};

type SignedNotificationEncoded = {
  signedNotificationEncoded: SignedNotification;
};

type VaultInfo = {
  vaultIdEncoded: VaultIdEncoded;
  vaultName: VaultName;
};

type VaultsScanMessage = VaultInfo & {
  vaultPermissions: Array<VaultAction>;
};

export type {
  AgentRPCRequestParams,
  AgentRPCResponseResult,
  ClaimIdMessage,
  AgentClaimMessage,
  NodeIdMessage,
  AddressMessage,
  NodeAddressMessage,
  HolePunchRequestMessage,
  HolePunchSignalMessage,
  SignedNotificationEncoded,
  VaultInfo,
  VaultsScanMessage,
};
