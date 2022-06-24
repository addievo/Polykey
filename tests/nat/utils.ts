import type { ChildProcess } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import process from 'process';
import child_process from 'child_process';
import readline from 'readline';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import * as testBinUtils from '../bin/utils';

type NATType = 'eim' | 'edm' | 'dmz';

/**
 * Veth end for Agent 1
 * Connects to Router 1
 */
const AGENT1_VETH = 'agent1';
/**
 * Veth end for Agent 2
 * Connects to Router 2
 */
const AGENT2_VETH = 'agent2';
/**
 * Internal veth end for Router 1
 * Connects to Agent 1
 */
const ROUTER1_VETH_INT = 'router1-int';
/**
 * External veth end for Router 1
 * Connects to Router 2
 */
const ROUTER1_VETH_EXT = 'router1-ext';
/**
 * Internal veth end for Router 2
 * Connects to Agent 2
 */
const ROUTER2_VETH_INT = 'router2-int';
/**
 * External veth end for Router 2
 * Connects to Router 1
 */
const ROUTER2_VETH_EXT = 'router2-ext';
/**
 * External veth end for Router 1
 * Connects to a seed node
 */
const ROUTER1_VETH_SEED = 'router1-seed';
/**
 * External veth end for Router 2
 * Connects to a seed node
 */
const ROUTER2_VETH_SEED = 'router2-seed';
/**
 * Veth end for a seed node
 * Connects to Router 1
 */
const SEED_VETH_ROUTER1 = 'seed-router1';
/**
 * Veth end for a seed node
 * Connects to Router 2
 */
const SEED_VETH_ROUTER2 = 'seed-router2';

/**
 * Subnet for Agent 1
 */
const AGENT1_HOST = '10.0.0.2';
/**
 * Subnet for Agent 2
 */
const AGENT2_HOST = '10.0.0.2';
/**
 * Subnet for internal communication from Router 1
 * Forwards to Agent 1
 */
const ROUTER1_HOST_INT = '10.0.0.1';
/**
 * Subnet for internal communication from Router 2
 * Forwards to Agent 2
 */
const ROUTER2_HOST_INT = '10.0.0.1';
/**
 * Subnet for external communication from Router 1
 * Forwards to Router 2
 */
const ROUTER1_HOST_EXT = '192.168.0.1';
/**
 * Subnet for external communication from Router 2
 * Forwards to Router 1
 */
const ROUTER2_HOST_EXT = '192.168.0.2';
/**
 * Subnet for external communication from Router 1
 * Forwards to a seed node
 */
const ROUTER1_HOST_SEED = '192.168.0.1';
/**
 * Subnet for external communication from a seed node
 */
const SEED_HOST = '192.168.0.3';
/**
 * Subnet for external communication from Router 2
 * Forwards to a seed node
 */
const ROUTER2_HOST_SEED = '192.168.0.2';

/**
 * Subnet mask
 */
const SUBNET_MASK = '/24';

/**
 * Port on Agent 1
 */
const AGENT1_PORT = '55551';
/**
 * Port on Agent 2
 */
const AGENT2_PORT = '55552';
/**
 * Mapped port for DMZ
 */
const DMZ_PORT = '55555';

/**
 * Formats the command to enter a namespace to run a process inside it
 */
const nsenter = (usrnsPid: number, netnsPid: number) => {
  return [
    '--target',
    usrnsPid.toString(),
    '--user',
    '--preserve-credentials',
    'nsenter',
    '--target',
    netnsPid.toString(),
    '--net',
  ];
};

/**
 * Create a user namespace from which network namespaces can be created without
 * requiring sudo
 */
function createUserNamespace(
  logger: Logger = new Logger(createUserNamespace.name),
): ChildProcess {
  logger.info('unshare --user --map-root-user');
  const subprocess = child_process.spawn(
    'unshare',
    ['--user', '--map-root-user'],
    {
      shell: true,
    },
  );
  const rlErr = readline.createInterface(subprocess.stderr!);
  rlErr.on('line', (l) => {
    // The readline library will trim newlines
    logger.info(l);
  });
  return subprocess;
}

/**
 * Create a network namespace inside a user namespace
 */
function createNetworkNamespace(
  usrnsPid: number,
  logger: Logger = new Logger(createNetworkNamespace.name),
): ChildProcess {
  logger.info(
    `nsenter --target ${usrnsPid.toString()} --user --preserve-credentials unshare --net`,
  );
  const subprocess = child_process.spawn(
    'nsenter',
    [
      '--target',
      usrnsPid.toString(),
      '--user',
      '--preserve-credentials',
      'unshare',
      '--net',
    ],
    { shell: true },
  );
  const rlErr = readline.createInterface(subprocess.stderr!);
  rlErr.on('line', (l) => {
    // The readline library will trim newlines
    logger.info(l);
  });
  return subprocess;
}

