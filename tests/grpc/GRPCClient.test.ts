import type * as grpc from '@grpc/grpc-js';
import type { PromiseUnaryCall } from '@/grpc/types';
import type { SessionToken } from '@/sessions/types';
import type { NodeId } from '@/ids/types';
import type { Host, Port } from '@/network/types';
import type { KeyPair, Certificate, CertificatePEMChain } from '@/keys/types';
import type { KeyRing } from '@/keys';
import type { Key } from '@/keys/types';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { DB } from '@matrixai/db';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import Session from '@/sessions/Session';
import SessionManager from '@/sessions/SessionManager';
import * as keysUtils from '@/keys/utils';
import * as grpcErrors from '@/grpc/errors';
import * as clientUtils from '@/client/utils';
import * as utilsPB from '@/proto/js/polykey/v1/utils/utils_pb';
import { timerStart } from '@/utils';
import * as utils from '@/utils';
import * as clientTestUtils from './utils';
import * as testNodesUtils from '../nodes/utils';
import * as testUtils from '../utils';

describe('GRPCClient', () => {
  const logger = new Logger('GRPCClient Test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  /**
   * Shared keys, certificates and GRPC Server for all tests
   */
  let dataDir: string;
  let nodeIdServer: NodeId;
  let server: grpc.Server;
  let port: number;
  let clientKeyPair: KeyPair;
  let clientCert: Certificate;

  let db: DB;
  let sessionManager: SessionManager;

  const generateCertId = keysUtils.createCertIdGenerator();

  beforeAll(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'polykey-test-'),
    );
    const serverKeyPair = keysUtils.generateKeyPair();
    const serverCert = await keysUtils.generateCertificate({
      certId: generateCertId(),
      duration: 31536000,
      issuerPrivateKey: serverKeyPair.privateKey,
      subjectKeyPair: {
        privateKey: serverKeyPair.privateKey,
        publicKey: serverKeyPair.publicKey,
      },
    });
    nodeIdServer = keysUtils.certNodeId(serverCert)!;
    const dbPath = path.join(dataDir, 'db');
    db = await DB.createDB({
      dbPath,
      logger,
      crypto: {
        key: keysUtils.generateKey(),
        ops: {
          encrypt: async (key, plainText) => {
            return keysUtils.encryptWithKey(
              utils.bufferWrap(key) as Key,
              utils.bufferWrap(plainText),
            );
          },
          decrypt: async (key, cipherText) => {
            return keysUtils.decryptWithKey(
              utils.bufferWrap(key) as Key,
              utils.bufferWrap(cipherText),
            );
          },
        },
      },
    });
    const keyRing = {
      getNodeId: () => testNodesUtils.generateRandomNodeId(),
    } as KeyRing; // Cheeky mocking.
    sessionManager = await SessionManager.createSessionManager({
      db,
      keyRing,
      logger,
      expiry: 60000,
    });
    // This has to pass the session manager and the key manager
    const authenticate = clientUtils.authenticator(sessionManager, keyRing);
    [server, port] = await clientTestUtils.openTestServerSecure(
      keysUtils.privateKeyToPEM(serverKeyPair.privateKey),
      keysUtils.certToPEM(serverCert),
      authenticate,
      logger,
    );
    clientKeyPair = keysUtils.generateKeyPair();
    clientCert = await keysUtils.generateCertificate({
      certId: generateCertId(),
      duration: 31536000,
      issuerPrivateKey: clientKeyPair.privateKey,
      subjectKeyPair: {
        privateKey: clientKeyPair.privateKey,
        publicKey: clientKeyPair.publicKey,
      },
    });
  });
  afterAll(async () => {
    setTimeout(() => {
      // Duplex error tests prevents the GRPC server from gracefully shutting down
      // this will force it to shutdown
      logger.info('Test GRPC Server Hanging, Forcing Shutdown');
      clientTestUtils.closeTestServerSecureForce(server);
    }, 2000);
    await clientTestUtils.closeTestServerSecure(server);
    await sessionManager.stop();
    await db.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('starting and stopping the client', async () => {
    const client = await clientTestUtils.GRPCClientTest.createGRPCClientTest({
      nodeId: nodeIdServer,
      host: '127.0.0.1' as Host,
      port: port as Port,
      tlsConfig: {
        keyPrivatePem: keysUtils.privateKeyToPEM(clientKeyPair.privateKey),
        certChainPem: keysUtils.certToPEM(
          clientCert,
        ) as unknown as CertificatePEMChain,
      },
      timer: timerStart(1000),
      logger,
    });
    await client.destroy();
  });
  test('calling unary', async () => {
    const client = await clientTestUtils.GRPCClientTest.createGRPCClientTest({
      nodeId: nodeIdServer,
      host: '127.0.0.1' as Host,
      port: port as Port,
      tlsConfig: {
        keyPrivatePem: keysUtils.privateKeyToPEM(clientKeyPair.privateKey),
        certChainPem: keysUtils.certToPEM(
          clientCert,
        ) as unknown as CertificatePEMChain,
      },
      timer: timerStart(1000),
      logger,
    });
    const m = new utilsPB.EchoMessage();
    m.setChallenge('a98u3e4d');
    const pCall = client.unary(m);
    // Before resolving call, the peer has dns prefix
    expect(pCall.call.getPeer()).toBe(`dns:127.0.0.1:${port}`);
    const m_ = await pCall;
    // After resolving call, it is just plain IP
    expect(pCall.call.getPeer()).toBe(`127.0.0.1:${port}`);
    expect(m_.getChallenge()).toBe(m.getChallenge());
    await client.destroy();
  });
  test('calling unary with session interception', async () => {
    const sessionTokenPath = `${dataDir}/token`;
    // Using initial session token
    const session = await Session.createSession({
      sessionTokenPath,
      sessionToken: 'initialtoken' as SessionToken,
      logger,
    });
    expect(await session.readToken()).toBe('initialtoken');
    // Setting session will trigger the session interceptor
    const client = await clientTestUtils.GRPCClientTest.createGRPCClientTest({
      nodeId: nodeIdServer,
      host: '127.0.0.1' as Host,
      port: port as Port,
      tlsConfig: {
        keyPrivatePem: keysUtils.privateKeyToPEM(clientKeyPair.privateKey),
        certChainPem: keysUtils.certToPEM(
          clientCert,
        ) as unknown as CertificatePEMChain,
      },
      session,
      timer: timerStart(1000),
      logger,
    });
    let pCall: PromiseUnaryCall<utilsPB.EchoMessage>;
    let meta;
    const m1 = new utilsPB.EchoMessage();
    m1.setChallenge('a98u3e4d');
    pCall = client.unary(m1);
    // Leading metadata
    meta = await pCall.meta;
    // Expect reflected session token
    expect(clientUtils.decodeAuthToSession(meta)).toBe('initialtoken-reflect');
    expect(await session.readToken()).toBe('initialtoken-reflect');
    // Leading metadata will be returned even on error
    const m2 = new utilsPB.EchoMessage();
    m2.setChallenge('error');
    pCall = client.unary(m2);
    await testUtils.expectRemoteError(pCall, grpcErrors.ErrorGRPC);
    meta = await pCall.meta;
    // Expect reflected reflected session token
    expect(clientUtils.decodeAuthToSession(meta)).toBe(
      'initialtoken-reflect-reflect',
    );
    expect(await session.readToken()).toBe('initialtoken-reflect-reflect');
    await client.destroy();
    await session.stop();
  });
  test('calling server stream', async () => {
    const client = await clientTestUtils.GRPCClientTest.createGRPCClientTest({
      nodeId: nodeIdServer,
      host: '127.0.0.1' as Host,
      port: port as Port,
      tlsConfig: {
        keyPrivatePem: keysUtils.privateKeyToPEM(clientKeyPair.privateKey),
        certChainPem: keysUtils.certToPEM(
          clientCert,
        ) as unknown as CertificatePEMChain,
      },
      timer: timerStart(1000),
      logger,
    });
    const challenge = 'f9s8d7f4';
    const m = new utilsPB.EchoMessage();
    m.setChallenge(challenge);
    const stream = client.serverStream(m);
    // Before resolving call, the peer has dns prefix
    expect(stream.stream.getPeer()).toBe(`dns:127.0.0.1:${port}`);
    const received: Array<string> = [];
    for await (const m_ of stream) {
      expect(m_.getChallenge()).toBe(m.getChallenge());
      received.push(m_.getChallenge());
    }
    expect(received.length).toBe(challenge.length);
    const result = await stream.next();
    expect(result).toMatchObject({
      value: undefined,
      done: true,
    });
    expect(stream.stream.destroyed).toBe(true);
    // After resolving call, it is just plain IP
    expect(stream.stream.getPeer()).toBe(`127.0.0.1:${port}`);
    await client.destroy();
  });
  test('calling server stream with session interception', async () => {
    const sessionTokenPath = `${dataDir}/token`;
    // Using initial session token
    const session = await Session.createSession({
      sessionTokenPath,
      sessionToken: 'initialtoken' as SessionToken,
      logger,
    });
    // Setting session will trigger the session interceptor
    const client = await clientTestUtils.GRPCClientTest.createGRPCClientTest({
      nodeId: nodeIdServer,
      host: '127.0.0.1' as Host,
      port: port as Port,
      tlsConfig: {
        keyPrivatePem: keysUtils.privateKeyToPEM(clientKeyPair.privateKey),
        certChainPem: keysUtils.certToPEM(
          clientCert,
        ) as unknown as CertificatePEMChain,
      },
      session,
      timer: timerStart(1000),
      logger,
    });
    const challenge = 'f9s8d7f4';
    const m = new utilsPB.EchoMessage();
    m.setChallenge(challenge);
    const stream = client.serverStream(m);
    // Close the stream
    await stream.next(null);
    const meta = await stream.meta;
    // Expect reflected session token
    expect(clientUtils.decodeAuthToSession(meta)).toBe('initialtoken-reflect');
    expect(await session.readToken()).toBe('initialtoken-reflect');
    await client.destroy();
    await session.stop();
  });
  test('calling client stream', async () => {
    const client = await clientTestUtils.GRPCClientTest.createGRPCClientTest({
      nodeId: nodeIdServer,
      host: '127.0.0.1' as Host,
      port: port as Port,
      tlsConfig: {
        keyPrivatePem: keysUtils.privateKeyToPEM(clientKeyPair.privateKey),
        certChainPem: keysUtils.certToPEM(
          clientCert,
        ) as unknown as CertificatePEMChain,
      },
      timer: timerStart(1000),
      logger,
    });
    const [stream, response] = client.clientStream();
    // Before resolving call, the peer has dns prefix
    expect(stream.stream.getPeer()).toBe(`dns:127.0.0.1:${port}`);
    const m = new utilsPB.EchoMessage();
    m.setChallenge('93844113dsdf');
    const count = 5;
    for (let i = 0; i < count; i++) {
      await stream.next(m);
    }
    await stream.next(null);
    const m_ = await response;
    expect(m_.getChallenge().length).toBe(m.getChallenge().length * count);
    // After resolving call, it is just plain IP
    expect(stream.stream.getPeer()).toBe(`127.0.0.1:${port}`);
    expect(stream.stream.destroyed).toBe(true);
    await client.destroy();
  });
  test('calling client stream with session interception', async () => {
    const sessionTokenPath = `${dataDir}/token`;
    // Using initial session token
    const session = await Session.createSession({
      sessionTokenPath,
      sessionToken: 'initialtoken' as SessionToken,
      logger,
    });
    // Setting session will trigger the session interceptor
    const client = await clientTestUtils.GRPCClientTest.createGRPCClientTest({
      nodeId: nodeIdServer,
      host: '127.0.0.1' as Host,
      port: port as Port,
      tlsConfig: {
        keyPrivatePem: keysUtils.privateKeyToPEM(clientKeyPair.privateKey),
        certChainPem: keysUtils.certToPEM(
          clientCert,
        ) as unknown as CertificatePEMChain,
      },
      session,
      timer: timerStart(1000),
      logger,
    });
    const [stream] = client.clientStream();
    // Leading metadata can be acquired before or after closing the stream
    const meta = await stream.meta;
    // Close stream
    await stream.next(null);
    // Expect reflected session token
    expect(clientUtils.decodeAuthToSession(meta)).toBe('initialtoken-reflect');
    expect(await session.readToken()).toBe('initialtoken-reflect');
    await client.destroy();
    await session.stop();
  });
  test('calling duplex stream', async () => {
    const client = await clientTestUtils.GRPCClientTest.createGRPCClientTest({
      nodeId: nodeIdServer,
      host: '127.0.0.1' as Host,
      port: port as Port,
      tlsConfig: {
        keyPrivatePem: keysUtils.privateKeyToPEM(clientKeyPair.privateKey),
        certChainPem: keysUtils.certToPEM(
          clientCert,
        ) as unknown as CertificatePEMChain,
      },
      timer: timerStart(1000),
      logger,
    });
    const stream = client.duplexStream();
    // Before resolving call, the peer has dns prefix
    expect(stream.stream.getPeer()).toBe(`dns:127.0.0.1:${port}`);
    const m = new utilsPB.EchoMessage();
    m.setChallenge('d89f7u983e4d');
    await stream.write(m);
    const m_ = await stream.read();
    expect(m_.done).toBe(false);
    expect(m_.value).toBeInstanceOf(utilsPB.EchoMessage);
    await stream.next(null);
    // After resolving call, it is just plain IP
    expect(stream.stream.getPeer()).toBe(`127.0.0.1:${port}`);
    await client.destroy();
  });
  test('calling duplex stream with session interception', async () => {
    const sessionTokenPath = `${dataDir}/token`;
    // Using initial session token
    const session = await Session.createSession({
      sessionTokenPath,
      sessionToken: 'initialtoken' as SessionToken,
      logger,
    });
    // Setting session will trigger the session interceptor
    const client = await clientTestUtils.GRPCClientTest.createGRPCClientTest({
      nodeId: nodeIdServer,
      host: '127.0.0.1' as Host,
      port: port as Port,
      tlsConfig: {
        keyPrivatePem: keysUtils.privateKeyToPEM(clientKeyPair.privateKey),
        certChainPem: keysUtils.certToPEM(
          clientCert,
        ) as unknown as CertificatePEMChain,
      },
      session,
      timer: timerStart(1000),
      logger,
    });
    const stream = client.duplexStream();
    // Close the duplex stream
    await stream.next(null);
    // Expect reflected session token
    const meta = await stream.meta;
    expect(clientUtils.decodeAuthToSession(meta)).toBe('initialtoken-reflect');
    expect(await session.readToken()).toBe('initialtoken-reflect');
    expect(stream.stream.destroyed).toBe(true);
    await client.destroy();
    await session.stop();
  });
});
