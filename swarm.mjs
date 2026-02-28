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

const repoArgs = args("--repo");
const defaultRepo = path.resolve(repoArgs[0] || process.cwd());
const count = Math.max(1, Number(arg("--count", "3")) || 3);
const publicPort = Math.max(1, Number(arg("--port", process.env.PORT || "8787")) || 8787);
const host = process.env.HOST || "0.0.0.0";
const relayBasePort = Math.max(1025, Number(arg("--relay-base-port", "9800")) || 9800);
const appServerBasePort = Math.max(1025, Number(arg("--appserver-base-port", "11800")) || 11800);
const staggerMs = Math.max(0, Number(arg("--stagger-ms", "2400")) || 2400);
const restartDelayMs = Math.max(0, Number(arg("--restart-delay-ms", "10000")) || 10000);
const continuous = /^(1|true|yes|on)$/i.test(String(arg("--continuous", "false")));
const prompts = args("--prompt");
const NON_CRITICAL_EMIT_GAP_MS = 850;
const FILE_DELTA_COALESCE_MS = 1000;
const FILE_REGEX = /([\w./-]+\.(?:ts|js|mjs|cjs|jsx|tsx|py|go|java|rs|md|json|yml|yaml|toml|sql))/gi;
const NOISY_METHODS = new Set([
  "codex/event/token_count",
  "thread/tokenusage/updated",
  "account/ratelimits/updated",
  "item/agentmessage/delta",
  "item/commandexecution/outputdelta",
]);
const RELAY_LIFECYCLE_TYPES = new Set([
  "relay.started",
  "appserver.connected",
  "appserver.error",
  "codex.exit",
]);

function repoFor(index) {
  return path.resolve(repoArgs[index] || defaultRepo);
}

const assignedRepos = new Set();
for (let i = 0; i < count; i += 1) {
  assignedRepos.add(repoFor(i));
}

for (const repoPath of assignedRepos) {
  if (!fs.existsSync(repoPath)) {
    console.error(`Repo path does not exist: ${repoPath}`);
    process.exit(1);
  }
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
console.log(`Default repo: ${defaultRepo}`);
if (repoArgs.length > 1) {
  console.log(`Agent repo overrides: ${repoArgs.length}`);
}
console.log(`Agents: ${count}`);
console.log(`Continuous: ${continuous ? "on" : "off"}`);

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

const childrenByAgent = new Map();
const upstreamByAgent = new Map();
const cyclesByAgent = new Map();
const restartTimers = new Set();
const pacingStateByAgent = new Map();
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

function clearTimer(timer, timerSet = restartTimers) {
  if (!timer) return;
  clearTimeout(timer);
  timerSet.delete(timer);
}

function toLower(value) {
  return String(value || "").toLowerCase();
}

function methodOf(event) {
  return toLower(event?.method);
}

function isNoisyMethod(method) {
  if (!method) return false;
  if (NOISY_METHODS.has(method)) return true;
  const isDeltaSuffix = method.endsWith("/delta") || method.endsWith("_delta");
  return isDeltaSuffix && method !== "item/filechange/outputdelta";
}

function isRelayLifecycleEvent(event) {
  return RELAY_LIFECYCLE_TYPES.has(String(event?.type || ""));
}

function eventBlobLower(event) {
  try {
    return JSON.stringify(event).toLowerCase();
  } catch {
    return "";
  }
}

function extractFilePaths(event) {
  const found = new Set();
  const params = event?.params && typeof event.params === "object" ? event.params : {};

  const direct = [
    event?.path,
    event?.file,
    event?.filePath,
    params?.path,
    params?.file,
    params?.filePath,
    params?.item?.path,
    params?.item?.file,
    params?.delta?.path,
    params?.delta?.file,
  ];

  for (const value of direct) {
    if (typeof value === "string" && /\.[a-z0-9]+$/i.test(value)) found.add(value);
  }

  const lists = [
    event?.files,
    event?.paths,
    params?.files,
    params?.paths,
    params?.delta?.files,
    params?.turn?.diff?.files,
    params?.turn?.changedFiles,
  ];

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string" && /\.[a-z0-9]+$/i.test(item)) {
        found.add(item);
      } else if (item && typeof item === "object") {
        if (typeof item.path === "string") found.add(item.path);
        if (typeof item.file === "string") found.add(item.file);
        if (typeof item.filePath === "string") found.add(item.filePath);
      }
    }
  }

  const text = eventBlobLower(event);
  FILE_REGEX.lastIndex = 0;
  let match;
  while ((match = FILE_REGEX.exec(text)) !== null) {
    found.add(match[1]);
  }

  return Array.from(found);
}