/**
 * Set up four network namespaces to allow communication between two agents
 * each behind a router
 * Brings up loopback interfaces, creates and brings up a veth pair
 * between each pair of adjacent namespaces, and adds default routing to allow
 * cross-communication
 */
async function setupNetworkNamespaceInterfaces(
  usrnsPid: number,
  agent1NetnsPid: number,
  router1NetnsPid: number,
  router2NetnsPid: number,
  agent2NetnsPid: number,
  logger: Logger = new Logger(setupNetworkNamespaceInterfaces.name),
) {
  let args: Array<string> = [];
  try {
    // Bring up loopback
    args = [
      ...nsenter(usrnsPid, agent1NetnsPid),
      'ip',
      'link',
      'set',
      'lo',
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'link',
      'set',
      'lo',
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'link',
      'set',
      'lo',
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, agent2NetnsPid),
      'ip',
      'link',
      'set',
      'lo',
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Create veth pair to link the namespaces
    args = [
      ...nsenter(usrnsPid, agent1NetnsPid),
      'ip',
      'link',
      'add',
      AGENT1_VETH,
      'type',
      'veth',
      'peer',
      'name',
      ROUTER1_VETH_INT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'link',
      'add',
      ROUTER1_VETH_EXT,
      'type',
      'veth',
      'peer',
      'name',
      ROUTER2_VETH_EXT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'link',
      'add',
      ROUTER2_VETH_INT,
      'type',
      'veth',
      'peer',
      'name',
      AGENT2_VETH,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Link up the ends to the correct namespaces
    args = [
      ...nsenter(usrnsPid, agent1NetnsPid),
      'ip',
      'link',
      'set',
      'dev',
      ROUTER1_VETH_INT,
      'netns',
      router1NetnsPid.toString(),
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'link',
      'set',
      'dev',
      ROUTER2_VETH_EXT,
      'netns',
      router2NetnsPid.toString(),
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'link',
      'set',
      'dev',
      AGENT2_VETH,
      'netns',
      agent2NetnsPid.toString(),
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Bring up each end
    args = [
      ...nsenter(usrnsPid, agent1NetnsPid),
      'ip',
      'link',
      'set',
      AGENT1_VETH,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'link',
      'set',
      ROUTER1_VETH_INT,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'link',
      'set',
      ROUTER1_VETH_EXT,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'link',
      'set',
      ROUTER2_VETH_EXT,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'link',
      'set',
      ROUTER2_VETH_INT,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, agent2NetnsPid),
      'ip',
      'link',
      'set',
      AGENT2_VETH,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Assign ip addresses to each end
    args = [
      ...nsenter(usrnsPid, agent1NetnsPid),
      'ip',
      'addr',
      'add',
      `${AGENT1_HOST}${SUBNET_MASK}`,
      'dev',
      AGENT1_VETH,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'addr',
      'add',
      `${ROUTER1_HOST_INT}${SUBNET_MASK}`,
      'dev',
      ROUTER1_VETH_INT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'addr',
      'add',
      `${ROUTER1_HOST_EXT}${SUBNET_MASK}`,
      'dev',
      ROUTER1_VETH_EXT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'addr',
      'add',
      `${ROUTER2_HOST_EXT}${SUBNET_MASK}`,
      'dev',
      ROUTER2_VETH_EXT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'addr',
      'add',
      `${ROUTER2_HOST_INT}${SUBNET_MASK}`,
      'dev',
      ROUTER2_VETH_INT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, agent2NetnsPid),
      'ip',
      'addr',
      'add',
      `${AGENT2_HOST}${SUBNET_MASK}`,
      'dev',
      AGENT2_VETH,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Add default routing
    args = [
      ...nsenter(usrnsPid, agent1NetnsPid),
      'ip',
      'route',
      'add',
      'default',
      'via',
      ROUTER1_HOST_INT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'route',
      'add',
      'default',
      'via',
      ROUTER2_HOST_EXT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'route',
      'add',
      'default',
      'via',
      ROUTER1_HOST_EXT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, agent2NetnsPid),
      'ip',
      'route',
      'add',
      'default',
      'via',
      ROUTER2_HOST_INT,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
  } catch (e) {
    logger.error(e.message);
  }
}

/**
 * Set up four network namespaces to allow communication between two agents
 * each behind a router
 * Brings up loopback interfaces, creates and brings up a veth pair
 * between each pair of adjacent namespaces, and adds default routing to allow
 * cross-communication
 */
async function setupSeedNamespaceInterfaces(
  usrnsPid: number,
  seedNetnsPid: number,
  router1NetnsPid: number,
  router2NetnsPid: number,
  logger: Logger = new Logger(setupSeedNamespaceInterfaces.name),
) {
  let args: Array<string> = [];
  try {
    // Bring up loopback
    args = [
      ...nsenter(usrnsPid, seedNetnsPid),
      'ip',
      'link',
      'set',
      'lo',
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Create veth pairs to link the namespaces
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'link',
      'add',
      ROUTER1_VETH_SEED,
      'type',
      'veth',
      'peer',
      'name',
      SEED_VETH_ROUTER1,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'link',
      'add',
      ROUTER2_VETH_SEED,
      'type',
      'veth',
      'peer',
      'name',
      SEED_VETH_ROUTER2,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Move seed ends into seed network namespace
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'link',
      'set',
      'dev',
      SEED_VETH_ROUTER1,
      'netns',
      seedNetnsPid.toString(),
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'link',
      'set',
      'dev',
      SEED_VETH_ROUTER2,
      'netns',
      seedNetnsPid.toString(),
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Bring up each end
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'link',
      'set',
      ROUTER1_VETH_SEED,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, seedNetnsPid),
      'ip',
      'link',
      'set',
      SEED_VETH_ROUTER1,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, seedNetnsPid),
      'ip',
      'link',
      'set',
      SEED_VETH_ROUTER2,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'link',
      'set',
      ROUTER2_VETH_SEED,
      'up',
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Assign ip addresses to each end
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'addr',
      'add',
      `${ROUTER1_HOST_SEED}${SUBNET_MASK}`,
      'dev',
      ROUTER1_VETH_SEED,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, seedNetnsPid),
      'ip',
      'addr',
      'add',
      `${SEED_HOST}${SUBNET_MASK}`,
      'dev',
      SEED_VETH_ROUTER1,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, seedNetnsPid),
      'ip',
      'addr',
      'add',
      `${SEED_HOST}${SUBNET_MASK}`,
      'dev',
      SEED_VETH_ROUTER2,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'addr',
      'add',
      `${ROUTER2_HOST_SEED}${SUBNET_MASK}`,
      'dev',
      ROUTER2_VETH_SEED,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    // Add default routing
    args = [
      ...nsenter(usrnsPid, router1NetnsPid),
      'ip',
      'route',
      'add',
      SEED_HOST,
      'dev',
      ROUTER1_VETH_SEED,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, router2NetnsPid),
      'ip',
      'route',
      'add',
      SEED_HOST,
      'dev',
      ROUTER2_VETH_SEED,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, seedNetnsPid),
      'ip',
      'route',
      'add',
      ROUTER1_HOST_SEED,
      'dev',
      SEED_VETH_ROUTER1,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
    args = [
      ...nsenter(usrnsPid, seedNetnsPid),
      'ip',
      'route',
      'add',
      ROUTER2_HOST_SEED,
      'dev',
      SEED_VETH_ROUTER2,
    ];
    logger.info(['nsenter', ...args].join(' '));
    await testBinUtils.exec('nsenter', args);
  } catch (e) {
    logger.error(e.message);
  }
}

