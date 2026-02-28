const FILE_REGEX = /([\w./-]+\.(?:ts|js|mjs|cjs|jsx|tsx|py|go|java|rs|md|json|yml|yaml|toml|sql))/gi;

const TYPE_KEYS = ["method", "type", "event", "name", "kind", "status"];
const TIME_KEYS = [
  "ts",
  "timestamp",
  "time",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
  "startedAt",
  "completedAt",
];
const MESSAGE_KEYS = [
  "message",
  "text",
  "error",
  "reason",
  "detail",
  "summary",
  "output",
  "stderr",
  "description",
];
const TOOL_KEYS = ["tool", "tool_name", "toolName", "name", "title"];
const SWARM_NOISY_METHODS = new Set([
  "codex/event/token_count",
  "thread/tokenusage/updated",
  "account/ratelimits/updated",
  "item/agentmessage/delta",
  "item/commandexecution/outputdelta",
]);
const RUN_KEYS = [
  "threadId",
  "thread_id",
  "turnId",
  "turn_id",
  "itemId",
  "item_id",
  "run_id",
  "runId",
  "session_id",
  "sessionId",
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
  const typed = deepPick(rawEvent, TYPE_KEYS, 3);
  if (typed && typed.trim()) return typed.trim();
  return "unknown";
}

export function getRawEventTimestamp(rawEvent) {
  const picked = deepPick(rawEvent, TIME_KEYS, 4);
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
  const params = rawEvent?.params && typeof rawEvent.params === "object" ? rawEvent.params : null;

  const preferred = [
    rawEvent?.threadId,
    rawEvent?.thread_id,
    params?.threadId,
    params?.thread_id,
    params?.turnId,
    params?.turn_id,
  ];

  for (const value of preferred) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const picked = deepPick(rawEvent, RUN_KEYS, 4);
  if (!picked) return null;
  const cleaned = String(picked).trim();
  return cleaned || null;
}

export function extractMessage(rawEvent) {
  const picked = deepPick(rawEvent, MESSAGE_KEYS, 4);
  if (picked && picked.trim()) return picked.trim();
  return "";
}

function extractToolName(rawEvent, blobLower) {
  const item = rawEvent?.params?.item;
  const fromItem =
    item?.title || item?.name || item?.toolName || item?.tool || item?.action?.name || item?.action?.type || null;
  if (typeof fromItem === "string" && fromItem.trim()) {
    return fromItem.trim();
  }

  const picked = deepPick(rawEvent, TOOL_KEYS, 3);
  if (picked && picked.trim()) return picked.trim();

  if (/\b(read|grep|glob|search|fetch)\b/.test(blobLower)) return "Read";
  if (/\b(write|edit|patch|replace|multi_edit)\b/.test(blobLower)) return "Edit";
  if (/\b(bash|shell|terminal|command|exec)\b/.test(blobLower)) return "Bash";
  return null;
}

function pushFileIfValid(set, value) {
  if (typeof value === "string" && /\.[a-z0-9]+$/i.test(value.trim())) {
    set.add(value.trim());
  }
}