function isCriticalNotification(event) {
  const method = methodOf(event);
  if (!method) return false;
  if (method === "turn/started" || method === "turn/completed" || method === "error") return true;

  const blobLower = eventBlobLower(event);
  if (/(approval|approve|awaiting user|needs user input|human input|manual gate|waiting for user|review)/.test(blobLower)) {
    return true;
  }

  if (method === "item/completed") {
    return /(failed|failure|error|declined|aborted|timeout)/.test(blobLower);
  }

  return false;
}

function isFileDeltaMethod(method) {
  return method === "item/filechange/outputdelta" || method === "turn/diff/updated";
}

function getPacingState(agentTag) {
  if (pacingStateByAgent.has(agentTag)) return pacingStateByAgent.get(agentTag);
  const state = {
    lastEmitAt: 0,
    pendingEvent: null,
    pendingEventTimer: null,
    pendingFileTemplate: null,
    pendingFilePaths: new Set(),
    pendingFileTimer: null,
  };
  pacingStateByAgent.set(agentTag, state);
  return state;
}

function clearPacingState(agentTag) {
  const state = pacingStateByAgent.get(agentTag);
  if (!state) return;
  clearTimer(state.pendingEventTimer, restartTimers);
  clearTimer(state.pendingFileTimer, restartTimers);
  pacingStateByAgent.delete(agentTag);
}

function emitNow(agentTag, event) {
  const state = getPacingState(agentTag);
  state.lastEmitAt = Date.now();
  broadcast(event);
}

function schedulePendingEvent(agentTag, state) {
  if (state.pendingEventTimer || !state.pendingEvent) return;
  const elapsed = Date.now() - state.lastEmitAt;
  const delay = Math.max(0, NON_CRITICAL_EMIT_GAP_MS - elapsed);
  const timer = setTimeout(() => {
    restartTimers.delete(timer);
    state.pendingEventTimer = null;
    if (!state.pendingEvent) return;
    const next = state.pendingEvent;
    state.pendingEvent = null;
    emitNow(agentTag, next);
  }, delay);
  state.pendingEventTimer = timer;
  restartTimers.add(timer);
}

function emitPaced(agentTag, event) {
  const state = getPacingState(agentTag);
  const elapsed = Date.now() - state.lastEmitAt;
  if (!state.pendingEvent && elapsed >= NON_CRITICAL_EMIT_GAP_MS) {
    emitNow(agentTag, event);
    return;
  }
  state.pendingEvent = event;
  schedulePendingEvent(agentTag, state);
}

function emitCoalescedFileDelta(agentTag) {
  const state = getPacingState(agentTag);
  if (!state.pendingFileTemplate) return;

  const filePaths = Array.from(state.pendingFilePaths);
  state.pendingFilePaths.clear();
  const template = state.pendingFileTemplate;
  state.pendingFileTemplate = null;

  const out = {
    ...template,
    params: {
      ...(template.params && typeof template.params === "object" ? template.params : {}),
    },
  };

  if (filePaths.length > 0) {
    out.params.files = filePaths;
    if (!out.params.path) out.params.path = filePaths[0];
  }

  emitPaced(agentTag, out);
}