/**
 * Runs pk command through subprocess inside a network namespace
 * This is used when a subprocess functionality needs to be used
 * This is intended for terminating subprocesses
 * Both stdout and stderr are the entire output including newlines
 * @param env Augments env for command execution
 * @param cwd Defaults to temporary directory
 */
async function pkExecNs(
  usrnsPid: number,
  netnsPid: number,
  args: Array<string> = [],
  env: Record<string, string | undefined> = {},
  cwd?: string,
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  cwd =
    cwd ?? (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'polykey-test-')));
  env = {
    ...process.env,
    ...env,
  };
  // Recall that we attempt to connect to all specified seed nodes on agent start.
  // Therefore, for testing purposes only, we default the seed nodes as empty
  // (if not defined in the env) to ensure no attempted connections. A regular
  // PolykeyAgent is expected to initially connect to the mainnet seed nodes
  env['PK_SEED_NODES'] = env['PK_SEED_NODES'] ?? '';
  const tsConfigPath = path.resolve(
    path.join(global.projectDir, 'tsconfig.json'),
  );
  const tsConfigPathsRegisterPath = path.resolve(
    path.join(global.projectDir, 'node_modules/tsconfig-paths/register'),
  );
  const polykeyPath = path.resolve(
    path.join(global.projectDir, 'src/bin/polykey.ts'),
  );
  return new Promise((resolve, reject) => {
    child_process.execFile(
      'nsenter',
      [
        ...nsenter(usrnsPid, netnsPid),
        'ts-node',
        '--project',
        tsConfigPath,
        '--require',
        tsConfigPathsRegisterPath,
        '--compiler',
        'typescript-cached-transpile',
        '--transpile-only',
        polykeyPath,
        ...args,
      ],
      {
        env,
        cwd,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error != null && error.code === undefined) {
          // This can only happen when the command is killed
          return reject(error);
        } else {
          // Success and Unsuccessful exits are valid here
          return resolve({
            exitCode: error && error.code != null ? error.code : 0,
            stdout,
            stderr,
          });
        }
      },
    );
  });
}

