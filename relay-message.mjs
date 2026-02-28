function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function decodeWsPayload(raw) {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");

  if (Array.isArray(raw)) {
    const parts = raw
      .map((item) => {
        if (Buffer.isBuffer(item)) return item;
        if (ArrayBuffer.isView(item)) {
          return Buffer.from(item.buffer, item.byteOffset, item.byteLength);
        }
        if (item instanceof ArrayBuffer) return Buffer.from(item);
        return null;
      })
      .filter(Boolean);
    if (parts.length > 0) {
      return Buffer.concat(parts).toString("utf8");
    }
  }

  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");

  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf8");
  }

  return String(raw);
}

export function parseAppServerPayload(raw) {
  let parsed;
  try {
    parsed = JSON.parse(decodeWsPayload(raw));
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
      raw: String(raw),
    };
  }

  if (!isObject(parsed)) {
    return {
      ok: false,
      reason: "invalid_shape",
      raw: parsed,
    };
  }

  return {
    ok: true,
    message: parsed,
  };
}

export function classifyJsonRpcMessage(message) {
  if (!isObject(message)) return "unknown";

  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const hasMethod = typeof message.method === "string" && message.method.length > 0;
  const hasResult = Object.prototype.hasOwnProperty.call(message, "result");
  const hasError = Object.prototype.hasOwnProperty.call(message, "error");

  if (hasId && !hasMethod) {
    // JSON-RPC response must include exactly one of result or error.
    if ((hasResult && hasError) || (!hasResult && !hasError)) return "unknown";
    return "response";
  }
  if (hasId && hasMethod) return "request";
  if (!hasId && hasMethod) return "notification";
  return "unknown";
}
