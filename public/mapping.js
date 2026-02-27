const FILE_REGEX = /([\w./-]+\.(?:ts|js|jsx|tsx|py|go|java|rs|md|json|yml|yaml|toml|sql))/gi;

const TYPE_KEYS = ["type", "event", "name", "kind", "status"];
const TIME_KEYS = ["ts", "timestamp", "time", "created_at", "createdAt", "updated_at", "updatedAt"];
const MESSAGE_KEYS = [
  "message",
  "text",
  "error",
  "reason",
  "detail",
  "summary",
  "output",
  "stderr",
];
const TOOL_KEYS = ["tool", "tool_name", "toolName", "name"];
const RUN_KEYS = [
  "run_id",
  "runId",
  "session_id",
  "sessionId",
  "thread_id",
  "threadId",
  "conversation_id",
  "conversationId",
  "trace_id",
  "traceId",
];

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function toLowerText(value) {
  return String(value || "").toLowerCase();
}

function deepPick(obj, keys, maxDepth = 3) {
  if (!obj || typeof obj !== "object" || maxDepth < 0) return null;

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const nested = deepPick(value, keys, maxDepth - 1);
      if (nested !== null) return nested;
    }
  }

  return null;
}

export function getRawEventType(rawEvent) {
  const typed = deepPick(rawEvent, TYPE_KEYS, 2);
  if (typed && typed.trim()) return typed.trim();
  return "unknown";
}

export function getRawEventTimestamp(rawEvent) {
  const picked = deepPick(rawEvent, TIME_KEYS, 2);
  if (!picked) return Date.now();
  const num = Number(picked);
  if (Number.isFinite(num) && num > 0) {
    if (num < 1e11) return Math.floor(num * 1000);
    return Math.floor(num);
  }
  const parsed = Date.parse(String(picked));
  if (Number.isFinite(parsed)) return parsed;
  return Date.now();
}

export function extractRunIdentity(rawEvent) {
  const picked = deepPick(rawEvent, RUN_KEYS, 3);
  if (!picked) return null;
  const cleaned = String(picked).trim();
  return cleaned || null;
}

export function extractMessage(rawEvent) {
  const picked = deepPick(rawEvent, MESSAGE_KEYS, 3);
  if (picked && picked.trim()) return picked.trim();
  return "";
}

function extractToolName(rawEvent, blobLower) {
  const picked = deepPick(rawEvent, TOOL_KEYS, 2);
  if (picked && picked.trim()) return picked.trim();

  if (/\b(read|grep|glob|search|fetch)\b/.test(blobLower)) return "Read";
  if (/\b(write|edit|patch|replace|multi_edit)\b/.test(blobLower)) return "Edit";
  if (/\b(bash|shell|terminal|command|exec)\b/.test(blobLower)) return "Bash";
  return null;
}

export function extractFilePaths(rawEvent) {
  const found = new Set();

  const directCandidates = [
    rawEvent?.path,
    rawEvent?.file,
    rawEvent?.filePath,
    rawEvent?.filepath,
    rawEvent?.target,
    rawEvent?.payload?.path,
    rawEvent?.payload?.file,
    rawEvent?.data?.path,
    rawEvent?.arguments?.path,
  ];

  for (const value of directCandidates) {
    if (typeof value === "string" && /\.[a-z0-9]+$/i.test(value.trim())) {
      found.add(value.trim());
    }
  }

  const listCandidates = [
    rawEvent?.paths,
    rawEvent?.files,
    rawEvent?.payload?.paths,
    rawEvent?.payload?.files,
    rawEvent?.data?.files,
  ];

  for (const list of listCandidates) {
    if (!Array.isArray(list)) continue;
    for (const value of list) {
      if (typeof value === "string" && /\.[a-z0-9]+$/i.test(value.trim())) {
        found.add(value.trim());
      }
    }
  }

  const text = safeStringify(rawEvent);
  FILE_REGEX.lastIndex = 0;
  let match;
  while ((match = FILE_REGEX.exec(text)) !== null) {
    found.add(match[1]);
  }

  return Array.from(found);
}

function makeErrorSignature(message) {
  if (!message) return "error:unknown";
  return message.toLowerCase().replace(/\s+/g, " ").slice(0, 90);
}

export function mapCodexToVizEvents(rawEvent) {
  const ts = getRawEventTimestamp(rawEvent);
  const rawType = getRawEventType(rawEvent);
  const rawTypeLower = toLowerText(rawType);
  const blob = safeStringify(rawEvent);
  const blobLower = blob.toLowerCase();
  const combinedLower = `${rawTypeLower} ${blobLower}`;
  const message = extractMessage(rawEvent);
  const toolName = extractToolName(rawEvent, combinedLower);
  const filePaths = extractFilePaths(rawEvent);

  const derived = [];
  const base = {
    ts,
    rawType,
  };

  if (/(turn\.started|turn_started|step\.started|step_started|run\.started|session\.started|conversation\.started|agent\.started)/.test(rawTypeLower)) {
    derived.push({
      ...base,
      kind: "step.started",
      message: message || "Step started",
    });
  }

  if (/(turn\.ended|turn\.completed|turn\.finished|step\.ended|step\.completed|run\.ended|run\.completed|session\.ended|agent\.completed|finished|done)/.test(rawTypeLower)) {
    derived.push({
      ...base,
      kind: "step.ended",
      message: message || "Step ended",
    });
  }

  if (/(turn\.started|tool|exec|run)/.test(rawTypeLower)) {
    derived.push({
      ...base,
      kind: "tool.activity",
      toolName,
      message: message || rawType,
    });
  }

  if (/(error|failed|failure|exception|fatal|timeout)/.test(combinedLower)) {
    const errorMessage = message || rawType || "Error event";
    derived.push({
      ...base,
      kind: "error",
      message: errorMessage,
      signature: makeErrorSignature(errorMessage),
    });
  }

  if (/(completed|succeeded|passed|success)/.test(combinedLower)) {
    derived.push({
      ...base,
      kind: "success",
      message: message || rawType,
    });
  }

  for (const filePath of filePaths) {
    derived.push({
      ...base,
      kind: "file.changed",
      filePath,
      message: message || rawType,
    });
  }

  if (derived.length === 0) {
    derived.push({
      ...base,
      kind: "note",
      message: message || rawType,
    });
  }

  return derived;
}