/**
 * Launch pk command through subprocess inside a network namespace
 * This is used when a subprocess functionality needs to be used
 * This is intended for non-terminating subprocesses
 * @param env Augments env for command execution
 * @param cwd Defaults to temporary directory
 */
async function pkSpawnNs(
  usrnsPid: number,
  netnsPid: number,
  args: Array<string> = [],
  env: Record<string, string | undefined> = {},
  cwd?: string,
  logger: Logger = new Logger(pkSpawnNs.name),
): Promise<ChildProcess> {
  cwd =
    cwd ?? (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'polykey-test-')));
  env = {
    ...process.env,
    ...env,
  };
  // Recall that we attempt to connect to all specified seed nodes on agent start.
  // Therefore, for testing purposes only, we default the seed nodes as empty
  // (if not defined in the env) to ensure no attempted connections. A regular
  // PolykeyAgent is expected to initially connect to the mainnet seed nodes
  env['PK_SEED_NODES'] = env['PK_SEED_NODES'] ?? '';
  const tsConfigPath = path.resolve(
    path.join(global.projectDir, 'tsconfig.json'),
  );
  const tsConfigPathsRegisterPath = path.resolve(
    path.join(global.projectDir, 'node_modules/tsconfig-paths/register'),
  );
  const polykeyPath = path.resolve(
    path.join(global.projectDir, 'src/bin/polykey.ts'),
  );
  const subprocess = child_process.spawn(
    'nsenter',
    [
      ...nsenter(usrnsPid, netnsPid),
      'ts-node',
      '--project',
      tsConfigPath,
      '--require',
      tsConfigPathsRegisterPath,
      '--compiler',
      'typescript-cached-transpile',
      '--transpile-only',
      polykeyPath,
      ...args,
    ],
    {
      env,
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: true,
    },
  );
  const rlErr = readline.createInterface(subprocess.stderr!);
  rlErr.on('line', (l) => {
    // The readline library will trim newlines
    logger.info(l);
  });
  return subprocess;
}

/**
 * Setup routing between an agent and router with no NAT rules
 */
async function setupDMZ(
  usrnsPid: number,
  routerNsPid: number,
  agentIp: string,
  agentPort: string,
  routerExt: string,
  routerExtIp: string,
  logger: Logger = new Logger(setupDMZ.name),
) {
  const postroutingCommand = [
    ...nsenter(usrnsPid, routerNsPid),
    'iptables',
    '--table',
    'nat',
    '--append',
    'POSTROUTING',
    '--protocol',
    'udp',
    '--source',
    `${agentIp}${SUBNET_MASK}`,
    '--out-interface',
    routerExt,
    '--jump',
    'SNAT',
    '--to-source',
    `${routerExtIp}:${DMZ_PORT}`,
  ];
  const preroutingCommand = [
    ...nsenter(usrnsPid, routerNsPid),
    'iptables',
    '--table',
    'nat',
    '--append',
    'PREROUTING',
    '--protocol',
    'udp',
    '--destination-port',
    DMZ_PORT,
    '--in-interface',
    routerExt,
    '--jump',
    'DNAT',
    '--to-destination',
    `${agentIp}:${agentPort}`,
  ];
  try {
    logger.info(['nsenter', ...postroutingCommand].join(' '));
    await testBinUtils.exec('nsenter', postroutingCommand);
    logger.info(['nsenter', ...preroutingCommand].join(' '));
    await testBinUtils.exec('nsenter', preroutingCommand);
  } catch (e) {
    logger.error(e.message);
  }
}