export function extractFilePaths(rawEvent) {
  const found = new Set();

  const params = rawEvent?.params && typeof rawEvent.params === "object" ? rawEvent.params : {};

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
    params?.path,
    params?.file,
    params?.filePath,
    params?.filepath,
    params?.item?.path,
    params?.item?.file,
    params?.item?.target,
    params?.delta?.path,
    params?.delta?.file,
  ];

  for (const value of directCandidates) {
    pushFileIfValid(found, value);
  }

  const listCandidates = [
    rawEvent?.paths,
    rawEvent?.files,
    rawEvent?.payload?.paths,
    rawEvent?.payload?.files,
    rawEvent?.data?.files,
    params?.paths,
    params?.files,
    params?.delta?.files,
    params?.turn?.diff?.files,
    params?.turn?.changedFiles,
  ];

  for (const list of listCandidates) {
    if (!Array.isArray(list)) continue;
    for (const value of list) {
      if (typeof value === "string") {
        pushFileIfValid(found, value);
        continue;
      }
      if (value && typeof value === "object") {
        pushFileIfValid(found, value.path);
        pushFileIfValid(found, value.file);
        pushFileIfValid(found, value.filePath);
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

function pushFileEvents(derived, base, filePaths, message) {
  for (const filePath of filePaths) {
    derived.push({
      ...base,
      kind: "file.changed",
      filePath,
      message,
    });
  }
}

function isApprovalText(text) {
  return /(approval|approve|awaiting user|needs user input|human input|manual gate|waiting for user|review)/.test(text);
}

function isStallText(text) {
  return /(blocked|on hold|awaiting|waiting for|stalled|no progress|retrying)/.test(text);
}

function attentionMetaFor(kind, text) {
  if (kind === "error" || /(error|failed|failure|exception|fatal|timeout)/.test(text)) {
    return { attentionSeverity: "critical", attentionCode: "error" };
  }
  if (kind === "human.gate" || isApprovalText(text)) {
    return { attentionSeverity: "warn", attentionCode: "approval_required" };
  }
  if (kind === "stall" || isStallText(text)) {
    return { attentionSeverity: "warn", attentionCode: "stalled" };
  }
  return { attentionSeverity: "none", attentionCode: "none" };
}

function decorateDerivedEvent(event) {
  const text = `${event.rawType || ""} ${event.message || ""}`.toLowerCase();
  const meta = attentionMetaFor(event.kind, text);
  return {
    ...event,
    attentionSeverity: meta.attentionSeverity,
    attentionCode: meta.attentionCode,
  };
}

function dedupeDerived(events) {
  const out = [];
  const seen = new Set();
  for (const item of events) {
    const key = `${item.kind}|${item.filePath || ""}|${item.toolName || ""}|${item.signature || ""}|${item.message || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function isDiffUpdateMethod(method) {
  return method === "item/filechange/outputdelta" || method === "turn/diff/updated";
}

function isSwarmNoisyMethod(method) {
  if (!method) return false;
  if (SWARM_NOISY_METHODS.has(method)) return true;
  const isDeltaSuffix = method.endsWith("/delta") || method.endsWith("_delta");
  return isDeltaSuffix && method !== "item/filechange/outputdelta";
}

function applyMethodRules(context) {
  const {
    method,
    rawEvent,
    rawType,
    message,
    toolName,
    filePaths,
    base,
    push,
    pushErrorEvent,
    derived,
  } = context;

  if (method === "turn/started") {
    push({
      kind: "step.started",
      message: message || "Turn started",
    });
  }

  if (method === "turn/completed") {
    push({
      kind: "step.ended",
      message: message || "Turn completed",
    });
  }

  if (method === "item/started") {
    push({
      kind: "tool.activity",
      toolName,
      message: message || "Item started",
    });
  }

  if (method === "item/completed") {
    const statusBlob = toLowerText(safeStringify(rawEvent?.params?.item || rawEvent?.params || rawEvent));
    if (/(failed|failure|error|declined|aborted|timeout)/.test(statusBlob)) {
      pushErrorEvent(message || "Item failed");
    } else if (/(completed|success|succeeded|passed)/.test(statusBlob)) {
      push({
        kind: "success",
        message: message || "Item completed",
      });
    }
  }

  if (isDiffUpdateMethod(method)) {
    pushFileEvents(derived, base, filePaths, message || rawType);
  }

  if (method === "error") {
    pushErrorEvent(message || rawType || "Error event");
  }
}

function applyRawTypeRules({ rawTypeLower, rawType, message, toolName, push }) {
  if (
    /(turn\.started|turn_started|step\.started|step_started|run\.started|session\.started|conversation\.started|agent\.started)/.test(
      rawTypeLower
    )
  ) {
    push({
      kind: "step.started",
      message: message || "Step started",
    });
  }

  if (
    /(turn\.ended|turn\.completed|turn\.finished|step\.ended|step\.completed|run\.ended|run\.completed|session\.ended|agent\.completed|finished|done)/.test(
      rawTypeLower
    )
  ) {
    push({
      kind: "step.ended",
      message: message || "Step ended",
    });
  }

  if (/(turn\.started|tool|exec|run)/.test(rawTypeLower)) {
    push({
      kind: "tool.activity",
      toolName,
      message: message || rawType,
    });
  }
}

function applyCombinedTextRules(context) {
  const { combinedLower, message, rawType, push, pushErrorEvent } = context;

  if (/(error|failed|failure|exception|fatal|timeout)/.test(combinedLower)) {
    pushErrorEvent(message || rawType || "Error event");
  }

  if (/(completed|succeeded|passed|success)/.test(combinedLower)) {
    push({
      kind: "success",
      message: message || rawType,
    });
  }

  if (isApprovalText(combinedLower)) {
    push({
      kind: "human.gate",
      message: message || "Awaiting approval",
    });
  }

  if (isStallText(combinedLower)) {
    push({
      kind: "stall",
      message: message || "Run appears stalled",
    });
  }
}

export function mapCodexToVizEvents(rawEvent) {
  const ts = getRawEventTimestamp(rawEvent);
  const rawType = getRawEventType(rawEvent);
  const rawTypeLower = toLowerText(rawType);
  const method = toLowerText(rawEvent?.method || "");
  const isSwarmEvent = Boolean(rawEvent?.swarm && typeof rawEvent.swarm === "object");
  if (isSwarmEvent && isSwarmNoisyMethod(method)) {
    return [];
  }
  const blob = safeStringify(rawEvent);
  const blobLower = blob.toLowerCase();
  const combinedLower = `${rawTypeLower} ${method} ${blobLower}`;
  const message = extractMessage(rawEvent);
  const toolName = extractToolName(rawEvent, combinedLower);
  const filePaths = extractFilePaths(rawEvent);

  const derived = [];
  const base = {
    ts,
    rawType,
  };
  const push = (event) => derived.push(decorateDerivedEvent({ ...base, ...event }));
  const pushErrorEvent = (errorMessage) =>
    push({
      kind: "error",
      message: errorMessage,
      signature: makeErrorSignature(errorMessage),
    });

  applyMethodRules({
    method,
    rawEvent,
    rawType,
    message,
    toolName,
    filePaths,
    base,
    push,
    pushErrorEvent,
    derived,
  });

  applyRawTypeRules({ rawTypeLower, rawType, message, toolName, push });

  applyCombinedTextRules({
    combinedLower,
    message,
    rawType,
    push,
    pushErrorEvent,
  });

  if (!isDiffUpdateMethod(method)) {
    pushFileEvents(derived, base, filePaths, message || rawType);
  }

  if (derived.length === 0) {
    push({
      kind: "note",
      message: message || rawType,
    });
  }

  return dedupeDerived(derived);
}
