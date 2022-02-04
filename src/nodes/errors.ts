import { ErrorPolykey } from '../errors';

class ErrorNodes extends ErrorPolykey {}

class ErrorNodeManagerRunning extends ErrorNodes {}

class ErrorNodeManagerNotRunning extends ErrorNodes {}

class ErrorNodeManagerDestroyed extends ErrorNodes {}

class ErrorNodeGraphRunning extends ErrorNodes {}

class ErrorNodeGraphNotRunning extends ErrorNodes {}

class ErrorNodeGraphDestroyed extends ErrorNodes {}

// Cannot locate a node through getClosestGlobalNodes

class ErrorNodeGraphNodeNotFound extends ErrorNodes {}

class ErrorNodeGraphNodeIdMissing extends ErrorNodes {}

class ErrorNodeGraphSelfConnect extends ErrorNodes {}

class ErrorNodeGraphEmptyDatabase extends ErrorNodes {}

class ErrorNodeGraphInvalidBucketIndex extends ErrorNodes {}

class ErrorNodeConnectionRunning extends ErrorNodes {}

class ErrorNodeConnectionNotRunning extends ErrorNodes {}
class ErrorNodeGraphOversizedBucket extends ErrorNodes {
  description: 'Bucket invalidly contains more nodes than capacity';
}

class ErrorNodeConnectionDestroyed extends ErrorNodes {}

class ErrorNodeConnectionTimeout extends ErrorNodes {
  description: 'A node connection could not be established (timed out)';
}

class ErrorNodeConnectionNotExist extends ErrorNodes {}

class ErrorNodeConnectionInfoNotExist extends ErrorNodes {}

class ErrorNodeConnectionPublicKeyNotFound extends ErrorNodes {}

export {
  ErrorNodes,
  ErrorNodeManagerRunning,
  ErrorNodeManagerNotRunning,
  ErrorNodeManagerDestroyed,
  ErrorNodeGraphRunning,
  ErrorNodeGraphNotRunning,
  ErrorNodeGraphDestroyed,
  ErrorNodeGraphNodeNotFound,
  ErrorNodeGraphNodeIdMissing,
  ErrorNodeGraphSelfConnect,
  ErrorNodeGraphEmptyDatabase,
  ErrorNodeGraphInvalidBucketIndex,
  ErrorNodeConnectionRunning,
  ErrorNodeConnectionNotRunning,
  ErrorNodeGraphOversizedBucket,
  ErrorNodeConnectionDestroyed,
  ErrorNodeConnectionTimeout,
  ErrorNodeConnectionNotExist,
  ErrorNodeConnectionInfoNotExist,
  ErrorNodeConnectionPublicKeyNotFound,
};