/**
 * Setup Port-Restricted Cone NAT for a namespace (on the router namespace)
 */
async function setupNATEndpointIndependentMapping(
  usrnsPid: number,
  routerNsPid: number,
  agentIp: string,
  routerExt: string,
  routerInt: string,
  logger: Logger = new Logger(setupNATEndpointIndependentMapping.name),
) {
  const natCommand = [
    ...nsenter(usrnsPid, routerNsPid),
    'iptables',
    '--table',
    'nat',
    '--append',
    'POSTROUTING',
    '--protocol',
    'udp',
    '--source',
    `${agentIp}${SUBNET_MASK}`,
    '--out-interface',
    routerExt,
    '--jump',
    'MASQUERADE',
  ];
  const acceptLocalCommand = [
    ...nsenter(usrnsPid, routerNsPid),
    'iptables',
    '--table',
    'filter',
    '--append',
    'INPUT',
    '--in-interface',
    routerInt,
    '--jump',
    'ACCEPT',
  ];
  const acceptEstablishedCommand = [
    ...nsenter(usrnsPid, routerNsPid),
    'iptables',
    '--table',
    'filter',
    '--append',
    'INPUT',
    '--match',
    'conntrack',
    '--ctstate',
    'RELATED,ESTABLISHED',
    '--jump',
    'ACCEPT',
  ];
  const dropCommand = [
    ...nsenter(usrnsPid, routerNsPid),
    'iptables',
    '--table',
    'filter',
    '--append',
    'INPUT',
    '--jump',
    'DROP',
  ];
  try {
    logger.info(['nsenter', ...acceptLocalCommand].join(' '));
    await testBinUtils.exec('nsenter', acceptLocalCommand);
    logger.info(['nsenter', ...acceptEstablishedCommand].join(' '));
    await testBinUtils.exec('nsenter', acceptEstablishedCommand);
    logger.info(['nsenter', ...dropCommand].join(' '));
    await testBinUtils.exec('nsenter', dropCommand);
    logger.info(['nsenter', ...natCommand].join(' '));
    await testBinUtils.exec('nsenter', natCommand);
  } catch (e) {
    logger.error(e.message);
  }
}

/**
 * Setup Symmetric NAT for a namespace (on the router namespace)
 */
async function setupNATEndpointDependentMapping(
  usrnsPid: number,
  routerNsPid: number,
  routerExt: string,
  logger: Logger = new Logger(setupNATEndpointDependentMapping.name),
) {
  const command = [
    ...nsenter(usrnsPid, routerNsPid),
    'iptables',
    '--table',
    'nat',
    '--append',
    'POSTROUTING',
    '--protocol',
    'udp',
    '--out-interface',
    routerExt,
    '--jump',
    'MASQUERADE',
    `--random`,
  ];
  try {
    logger.info(['nsenter', ...command].join(' '));
    await testBinUtils.exec('nsenter', command);
  } catch (e) {
    logger.error(e.message);
  }
}

