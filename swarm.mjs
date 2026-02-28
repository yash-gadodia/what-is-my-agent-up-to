import { spawn } from "node:child_process";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { WebSocket, WebSocketServer } from "ws";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function args(name) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1]) {
      values.push(process.argv[i + 1]);
    }
  }
  return values;
}

const repo = path.resolve(arg("--repo", process.cwd()));
const count = Math.max(1, Number(arg("--count", "3")) || 3);
const publicPort = Math.max(1, Number(arg("--port", process.env.PORT || "8787")) || 8787);
const host = process.env.HOST || "0.0.0.0";
const relayBasePort = Math.max(1025, Number(arg("--relay-base-port", "9800")) || 9800);
const appServerBasePort = Math.max(1025, Number(arg("--appserver-base-port", "11800")) || 11800);
const staggerMs = Math.max(0, Number(arg("--stagger-ms", "1200")) || 1200);
const prompts = args("--prompt");

if (!fs.existsSync(repo)) {
  console.error(`Repo path does not exist: ${repo}`);
  process.exit(1);
}

const promptDefaults = [
  "Run tests and fix the first failure.",
  "Find one reliability risk and patch it with tests.",
  "Improve performance in one hotspot and explain tradeoffs.",
  "Audit error handling and harden one weak path.",
  "Reduce complexity in one module without changing behavior.",
];

function promptFor(index) {
  if (prompts[index]) return prompts[index];
  return promptDefaults[index % promptDefaults.length];
}

const wss = new WebSocketServer({ port: publicPort, host });
console.log(`Swarm relay listening on ws://${host}:${publicPort}`);
console.log(`Repo: ${repo}`);
console.log(`Agents: ${count}`);

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

const children = [];
const upstreamSockets = [];
let stopping = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectUpstream(url, agentTag, maxAttempts = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const socket = await new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error("Connection timeout"));
        }, 1200);

        const onOpen = () => {
          cleanup();
          resolve(ws);
        };
        const onError = (error) => {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        function cleanup() {
          clearTimeout(timer);
          ws.off("open", onOpen);
          ws.off("error", onError);
        }

        ws.on("open", onOpen);
        ws.on("error", onError);
      });

      return socket;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      await wait(250);
    }
  }

  throw new Error(`Unable to connect to upstream ${agentTag}`);
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function startAgent(index) {
  const agentIndex = index + 1;
  const agentTag = `agent-${agentIndex}`;
  const relayPort = relayBasePort + index;
  const appServerPort = appServerBasePort + index;
  const prompt = promptFor(index);

  const child = spawn(
    process.execPath,
    [
      "relay.mjs",
      "--repo",
      repo,
      "--prompt",
      prompt,
      "--port",
      String(relayPort),
      "--app-server-port",
      String(appServerPort),
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  children.push(child);

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (!text) return;
    broadcast({
      type: "swarm.child.log",
      ts: Date.now(),
      agent: agentTag,
      stream: "stdout",
      text,
    });
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (!text) return;
    broadcast({
      type: "swarm.child.log",
      ts: Date.now(),
      agent: agentTag,
      stream: "stderr",
      text,
    });
  });

  child.on("exit", (code, signal) => {
    broadcast({
      type: "swarm.child.exit",
      ts: Date.now(),
      agent: agentTag,
      code,
      signal: signal || null,
    });
  });

  const upstream = await connectUpstream(`ws://127.0.0.1:${relayPort}`, agentTag);
  upstreamSockets.push(upstream);

  upstream.on("message", (data) => {
    const raw = typeof data === "string" ? data : data.toString("utf8");
    const parsed = safeJson(raw);
    if (!parsed) return;

    parsed.swarm = {
      agent: agentTag,
      relayPort,
      appServerPort,
    };

    if (!parsed.params || typeof parsed.params !== "object") {
      parsed.params = {};
    }

    if (!parsed.params.run_id) {
      parsed.params.run_id = agentTag;
    }

    broadcast(parsed);
  });

  upstream.on("close", () => {
    broadcast({
      type: "swarm.upstream.closed",
      ts: Date.now(),
      agent: agentTag,
      relayPort,
    });
  });

  upstream.on("error", (error) => {
    broadcast({
      type: "swarm.upstream.error",
      ts: Date.now(),
      agent: agentTag,
      relayPort,
      message: error.message,
    });
  });

  broadcast({
    type: "swarm.agent.started",
    ts: Date.now(),
    agent: agentTag,
    relayPort,
    appServerPort,
    prompt,
  });
}

async function startSwarm() {
  for (let i = 0; i < count; i += 1) {
    await startAgent(i);
    if (i < count - 1 && staggerMs > 0) {
      await wait(staggerMs);
    }
  }
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;

  for (const ws of upstreamSockets) {
    try {
      ws.close();
    } catch {
      // ignore close errors
    }
  }

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    wss.close(() => process.exit(code));
  }, 80);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

startSwarm().catch((error) => {
  console.error(`Failed to start swarm: ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});