function queueFileDelta(agentTag, event) {
  const state = getPacingState(agentTag);
  state.pendingFileTemplate = event;
  for (const filePath of extractFilePaths(event)) {
    state.pendingFilePaths.add(filePath);
  }
  if (state.pendingFileTimer) return;

  const timer = setTimeout(() => {
    restartTimers.delete(timer);
    state.pendingFileTimer = null;
    emitCoalescedFileDelta(agentTag);
  }, FILE_DELTA_COALESCE_MS);

  state.pendingFileTimer = timer;
  restartTimers.add(timer);
}

function emitCritical(agentTag, event) {
  const state = getPacingState(agentTag);
  state.pendingEvent = null;
  clearTimer(state.pendingEventTimer, restartTimers);
  state.pendingEventTimer = null;
  emitNow(agentTag, event);
}

function shapeAndBroadcast(agentTag, event) {
  const method = methodOf(event);
  if (!method) {
    if (isRelayLifecycleEvent(event)) {
      broadcast(event);
    }
    return;
  }

  if (isNoisyMethod(method)) return;

  if (isFileDeltaMethod(method)) {
    queueFileDelta(agentTag, event);
    return;
  }

  if (isCriticalNotification(event)) {
    emitCritical(agentTag, event);
    return;
  }

  emitPaced(agentTag, event);
}

async function startAgent(index) {
  const agentIndex = index + 1;
  const agentTag = `agent-${agentIndex}`;
  const relayPort = relayBasePort + index;
  const appServerPort = appServerBasePort + index;
  const repoPath = repoFor(index);
  const prompt = promptFor(index);
  const cycle = (cyclesByAgent.get(agentTag) || 0) + 1;
  cyclesByAgent.set(agentTag, cycle);
  clearPacingState(agentTag);

  const previousUpstream = upstreamByAgent.get(agentTag);
  if (previousUpstream) {
    try {
      previousUpstream.close();
    } catch {
      // Ignore close errors.
    }
    upstreamByAgent.delete(agentTag);
  }

  const child = spawn(
    process.execPath,
    [
      "relay.mjs",
      "--repo",
      repoPath,
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

  childrenByAgent.set(agentTag, child);

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
    const current = childrenByAgent.get(agentTag);
    if (current === child) {
      childrenByAgent.delete(agentTag);
    }
    clearPacingState(agentTag);

    broadcast({
      type: "swarm.child.exit",
      ts: Date.now(),
      agent: agentTag,
      cycle,
      code,
      signal: signal || null,
    });

    if (!stopping && continuous) {
      const timer = setTimeout(() => {
        restartTimers.delete(timer);
        if (stopping) return;
        startAgent(index).catch((error) => {
          broadcast({
            type: "swarm.agent.restart_failed",
            ts: Date.now(),
            agent: agentTag,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }, restartDelayMs);

      restartTimers.add(timer);
    }
  });

  const upstream = await connectUpstream(`ws://127.0.0.1:${relayPort}`, agentTag);
  upstreamByAgent.set(agentTag, upstream);

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

    shapeAndBroadcast(agentTag, parsed);
  });

  upstream.on("close", () => {
    clearPacingState(agentTag);
    broadcast({
      type: "swarm.upstream.closed",
      ts: Date.now(),
      agent: agentTag,
      cycle,
      relayPort,
    });

    const current = upstreamByAgent.get(agentTag);
    if (current === upstream) {
      upstreamByAgent.delete(agentTag);
    }
  });

  upstream.on("error", (error) => {
    broadcast({
      type: "swarm.upstream.error",
      ts: Date.now(),
      agent: agentTag,
      cycle,
      relayPort,
      message: error.message,
    });
  });

  broadcast({
    type: "swarm.agent.started",
    ts: Date.now(),
    agent: agentTag,
    cycle,
    repo: repoPath,
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

  for (const timer of restartTimers) {
    clearTimeout(timer);
  }
  restartTimers.clear();

  for (const agentTag of pacingStateByAgent.keys()) {
    clearPacingState(agentTag);
  }

  for (const ws of upstreamByAgent.values()) {
    try {
      ws.close();
    } catch {
      // ignore close errors
    }
  }
  upstreamByAgent.clear();

  for (const child of childrenByAgent.values()) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  childrenByAgent.clear();

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