async function setupNATWithSeedNode(
  agent1NAT: NATType,
  agent2NAT: NATType,
  logger: Logger = new Logger(setupNAT.name, LogLevel.WARN, [
    new StreamHandler(),
  ]),
) {
  const dataDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'polykey-test-'),
  );
  const password = 'password';
  // Create a user namespace containing five network namespaces
  // Two agents, two routers, one seed node
  const usrns = createUserNamespace(logger);
  const seedNetns = createNetworkNamespace(usrns.pid!, logger);
  const agent1Netns = createNetworkNamespace(usrns.pid!, logger);
  const agent2Netns = createNetworkNamespace(usrns.pid!, logger);
  const router1Netns = createNetworkNamespace(usrns.pid!, logger);
  const router2Netns = createNetworkNamespace(usrns.pid!, logger);
  // Apply appropriate NAT rules
  switch (agent1NAT) {
    case 'dmz': {
      await setupDMZ(
        usrns.pid!,
        router1Netns.pid!,
        AGENT1_HOST,
        AGENT1_PORT,
        ROUTER1_VETH_EXT,
        ROUTER1_HOST_EXT,
        logger,
      );
      await setupDMZ(
        usrns.pid!,
        router1Netns.pid!,
        AGENT1_HOST,
        AGENT1_PORT,
        ROUTER1_VETH_SEED,
        ROUTER1_HOST_SEED,
        logger,
      );
      break;
    }
    case 'eim': {
      await setupNATEndpointIndependentMapping(
        usrns.pid!,
        router1Netns.pid!,
        AGENT1_HOST,
        ROUTER1_VETH_EXT,
        ROUTER1_VETH_INT,
        logger,
      );
      await setupNATEndpointIndependentMapping(
        usrns.pid!,
        router1Netns.pid!,
        AGENT1_HOST,
        ROUTER1_VETH_SEED,
        ROUTER1_VETH_INT,
        logger,
      );
      break;
    }
    case 'edm': {
      await setupNATEndpointDependentMapping(
        usrns.pid!,
        router1Netns.pid!,
        ROUTER1_VETH_EXT,
        logger,
      );
      await setupNATEndpointDependentMapping(
        usrns.pid!,
        router1Netns.pid!,
        ROUTER1_VETH_SEED,
        logger,
      );
      break;
    }
  }
  switch (agent2NAT) {
    case 'dmz': {
      await setupDMZ(
        usrns.pid!,
        router2Netns.pid!,
        AGENT2_HOST,
        AGENT2_PORT,
        ROUTER2_VETH_EXT,
        ROUTER2_HOST_EXT,
        logger,
      );
      await setupDMZ(
        usrns.pid!,
        router2Netns.pid!,
        AGENT2_HOST,
        AGENT2_PORT,
        ROUTER2_VETH_SEED,
        ROUTER2_HOST_SEED,
        logger,
      );
      break;
    }
    case 'eim': {
      await setupNATEndpointIndependentMapping(
        usrns.pid!,
        router2Netns.pid!,
        AGENT2_HOST,
        ROUTER2_VETH_EXT,
        ROUTER2_VETH_INT,
        logger,
      );
      await setupNATEndpointIndependentMapping(
        usrns.pid!,
        router2Netns.pid!,
        AGENT2_HOST,
        ROUTER2_VETH_SEED,
        ROUTER2_VETH_INT,
        logger,
      );
      break;
    }
    case 'edm': {
      await setupNATEndpointDependentMapping(
        usrns.pid!,
        router2Netns.pid!,
        ROUTER2_VETH_EXT,
        logger,
      );
      await setupNATEndpointDependentMapping(
        usrns.pid!,
        router2Netns.pid!,
        ROUTER2_VETH_SEED,
        logger,
      );
      break;
    }
  }
  await setupNetworkNamespaceInterfaces(
    usrns.pid!,
    agent1Netns.pid!,
    router1Netns.pid!,
    router2Netns.pid!,
    agent2Netns.pid!,
    logger,
  );
  await setupSeedNamespaceInterfaces(
    usrns.pid!,
    seedNetns.pid!,
    router1Netns.pid!,
    router2Netns.pid!,
    logger,
  );
  const seedNode = await pkSpawnNs(
    usrns.pid!,
    seedNetns.pid!,
    [
      'agent',
      'start',
      '--node-path',
      path.join(dataDir, 'seed'),
      '--root-key-pair-bits',
      '1024',
      '--client-host',
      '127.0.0.1',
      '--proxy-host',
      '0.0.0.0',
      '--connection-timeout',
      '1000',
      '--workers',
      '0',
      '--verbose',
      '--format',
      'json',
    ],
    {
      PK_PASSWORD: password,
    },
    dataDir,
    logger.getChild('seed'),
  );
  const rlOutSeed = readline.createInterface(seedNode.stdout!);
  const stdoutSeed = await new Promise<string>((resolve, reject) => {
    rlOutSeed.once('line', resolve);
    rlOutSeed.once('close', reject);
  });
  const nodeIdSeed = JSON.parse(stdoutSeed).nodeId;
  const proxyPortSeed = JSON.parse(stdoutSeed).proxyPort;
  const agent1 = await pkSpawnNs(
    usrns.pid!,
    agent1Netns.pid!,
    [
      'agent',
      'start',
      '--node-path',
      path.join(dataDir, 'agent1'),
      '--root-key-pair-bits',
      '1024',
      '--client-host',
      '127.0.0.1',
      '--proxy-host',
      `${AGENT1_HOST}`,
      '--proxy-port',
      `${AGENT1_PORT}`,
      '--workers',
      '0',
      '--connection-timeout',
      '1000',
      '--seed-nodes',
      `${nodeIdSeed}@${SEED_HOST}:${proxyPortSeed}`,
      '--verbose',
      '--format',
      'json',
    ],
    {
      PK_PASSWORD: password,
    },
    dataDir,
    logger.getChild('agent1'),
  );
  const rlOutNode1 = readline.createInterface(agent1.stdout!);
  const stdoutNode1 = await new Promise<string>((resolve, reject) => {
    rlOutNode1.once('line', resolve);
    rlOutNode1.once('close', reject);
  });
  const nodeId1 = JSON.parse(stdoutNode1).nodeId;
  const agent2 = await pkSpawnNs(
    usrns.pid!,
    agent2Netns.pid!,
    [
      'agent',
      'start',
      '--node-path',
      path.join(dataDir, 'agent2'),
      '--root-key-pair-bits',
      '1024',
      '--client-host',
      '127.0.0.1',
      '--proxy-host',
      `${AGENT2_HOST}`,
      '--proxy-port',
      `${AGENT2_PORT}`,
      '--workers',
      '0',
      '--connection-timeout',
      '1000',
      '--seed-nodes',
      `${nodeIdSeed}@${SEED_HOST}:${proxyPortSeed}`,
      '--verbose',
      '--format',
      'json',
    ],
    {
      PK_PASSWORD: password,
    },
    dataDir,
    logger.getChild('agent2'),
  );
  const rlOutNode2 = readline.createInterface(agent2.stdout!);
  const stdoutNode2 = await new Promise<string>((resolve, reject) => {
    rlOutNode2.once('line', resolve);
    rlOutNode2.once('close', reject);
  });
  const nodeId2 = JSON.parse(stdoutNode2).nodeId;
  return {
    userPid: usrns.pid,
    agent1Pid: agent1Netns.pid,
    agent2Pid: agent2Netns.pid,
    password,
    dataDir,
    agent1NodePath: path.join(dataDir, 'agent1'),
    agent2NodePath: path.join(dataDir, 'agent2'),
    agent1NodeId: nodeId1,
    agent2NodeId: nodeId2,
    tearDownNAT: async () => {
      agent2.kill('SIGTERM');
      await testBinUtils.processExit(agent2);
      agent1.kill('SIGTERM');
      await testBinUtils.processExit(agent1);
      seedNode.kill('SIGTERM');
      await testBinUtils.processExit(seedNode);
      router2Netns.kill('SIGTERM');
      await testBinUtils.processExit(router2Netns);
      router1Netns.kill('SIGTERM');
      await testBinUtils.processExit(router1Netns);
      agent2Netns.kill('SIGTERM');
      await testBinUtils.processExit(agent2Netns);
      agent1Netns.kill('SIGTERM');
      await testBinUtils.processExit(agent1Netns);
      seedNetns.kill('SIGTERM');
      await testBinUtils.processExit(seedNetns);
      usrns.kill('SIGTERM');
      await testBinUtils.processExit(usrns);
      await fs.promises.rm(dataDir, {
        force: true,
        recursive: true,
      });
    },
  };
}

