import type { ReadableWritablePair } from 'stream/web';
import type { JSONValue } from '@/types';
import type { JsonRpcRequest } from '@/RPC/types';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import { testProp, fc } from '@fast-check/jest';
import RPCClient from '@/RPC/RPCClient';
import RPCServer from '@/RPC/RPCServer';
import * as rpcTestUtils from './utils';

describe(`${RPCClient.name}`, () => {
  const logger = new Logger(`${RPCServer.name} Test`, LogLevel.WARN, [
    new StreamHandler(),
  ]);

  const methodName = 'testMethod';
  const specificMessageArb = fc
    .array(rpcTestUtils.jsonRpcRequestArb(), {
      minLength: 5,
    })
    .noShrink();

  testProp('generic duplex caller', [specificMessageArb], async (messages) => {
    const inputStream = rpcTestUtils.jsonRpcStream(messages);
    const [outputResult, outputStream] = rpcTestUtils.streamToArray<Buffer>();
    const streamPair: ReadableWritablePair = {
      readable: inputStream,
      writable: outputStream,
    };
    const rpcClient = await RPCClient.createRPCClient({
      logger,
      quicConnection: {},
    });
    const callerInterface = await rpcClient.duplexStreamCaller<
      JSONValue,
      JSONValue
    >(methodName, { hello: 'world' }, streamPair);
    while (true) {
      const { value, done } = await callerInterface.read();
      if (done) {
        // We have to end the writer otherwise the stream never closes
        await callerInterface.end();
        break;
      }
      await callerInterface.write(value);
    }
    const expectedMessages: Array<JsonRpcRequest> = messages.map((v) => {
      const request: JsonRpcRequest = {
        type: 'JsonRpcRequest',
        jsonrpc: '2.0',
        method: methodName,
        id: null,
        ...(v.params === undefined ? {} : { params: v.params }),
      };
      return request;
    });
    const outputMessages = (await outputResult).map((v) =>
      JSON.parse(v.toString()),
    );
    expect(outputMessages).toStrictEqual(expectedMessages);
  });
  testProp(
    'generic server stream caller',
    [specificMessageArb, fc.jsonValue()],
    async (messages, params) => {
      const inputStream = rpcTestUtils.jsonRpcStream(messages);
      const [outputResult, outputStream] = rpcTestUtils.streamToArray();
      const streamPair: ReadableWritablePair = {
        readable: inputStream,
        writable: outputStream,
      };
      const rpcClient = await RPCClient.createRPCClient({
        logger,
        quicConnection: {},
      });
      const callerInterface = await rpcClient.serverStreamCaller<
        JSONValue,
        JSONValue
      >(methodName, params as JSONValue, {}, streamPair);
      const values: Array<JSONValue> = [];
      for await (const value of callerInterface.outputGenerator) {
        values.push(value);
      }
      const expectedValues = messages.map((v) => v.params);
      expect(values).toStrictEqual(expectedValues);
      expect((await outputResult)[0]?.toString()).toStrictEqual(
        JSON.stringify({
          method: methodName,
          type: 'JsonRpcRequest',
          jsonrpc: '2.0',
          id: null,
          params,
        }),
      );
    },
  );
  testProp(
    'generic client stream caller',
    [rpcTestUtils.jsonRpcRequestArb(), fc.array(fc.jsonValue())],
    async (message, params) => {
      const inputStream = rpcTestUtils.jsonRpcStream([message]);
      const [outputResult, outputStream] = rpcTestUtils.streamToArray<Buffer>();
      const streamPair: ReadableWritablePair = {
        readable: inputStream,
        writable: outputStream,
      };
      const rpcClient = await RPCClient.createRPCClient({
        logger,
        quicConnection: {},
      });
      const callerInterface = await rpcClient.clientStreamCaller<
        JSONValue,
        JSONValue
      >(methodName, {}, streamPair);
      for (const param of params) {
        await callerInterface.write(param as JSONValue);
      }
      await callerInterface.end();
      expect(await callerInterface.result).toStrictEqual(message.params);
      const expectedOutput = params.map((v) =>
        JSON.stringify({
          method: methodName,
          type: 'JsonRpcRequest',
          jsonrpc: '2.0',
          id: null,
          params: v,
        }),
      );
      expect((await outputResult).map((v) => v.toString())).toStrictEqual(
        expectedOutput,
      );
    },
  );
  testProp(
    'generic unary caller',
    [rpcTestUtils.jsonRpcRequestArb(), fc.jsonValue()],
    async (message, params) => {
      const inputStream = rpcTestUtils.jsonRpcStream([message]);
      const [outputResult, outputStream] = rpcTestUtils.streamToArray();
      const streamPair: ReadableWritablePair = {
        readable: inputStream,
        writable: outputStream,
      };
      const rpcClient = await RPCClient.createRPCClient({
        logger,
        quicConnection: {},
      });
      const result = await rpcClient.unaryCaller<JSONValue, JSONValue>(
        methodName,
        params as JSONValue,
        {},
        streamPair,
      );
      expect(result).toStrictEqual(message.params);
      expect((await outputResult)[0]?.toString()).toStrictEqual(
        JSON.stringify({
          method: methodName,
          type: 'JsonRpcRequest',
          jsonrpc: '2.0',
          id: null,
          params: params,
        }),
      );
    },
  );
});
