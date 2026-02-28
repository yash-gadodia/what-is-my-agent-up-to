import test from "node:test";
import assert from "node:assert/strict";

import { classifyJsonRpcMessage, decodeWsPayload, parseAppServerPayload } from "../relay-message.mjs";

test("decodeWsPayload handles ws RawData variants", () => {
  const json = '{"jsonrpc":"2.0","method":"turn/completed"}';
  const asBuffer = Buffer.from(json, "utf8");
  const asArrayBuffer = asBuffer.buffer.slice(asBuffer.byteOffset, asBuffer.byteOffset + asBuffer.byteLength);
  const asChunkList = [Buffer.from('{"jsonrpc":"2.0",'), Buffer.from('"method":"turn/completed"}')];

  assert.equal(decodeWsPayload(json), json);
  assert.equal(decodeWsPayload(asBuffer), json);
  assert.equal(decodeWsPayload(asArrayBuffer), json);
  assert.equal(decodeWsPayload(asChunkList), json);
});

test("parseAppServerPayload returns invalid_json for unparsable payload", () => {
  const result = parseAppServerPayload("{not-json");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_json");
});

test("parseAppServerPayload returns invalid_shape for non-object JSON", () => {
  const values = ["null", "[]", '"text"', "123"];
  for (const value of values) {
    const result = parseAppServerPayload(value);
    assert.equal(result.ok, false, `expected invalid shape for ${value}`);
    assert.equal(result.reason, "invalid_shape");
  }
});

test("parseAppServerPayload accepts JSON object payload", () => {
  const result = parseAppServerPayload('{"jsonrpc":"2.0","method":"turn/completed"}');
  assert.equal(result.ok, true);
  assert.equal(result.message.method, "turn/completed");
  assert.equal(result.messages.length, 1);
});

test("parseAppServerPayload accepts ArrayBuffer and Buffer[] websocket payloads", () => {
  const asBuffer = Buffer.from('{"jsonrpc":"2.0","method":"turn/completed"}', "utf8");
  const asArrayBuffer = asBuffer.buffer.slice(asBuffer.byteOffset, asBuffer.byteOffset + asBuffer.byteLength);
  const asChunkList = [Buffer.from('{"jsonrpc":"2.0",'), Buffer.from('"method":"turn/completed"}')];

  const fromArrayBuffer = parseAppServerPayload(asArrayBuffer);
  assert.equal(fromArrayBuffer.ok, true);
  assert.equal(fromArrayBuffer.message.method, "turn/completed");

  const fromChunkList = parseAppServerPayload(asChunkList);
  assert.equal(fromChunkList.ok, true);
  assert.equal(fromChunkList.message.method, "turn/completed");
});

test("parseAppServerPayload accepts JSON-RPC batch payloads", () => {
  const result = parseAppServerPayload(
    '[{"jsonrpc":"2.0","id":1,"result":{"ok":true}},{"jsonrpc":"2.0","method":"turn/completed"}]'
  );
  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].id, 1);
  assert.equal(result.messages[1].method, "turn/completed");
});

test("parseAppServerPayload rejects batch payloads with non-object entries", () => {
  const result = parseAppServerPayload('[{"jsonrpc":"2.0","method":"turn/completed"},null]');
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_shape");
});

test("classifyJsonRpcMessage detects response/request/notification/unknown", () => {
  assert.equal(classifyJsonRpcMessage({ jsonrpc: "2.0", id: 1, result: {} }), "response");
  assert.equal(classifyJsonRpcMessage({ jsonrpc: "2.0", id: 2, method: "turn/start" }), "request");
  assert.equal(classifyJsonRpcMessage({ jsonrpc: "2.0", method: "turn/completed" }), "notification");
  assert.equal(classifyJsonRpcMessage({ jsonrpc: "2.0" }), "unknown");
});

test("classifyJsonRpcMessage requires jsonrpc 2.0", () => {
  assert.equal(classifyJsonRpcMessage({ id: 1, result: {} }), "unknown");
  assert.equal(classifyJsonRpcMessage({ jsonrpc: "1.0", id: 1, result: {} }), "unknown");
  assert.equal(classifyJsonRpcMessage({ jsonrpc: "2.0", id: 1, result: {}, error: {} }), "unknown");
});
