import { spawn } from "node:child_process";
import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import { WebSocket, WebSocketServer } from "ws";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const repo = arg("--repo", process.cwd());
const prompt = arg("--prompt", "Run tests and fix the first failure.");
const port = Number(arg("--port", process.env.PORT || "8787"));
const host = process.env.HOST || "0.0.0.0";
const appServerPort = Number(arg("--app-server-port", "8791"));

if (!fs.existsSync(repo)) {
  console.error(`Repo path does not exist: ${repo}`);
  process.exit(1);
}

const resolvedRepo = path.resolve(repo);
const wss = new WebSocketServer({ port, host });

console.log(`WebSocket relay listening on ws://${host}:${port}`);
console.log(`Repo: ${resolvedRepo}`);
console.log(`Prompt: ${prompt}`);
console.log(`App-server endpoint: ws://127.0.0.1:${appServerPort}`);

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastCodexLog(type, stream, chunk) {
  const text = String(chunk || "").trim();
  if (!text) return;
  broadcast({ type, ts: Date.now(), text, stream });
}

let shuttingDown = false;
let turnCompleted = false;
let appServerSocket = null;
let requestIdCounter = 1;
const pendingRequests = new Map();

function failFast(message, details = null) {
  if (shuttingDown) return;

  const payload = {
    type: "appserver.error",
    ts: Date.now(),
    message,
  };

  if (details !== null) {
    payload.details = details;
  }

  broadcast(payload);
  console.error(message);
  gracefulShutdown(1);
}

function clearPendingRequests(errorMessage) {
  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(errorMessage));
  }
  pendingRequests.clear();
}

function gracefulShutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  clearPendingRequests("Relay shutting down");

  if (appServerSocket && appServerSocket.readyState === WebSocket.OPEN) {
    appServerSocket.close();
  }

  if (codex && !codex.killed) {
    codex.kill("SIGTERM");
  }

  broadcast({ type: "codex.exit", ts: Date.now(), code });

  setTimeout(() => {
    wss.close(() => process.exit(code));
  }, 50);
}

function sendJsonRpcRequest(method, params, timeoutMs = 15000) {
  if (!appServerSocket || appServerSocket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("App-server socket is not connected"));
  }

  const id = requestIdCounter;
  requestIdCounter += 1;

  const request = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Timeout waiting for response to ${method}`));
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timer, method });

    try {
      appServerSocket.send(JSON.stringify(request));
    } catch (error) {
      clearTimeout(timer);
      pendingRequests.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function handleAppServerMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    broadcast({
      type: "appserver.error",
      ts: Date.now(),
      message: "Invalid JSON from app-server",
      raw: String(raw),
    });
    return;
  }

  const isResponse = Object.prototype.hasOwnProperty.call(message, "id") && !message.method;
  const isServerRequest = Object.prototype.hasOwnProperty.call(message, "id") && Boolean(message.method);
  const isNotification = !Object.prototype.hasOwnProperty.call(message, "id") && Boolean(message.method);

  if (isResponse) {
    const pending = pendingRequests.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message || `Request ${pending.method} failed`));
      return;
    }

    pending.resolve(message.result);
    return;
  }

  if (isServerRequest) {
    const reply = {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32601,
        message: "Method not supported in non-interactive relay",
      },
    };

    try {
      appServerSocket.send(JSON.stringify(reply));
    } catch {
      // Best effort error reply.
    }

    broadcast({
      type: "appserver.error",
      ts: Date.now(),
      message: `Unsupported server request: ${message.method}`,
    });
    return;
  }

  if (isNotification) {
    broadcast(message);

    if (message.method === "turn/completed") {
      turnCompleted = true;
      gracefulShutdown(0);
    }

    return;
  }

  broadcast({
    type: "appserver.error",
    ts: Date.now(),
    message: "Unknown app-server message shape",
    raw: message,
  });
}

broadcast({
  type: "relay.started",
  ts: Date.now(),
  repo: resolvedRepo,
  prompt,
  mode: "app-server",
  appServerPort,
});

const codex = spawn("codex", ["app-server", "--listen", `ws://127.0.0.1:${appServerPort}`], {
  cwd: resolvedRepo,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

codex.stdout.setEncoding("utf8");
codex.stdout.on("data", (chunk) => {
  broadcastCodexLog("codex.stdout", "stdout", chunk);
});

codex.stderr.setEncoding("utf8");
codex.stderr.on("data", (chunk) => {
  broadcastCodexLog("codex.stderr", "stderr", chunk);
});

codex.on("error", (error) => {
  failFast(`Failed to start codex app-server: ${error.message}`);
});

codex.on("exit", (code) => {
  if (shuttingDown) return;

  broadcast({
    type: "appserver.error",
    ts: Date.now(),
    message: `codex app-server exited unexpectedly with code ${code}`,
  });

  gracefulShutdown(code === 0 ? 1 : code || 1);
});

async function connectToAppServer() {
  const deadline = Date.now() + 10000;
  let lastError = new Error("Unable to connect to app-server websocket");

  while (Date.now() < deadline) {
    try {
      const socket = await new Promise((resolve, reject) => {
        const candidate = new WebSocket(`ws://127.0.0.1:${appServerPort}`);

        const onOpen = () => {
          cleanup();
          resolve(candidate);
        };
        const onError = (error) => {
          cleanup();
          reject(error);
        };
        const timer = setTimeout(() => {
          cleanup();
          candidate.terminate();
          reject(new Error("Timed out connecting attempt"));
        }, 1200);

        function cleanup() {
          clearTimeout(timer);
          candidate.off("open", onOpen);
          candidate.off("error", onError);
        }

        candidate.on("open", onOpen);
        candidate.on("error", onError);
      });

      return socket;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError;
}

async function startSession() {
  try {
    appServerSocket = await connectToAppServer();
  } catch (error) {
    failFast(`Unable to connect to app-server: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  broadcast({
    type: "appserver.connected",
    ts: Date.now(),
    url: `ws://127.0.0.1:${appServerPort}`,
  });

  appServerSocket.on("message", (data) => {
    handleAppServerMessage(typeof data === "string" ? data : data.toString("utf8"));
  });

  appServerSocket.on("close", () => {
    if (shuttingDown) return;
    if (!turnCompleted) {
      failFast("App-server websocket closed before turn completion");
    }
  });

  appServerSocket.on("error", (error) => {
    if (shuttingDown) return;
    failFast(`App-server websocket error: ${error.message}`);
  });

  try {
    await sendJsonRpcRequest("initialize", {
      clientInfo: {
        name: "agent-viz-relay",
        version: "1.0.0",
      },
    });

    const threadStart = await sendJsonRpcRequest("thread/start", {
      cwd: resolvedRepo,
      approvalPolicy: "never",
    });

    const threadId = threadStart?.thread?.id;
    if (!threadId) {
      throw new Error("thread/start response did not include thread.id");
    }

    await sendJsonRpcRequest("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }],
      approvalPolicy: "never",
    });
  } catch (error) {
    failFast(error instanceof Error ? error.message : String(error));
  }
}

process.on("SIGINT", () => gracefulShutdown(0));
process.on("SIGTERM", () => gracefulShutdown(0));

startSession();
