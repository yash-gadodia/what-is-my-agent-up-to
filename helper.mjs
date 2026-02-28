import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT || "8790");
const host = process.env.HOST || "0.0.0.0";

const state = {
  repoPath: null,
  baselineAt: null,
  baselineStats: new Map(),
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

function withCorsHeaders(headers = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    ...headers,
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, withCorsHeaders({ "content-type": "application/json; charset=utf-8" }));
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let settled = false;

    function cleanup() {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function succeed(payload) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    }

    function onData(chunk) {
      raw += String(chunk);
      if (raw.length > 1024 * 256) {
        fail(new HttpError(413, "Payload too large"));
        req.destroy();
      }
    }

    function onEnd() {
      if (!raw.trim()) {
        succeed({});
        return;
      }
      try {
        succeed(JSON.parse(raw));
      } catch {
        fail(new HttpError(400, "Invalid JSON body"));
      }
    }

    function onAborted() {
      fail(new HttpError(400, "Request body aborted"));
    }

    function onError(error) {
      fail(error);
    }

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("aborted", onAborted);
    req.on("error", onError);
  });
}

function parseNumstat(stdout) {
  const stats = new Map();
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/\t+/);
    if (parts.length < 3) continue;
    const addedRaw = parts[0];
    const deletedRaw = parts[1];
    const filePath = parts.slice(2).join("\t").trim();

    const added = /^\d+$/.test(addedRaw) ? Number(addedRaw) : 0;
    const deleted = /^\d+$/.test(deletedRaw) ? Number(deletedRaw) : 0;
    stats.set(filePath, { added, deleted });
  }

  return stats;
}

async function git(args, cwd) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024 * 2,
  });
  return stdout;
}

async function verifyRepo(repoPath) {
  if (!repoPath || typeof repoPath !== "string") {
    throw new Error("repoPath is required");
  }

  const absolute = path.resolve(repoPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Repo path not found: ${absolute}`);
  }

  const inside = (await git(["rev-parse", "--is-inside-work-tree"], absolute)).trim();
  if (inside !== "true") {
    throw new Error("Not a git repo");
  }

  return absolute;
}

async function readDiffSnapshot(repoPath) {
  const [namesOut, numstatOut, statusOut] = await Promise.all([
    git(["diff", "--name-only"], repoPath),
    git(["diff", "--numstat"], repoPath),
    git(["status", "--porcelain"], repoPath),
  ]);

  const nameSet = new Set(
    namesOut
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );

  for (const line of statusOut.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cleaned = line.trim();
    if (cleaned.startsWith("?? ")) {
      nameSet.add(cleaned.slice(3).trim());
    }
  }

  const numstat = parseNumstat(numstatOut);
  const files = Array.from(nameSet).map((filePath) => {
    const stat = numstat.get(filePath) || { added: 0, deleted: 0 };
    return {
      path: filePath,
      added: stat.added,
      deleted: stat.deleted,
    };
  });

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    statsMap: new Map(files.map((file) => [file.path, `${file.added}:${file.deleted}`])),
  };
}

function withBaselineFlag(files) {
  return files.map((file) => {
    const baselineValue = state.baselineStats.get(file.path);
    const currentValue = `${file.added}:${file.deleted}`;
    return {
      ...file,
      sinceBaseline: baselineValue !== currentValue,
    };
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, withCorsHeaders());
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${port}`}`);

  try {
    if (req.method === "POST" && url.pathname === "/api/setRepo") {
      const body = await parseJsonBody(req);
      const repoPath = await verifyRepo(body.repoPath);
      const snapshot = await readDiffSnapshot(repoPath);

      state.repoPath = repoPath;
      state.baselineAt = Date.now();
      state.baselineStats = snapshot.statsMap;

      sendJson(res, 200, {
        ok: true,
        repoPath,
        baselineAt: state.baselineAt,
        baselineFiles: snapshot.files.length,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/diff") {
      if (!state.repoPath) {
        sendJson(res, 400, {
          ok: false,
          error: "Repo not set. Call POST /api/setRepo first.",
        });
        return;
      }

      const snapshot = await readDiffSnapshot(state.repoPath);
      const files = withBaselineFlag(snapshot.files);

      sendJson(res, 200, {
        ok: true,
        repoPath: state.repoPath,
        baselineAt: state.baselineAt,
        changedFiles: files.length,
        files,
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    sendJson(res, statusCode, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`Diff helper listening on http://${host}:${port}`);
});