async function setupNAT(
  agent1NAT: NATType,
  agent2NAT: NATType,
  logger: Logger = new Logger(setupNAT.name, LogLevel.WARN, [
    new StreamHandler(),
  ]),
) {
  const dataDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'polykey-test-'),
  );
  const password = 'password';
  // Create a user namespace containing four network namespaces
  // Two agents and two routers
  const usrns = createUserNamespace(logger);
  const agent1Netns = createNetworkNamespace(usrns.pid!, logger);
  const agent2Netns = createNetworkNamespace(usrns.pid!, logger);
  const router1Netns = createNetworkNamespace(usrns.pid!, logger);
  const router2Netns = createNetworkNamespace(usrns.pid!, logger);
  // Apply appropriate NAT rules
  switch (agent1NAT) {
    case 'dmz': {
      await setupDMZ(
        usrns.pid!,
        router1Netns.pid!,
        AGENT1_HOST,
        AGENT1_PORT,
        ROUTER1_VETH_EXT,
        ROUTER1_HOST_EXT,
        logger,
      );
      break;
    }
    case 'eim': {
      await setupNATEndpointIndependentMapping(
        usrns.pid!,
        router1Netns.pid!,
        AGENT1_HOST,
        ROUTER1_VETH_EXT,
        ROUTER1_VETH_INT,
        logger,
      );
      break;
    }
    case 'edm': {
      await setupNATEndpointDependentMapping(
        usrns.pid!,
        router1Netns.pid!,
        ROUTER1_VETH_EXT,
        logger,
      );
      break;
    }
  }
  switch (agent2NAT) {
    case 'dmz': {
      await setupDMZ(
        usrns.pid!,
        router2Netns.pid!,
        AGENT2_HOST,
        AGENT2_PORT,
        ROUTER2_VETH_EXT,
        ROUTER2_HOST_EXT,
        logger,
      );
      break;
    }
    case 'eim': {
      await setupNATEndpointIndependentMapping(
        usrns.pid!,
        router2Netns.pid!,
        AGENT2_HOST,
        ROUTER2_VETH_EXT,
        ROUTER2_VETH_INT,
        logger,
      );
      break;
    }
    case 'edm': {
      await setupNATEndpointDependentMapping(
        usrns.pid!,
        router2Netns.pid!,
        ROUTER2_VETH_EXT,
        logger,
      );
      break;
    }
  }
  await setupNetworkNamespaceInterfaces(
    usrns.pid!,
    agent1Netns.pid!,
    router1Netns.pid!,
    router2Netns.pid!,
    agent2Netns.pid!,
    logger,
  );
  const agent1 = await pkSpawnNs(
    usrns.pid!,
    agent1Netns.pid!,
    [
      'agent',
      'start',
      '--node-path',
      path.join(dataDir, 'agent1'),
      '--root-key-pair-bits',
      '1024',
      '--client-host',
      '127.0.0.1',
      '--proxy-host',
      `${AGENT1_HOST}`,
      '--proxy-port',
      `${AGENT1_PORT}`,
      '--connection-timeout',
      '1000',
      '--workers',
      '0',
      '--verbose',
      '--format',
      'json',
    ],
    {
      PK_PASSWORD: password,
    },
    dataDir,
    logger.getChild('agent1'),
  );
  const rlOutNode1 = readline.createInterface(agent1.stdout!);
  const stdoutNode1 = await new Promise<string>((resolve, reject) => {
    rlOutNode1.once('line', resolve);
    rlOutNode1.once('close', reject);
  });
  const nodeId1 = JSON.parse(stdoutNode1).nodeId;
  const agent2 = await pkSpawnNs(
    usrns.pid!,
    agent2Netns.pid!,
    [
      'agent',
      'start',
      '--node-path',
      path.join(dataDir, 'agent2'),
      '--root-key-pair-bits',
      '1024',
      '--client-host',
      '127.0.0.1',
      '--proxy-host',
      `${AGENT2_HOST}`,
      '--proxy-port',
      `${AGENT2_PORT}`,
      '--connection-timeout',
      '1000',
      '--workers',
      '0',
      '--verbose',
      '--format',
      'json',
    ],
    {
      PK_PASSWORD: password,
    },
    dataDir,
    logger.getChild('agent2'),
  );
  const rlOutNode2 = readline.createInterface(agent2.stdout!);
  const stdoutNode2 = await new Promise<string>((resolve, reject) => {
    rlOutNode2.once('line', resolve);
    rlOutNode2.once('close', reject);
  });
  const nodeId2 = JSON.parse(stdoutNode2).nodeId;
  return {
    userPid: usrns.pid,
    agent1Pid: agent1Netns.pid,
    agent2Pid: agent2Netns.pid,
    password,
    dataDir,
    agent1NodePath: path.join(dataDir, 'agent1'),
    agent2NodePath: path.join(dataDir, 'agent2'),
    agent1NodeId: nodeId1,
    agent1Host: ROUTER1_HOST_EXT,
    agent1ProxyPort: agent1NAT === 'dmz' ? DMZ_PORT : AGENT1_PORT,
    agent2NodeId: nodeId2,
    agent2Host: ROUTER2_HOST_EXT,
    agent2ProxyPort: agent2NAT === 'dmz' ? DMZ_PORT : AGENT2_PORT,
    tearDownNAT: async () => {
      agent2.kill('SIGTERM');
      await testBinUtils.processExit(agent2);
      agent1.kill('SIGTERM');
      await testBinUtils.processExit(agent1);
      router2Netns.kill('SIGTERM');
      await testBinUtils.processExit(router2Netns);
      router1Netns.kill('SIGTERM');
      await testBinUtils.processExit(router1Netns);
      agent2Netns.kill('SIGTERM');
      await testBinUtils.processExit(agent2Netns);
      agent1Netns.kill('SIGTERM');
      await testBinUtils.processExit(agent1Netns);
      usrns.kill('SIGTERM');
      await testBinUtils.processExit(usrns);
      await fs.promises.rm(dataDir, {
        force: true,
        recursive: true,
      });
    },
  };
}

export {
  createUserNamespace,
  createNetworkNamespace,
  setupNetworkNamespaceInterfaces,
  pkExecNs,
  pkSpawnNs,
  setupNAT,
  setupNATWithSeedNode,
};
