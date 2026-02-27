import { spawn } from "node:child_process";
import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import { WebSocketServer } from "ws";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const repo = arg("--repo", process.cwd());
const prompt = arg("--prompt", "Run tests and fix the first failure.");
const port = Number(arg("--port", "8787"));

if (!fs.existsSync(repo)) {
  console.error(`Repo path does not exist: ${repo}`);
  process.exit(1);
}

const wss = new WebSocketServer({ port });
console.log(`WebSocket relay listening on ws://localhost:${port}`);
console.log(`Repo: ${repo}`);
console.log(`Prompt: ${prompt}`);

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

broadcast({ type: "relay.started", ts: Date.now(), repo, prompt });

const codex = spawn("codex", ["exec", "--json", prompt], {
  cwd: path.resolve(repo),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

codex.stdout.setEncoding("utf8");
let stdoutBuffer = "";

codex.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;

  while (true) {
    const lineEnd = stdoutBuffer.indexOf("\n");
    if (lineEnd === -1) break;

    const line = stdoutBuffer.slice(0, lineEnd).trim();
    stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);

    if (!line) continue;

    try {
      const event = JSON.parse(line);
      broadcast(event);
    } catch {
      // Best effort JSONL parsing. Ignore malformed lines.
    }
  }
});

codex.stderr.setEncoding("utf8");
codex.stderr.on("data", (chunk) => {
  broadcast({ type: "codex.stderr", ts: Date.now(), text: String(chunk) });
});

codex.on("error", (error) => {
  broadcast({ type: "codex.error", ts: Date.now(), message: error.message });
});

codex.on("exit", (code) => {
  if (stdoutBuffer.trim()) {
    try {
      const event = JSON.parse(stdoutBuffer.trim());
      broadcast(event);
    } catch {
      // Ignore trailing partial line.
    }
  }

  broadcast({ type: "codex.exit", ts: Date.now(), code });
  console.log(`Codex exited with code ${code}`);
});
