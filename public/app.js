import {
  mapCodexToVizEvents,
  extractRunIdentity,
  getRawEventTimestamp,
  getRawEventType,
} from "./mapping.js";

const PAGE_QUERY = new URLSearchParams(window.location.search);
const DEFAULT_HOST = window.location.hostname || "localhost";
const DEFAULT_WS_SCHEME = window.location.protocol === "https:" ? "wss" : "ws";
const WS_URL = PAGE_QUERY.get("ws") || `${DEFAULT_WS_SCHEME}://${DEFAULT_HOST}:8787`;
const STORAGE_KEY = "agent-viz-runs-v3";
const SETTINGS_KEY = "agent-viz-settings-v3";
const APP_NAME = "Lorong AI x Codex Mission Room";
const WORLD = { width: 1280, height: 720 };

const PHASE_COLUMNS = [
  { id: "plan", street: "Planning Street", emoji: "🗺", color: "#5f91e6", accent: "#dbe8ff" },
  { id: "execute", street: "Execution Street", emoji: "⚙", color: "#1ca85d", accent: "#d4f6e4" },
  { id: "verify", street: "Verification Street", emoji: "🧪", color: "#d69c1f", accent: "#ffefc4" },
  { id: "report", street: "Reporting Street", emoji: "📝", color: "#4e9cd8", accent: "#d9f0ff" },
];

const PHASE_WEIGHT = {
  plan: 2,
  execute: 4,
  verify: 3,
  report: 2,
  "approval-gate": 5,
};

const ATTENTION_RANK = { none: 0, info: 1, warn: 2, critical: 3 };
const STATUS_ORDER = { active: 0, waiting: 1, "needs-human": 2, done: 3, blocked: 4, loop: 5, failed: 6 };
const CULDESAC_BLOCKERS = new Set(["verify_loop", "tool_fail_loop", "no_progress", "dependency_wait"]);

const STATUS_TOKENS = {
  active: { icon: "▶", className: "state-active", color: "#1aa55a" },
  waiting: { icon: "⏳", className: "state-waiting", color: "#d09218" },
  "needs-human": { icon: "🧍", className: "state-needs-human", color: "#5d7ef6" },
  blocked: { icon: "❗", className: "state-blocked", color: "#d55c45" },
  loop: { icon: "🔁", className: "state-loop", color: "#bf4f3d" },
  failed: { icon: "✖", className: "state-failed", color: "#9d2f2f" },
  done: { icon: "✔", className: "state-done", color: "#517087" },
};

const BLOCKER_ICON = {
  verify_loop: "🔁",
  tool_fail_loop: "⛔",
  no_progress: "💤",
  dependency_wait: "⛓",
  none: "",
};

const LORONG_STREETS = ["Lorong 1", "Lorong 2", "Lorong 3", "Lorong 4", "Lorong 5", "Lorong 6", "Lorong 7", "Lorong 8"];
const CITY_ART = {
  roadBase: { src: "./assets/city/street_tile_4.png", image: null },
  whiteDash: { src: "./assets/city/street_tile_2.png", image: null },
  doubleYellow: { src: "./assets/city/street_tile_2_1.png", image: null },
  crosswalk: { src: "./assets/city/street_tile_1.png", image: null },
  sidewalk: { src: "./assets/city/sidewalk_pattern.png", image: null },
  building06: { src: "./assets/city/building_06.png", image: null },
  building07: { src: "./assets/city/building_07.png", image: null },
  building08: { src: "./assets/city/building_08.png", image: null },
  building09: { src: "./assets/city/building_09.png", image: null },
};
const CITY_BUILDING_KEYS = ["building06", "building07", "building08", "building09"];
const ROTATED_PATTERN_CACHE = new Map();
const CHARACTER_SPRITE_PATHS = [
  "/assets/characters/char_0.png",
  "/assets/characters/char_1.png",
  "/assets/characters/char_2.png",
  "/assets/characters/char_3.png",
  "/assets/characters/char_4.png",
  "/assets/characters/char_5.png",
];
const CHARACTER_SPRITES = {
  images: [],
  warned: false,
};

const canvas = document.getElementById("cityCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const newRunBtnEl = document.getElementById("newRunBtn");
const reconnectBtnEl = document.getElementById("reconnectBtn");
const simPackBtnEl = document.getElementById("simPackBtn");
const simScoldedBtnEl = document.getElementById("simScoldedBtn");
const simLongtaskBtnEl = document.getElementById("simLongtaskBtn");
const simAsleepBtnEl = document.getElementById("simAsleepBtn");
const reducedMotionToggleEl = document.getElementById("reducedMotionToggle");
const colorblindToggleEl = document.getElementById("colorblindToggle");
const tileSizeSelectEl = document.getElementById("tileSizeSelect");

const attentionQueueEl = document.getElementById("attentionQueue");
const agentSearchEl = document.getElementById("agentSearch");
const phaseFilterEl = document.getElementById("phaseFilter");
const statusFilterEl = document.getElementById("statusFilter");
const typeFilterEl = document.getElementById("typeFilter");
const agentTableBodyEl = document.getElementById("agentTableBody");

const summaryRunIdentityEl = document.getElementById("summaryRunIdentity");
const summaryModeEl = document.getElementById("summaryMode");
const summaryConnectionEl = document.getElementById("summaryConnection");
const summaryStatusEl = document.getElementById("summaryStatus");
const summaryRuntimeEl = document.getElementById("summaryRuntime");
const summaryBlockedSinceEl = document.getElementById("summaryBlockedSince");
const summaryFirstAnomalyEl = document.getElementById("summaryFirstAnomaly");
const summaryNeedsAttentionEl = document.getElementById("summaryNeedsAttention");
const summaryStalledEl = document.getElementById("summaryStalled");
const summaryApprovalsEl = document.getElementById("summaryApprovals");
const summaryPrimaryCtaEl = document.getElementById("summaryPrimaryCta");
const summaryRunSimBtnEl = document.getElementById("summaryRunSimBtn");
const topSummaryBarEl = document.getElementById("topSummaryBar");

const mapViewportEl = document.getElementById("mapViewport");
const mapOverlayEl = document.getElementById("mapOverlay");
const runBadgeEl = document.getElementById("runBadge");

const approvalStreetEl = document.getElementById("approvalStreet");
const approvalStreetToggleEl = document.getElementById("approvalStreetToggle");
const approvalStreetBodyEl = document.getElementById("approvalStreetBody");
const approvalCountEl = document.getElementById("approvalCount");
const approveNextBtnEl = document.getElementById("approveNextBtn");
const batchApproveBtnEl = document.getElementById("batchApproveBtn");
const approvalListEl = document.getElementById("approvalList");

const playPauseBtnEl = document.getElementById("playPauseBtn");
const liveViewBtnEl = document.getElementById("liveViewBtn");
const replaySpeedEl = document.getElementById("replaySpeed");
const exportRunBtnEl = document.getElementById("exportRunBtn");
const importRunInputEl = document.getElementById("importRunInput");
const replaySliderEl = document.getElementById("replaySlider");
const replayInfoEl = document.getElementById("replayInfo");

const drawerTitleEl = document.getElementById("drawerTitle");
const drawerTaskEl = document.getElementById("drawerTask");
const drawerLastSuccessEl = document.getElementById("drawerLastSuccess");
const drawerBlockerEl = document.getElementById("drawerBlocker");
const drawerRecommendationsEl = document.getElementById("drawerRecommendations");
const drawerEventsEl = document.getElementById("drawerEvents");
const jumpFirstAnomalyBtnEl = document.getElementById("jumpFirstAnomalyBtn");
const provideInputBtnEl = document.getElementById("provideInputBtn");
const opsTabEl = document.getElementById("opsTab");
const opsTabBadgeEl = document.getElementById("opsTabBadge");
const opsDrawerEl = document.getElementById("opsDrawer");
const opsDrawerCloseEl = document.getElementById("opsDrawerClose");
const opsBackdropEl = document.getElementById("opsBackdrop");
const opsDevtoolsToggleEl = document.getElementById("opsDevtoolsToggle");
const opsDevtoolsPanelEl = document.getElementById("opsDevtoolsPanel");
const agentDrawerEl = document.getElementById("agentDrawer");
const agentDrawerCloseEl = document.getElementById("agentDrawerClose");
const agentDrawerBackdropEl = document.getElementById("agentDrawerBackdrop");
const opsToastEl = document.getElementById("opsToast");

const state = {
  runs: new Map(),
  runOrder: [],
  selectedRunId: null,
  lorongCounter: 1,
  manualRunCounter: 0,
  activeManualRunId: null,
  timelineEventId: 1,
  ws: {
    socket: null,
    status: "connecting",
    attempts: 0,
    reconnectTimer: null,
    manualReconnect: false,
  },
  replay: {
    active: false,
    playing: false,
    sourceRunId: null,
    previewRun: null,
    index: 0,
    speed: 1,
    timer: null,
  },
  ui: {
    selectedAgentRunId: null,
    focusedPhase: "execute",
    reducedMotion: false,
    colorblindPalette: false,
    tileSize: "m",
    queueSearch: "",
    queueFilters: {
      phase: "all",
      status: "all",
      agentType: "all",
    },
    drawerMode: "overview",
    opsDrawerOpen: false,
    agentDrawerOpen: false,
    approvalStreetExpanded: false,
    approvalStreetManual: false,
    opsDevtoolsExpanded: false,
    highlightRunId: null,
    summaryFocusRunId: null,
    criticalToastUntil: 0,
    previousCriticalCount: 0,
    mapDensityMode: false,
    cityArtEnabled: true,
    keyboardFocusIndex: 0,
    actorRects: [],
  },
  simulatorTimers: [],
  persistTimer: null,
};

function nowMs() {
  return Date.now();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(input) {
  let h = 2166136261;
  const text = String(input || "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const sec = Math.floor(ms / 1000);
  const hr = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;
  if (hr > 0) return `${hr}h ${min}m`;
  if (min > 0) return `${min}m ${rem}s`;
  return `${sec}s`;
}

function ageText(ts) {
  if (!ts) return "n/a";
  const diffSec = Math.max(0, Math.floor((nowMs() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image failed to load: ${src}`));
    img.src = src;
  });
}

async function preloadCityArt() {
  const entries = Object.entries(CITY_ART);
  const results = await Promise.allSettled(
    entries.map(async ([key, item]) => {
      const image = await loadImage(item.src);
      return { key, image };
    })
  );
  let failed = false;
  for (const result of results) {
    if (result.status !== "fulfilled") {
      failed = true;
      continue;
    }
    CITY_ART[result.value.key].image = result.value.image;
  }
  if (!failed) return;
  state.ui.cityArtEnabled = false;
  for (let i = 0; i < results.length; i += 1) {
    if (results[i].status === "fulfilled") continue;
    console.error(`[city-art] failed to load ${entries[i][1].src}`);
  }
  console.error("[city-art] using vector street fallback");
}

async function preloadCharacterSprites() {
  const results = await Promise.allSettled(CHARACTER_SPRITE_PATHS.map((src) => loadImage(src)));
  CHARACTER_SPRITES.images = results.filter((item) => item.status === "fulfilled").map((item) => item.value);
  if (CHARACTER_SPRITES.images.length === CHARACTER_SPRITE_PATHS.length) return;
  if (CHARACTER_SPRITES.warned) return;
  CHARACTER_SPRITES.warned = true;
  console.error("[character-sprites] some character sprites failed to load; using fallback silhouette when needed");
}

function deriveConnectionState() {
  const status = String(state.ws.status || "").toLowerCase();
  if (status === "connected") return "connected";
  if (status === "connecting" || status.startsWith("reconnecting")) return "reconnecting";
  return "disconnected";
}

function deriveTopStatus(run) {
  if (!run) return "Paused";
  if (run.operationalStatus === "failed") return "Failed";
  if (run.operationalStatus === "blocked" || run.operationalStatus === "loop") return "Blocked";
  if (run.requiresHumanGate) return "Degraded";
  if (run.operationalStatus === "waiting") return "Paused";
  if (run.operationalStatus === "done") return "Completed";
  if (run.operationalStatus === "active") return "Active";
  return "Paused";
}

function setOpsDrawerOpen(open) {
  state.ui.opsDrawerOpen = Boolean(open);
  opsDrawerEl.classList.toggle("open", state.ui.opsDrawerOpen);
  opsDrawerEl.setAttribute("aria-hidden", String(!state.ui.opsDrawerOpen));
  opsBackdropEl.hidden = !state.ui.opsDrawerOpen;
  opsTabEl.setAttribute("aria-expanded", String(state.ui.opsDrawerOpen));
  if (state.ui.opsDrawerOpen) {
    state.ui.criticalToastUntil = 0;
    opsToastEl.hidden = true;
  }
}

function setAgentDrawerOpen(open) {
  state.ui.agentDrawerOpen = Boolean(open);
  agentDrawerEl.classList.toggle("open", state.ui.agentDrawerOpen);
  agentDrawerEl.setAttribute("aria-hidden", String(!state.ui.agentDrawerOpen));
  agentDrawerBackdropEl.hidden = !state.ui.agentDrawerOpen;
}

function setApprovalStreetExpanded(expanded, options = {}) {
  const manual = Boolean(options.manual);
  state.ui.approvalStreetExpanded = Boolean(expanded);
  if (manual) {
    state.ui.approvalStreetManual = state.ui.approvalStreetExpanded;
  } else if (!state.ui.approvalStreetExpanded) {
    state.ui.approvalStreetManual = false;
  }
  approvalStreetEl.classList.toggle("expanded", state.ui.approvalStreetExpanded);
  approvalStreetEl.classList.toggle("collapsed", !state.ui.approvalStreetExpanded);
  approvalStreetBodyEl.hidden = !state.ui.approvalStreetExpanded;
}

function setOpsDevtoolsExpanded(expanded) {
  state.ui.opsDevtoolsExpanded = Boolean(expanded);
  opsDevtoolsToggleEl.setAttribute("aria-expanded", String(state.ui.opsDevtoolsExpanded));
  opsDevtoolsPanelEl.hidden = !state.ui.opsDevtoolsExpanded;
}

function showOpsToast(text) {
  if (!text) return;
  state.ui.criticalToastUntil = nowMs() + 3000;
  opsToastEl.textContent = text;
  opsToastEl.hidden = false;
}

function phaseStreetLabel(phaseId) {
  return PHASE_COLUMNS.find((item) => item.id === phaseId)?.street || "Execution Street";
}

function sanitizeRunIdentity(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-:]+|[-:]+$/g, "")
    .slice(0, 80);
}

function inferPhaseFromText(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return null;
  if (/\b(plan|planning|scope|design|investigate|analysis|research)\b/.test(value)) return "plan";
  if (/\b(verify|verification|test|assert|qa|validate|check)\b/.test(value)) return "verify";
  if (/\b(report|summary|summarize|writeup|narrative|explain|handoff)\b/.test(value)) return "report";
  if (/\b(execute|implement|patch|edit|build|run|code|fix)\b/.test(value)) return "execute";
  return null;
}

function inferPhaseForDerived(derived) {
  const parts = [derived.rawType, derived.message, derived.toolName, derived.filePath].filter(Boolean).join(" ");
  return inferPhaseFromText(parts) || "execute";
}

function inferNeedsAttentionSeverity(run) {
  if (!run) return "none";
  if (run.operationalStatus === "failed" || run.operationalStatus === "loop" || run.operationalStatus === "blocked") {
    return "critical";
  }
  if (run.operationalStatus === "needs-human") return "warn";
  if (run.operationalStatus === "waiting" && nowMs() - (run.lastTs || run.createdAt) > 120000) return "info";
  return "none";
}

function inferAgentType(run) {
  if (!run) return "main";
  if (run.simulated) return "simulated";
  if (run.manual) return "manual";
  return "main";
}

function nextLorongName() {
  const index = state.lorongCounter;
  state.lorongCounter += 1;
  const street = LORONG_STREETS[(index - 1) % LORONG_STREETS.length];
  if (index <= LORONG_STREETS.length) return street;
  return `${street} #${Math.ceil(index / LORONG_STREETS.length)}`;
}

function createRun({ runId, agentId, label, laneName, manual = false, simulated = false }) {
  return {
    runId,
    agentId,
    label,
    laneName: laneName || nextLorongName(),
    manual,
    simulated,
    status: "idle",
    currentPhase: "execute",
    blocked: false,
    blockedReason: "",
    needsAttentionSeverity: "none",
    createdAt: nowMs(),
    firstTs: null,
    lastTs: null,
    rawEvents: [],
    timeline: [],
    toolCount: 0,
    fileCount: 0,
    errorCount: 0,
    successCount: 0,
    failureStreak: 0,
    lastToolAt: 0,
    lastFileChangeAt: 0,
    lastSuccessTs: 0,
    blockedSinceTs: 0,
    firstAnomalyTs: 0,
    blockerClass: "none",
    requiresHumanGate: false,
    approvalSummary: "",
    approvalRisk: "low",
    previousPhaseBeforeApproval: null,
    operationalStatus: "waiting",
    runtimeMs: 0,
    lastActionTs: 0,
    errorSignatures: [],
    alertFeed: [],
    highlight: null,
  };
}

function ensureRun(runId, { agentId, label, laneName, manual = false, simulated = false } = {}) {
  if (state.runs.has(runId)) return state.runs.get(runId);
  const run = createRun({
    runId,
    agentId: agentId || `codex:${runId}`,
    label: label || agentId || `codex:${runId}`,
    laneName,
    manual,
    simulated,
  });
  state.runs.set(runId, run);
  state.runOrder.unshift(runId);
  if (!state.selectedRunId) state.selectedRunId = runId;
  return run;
}

function ensureMainRun() {
  const run = ensureRun("main", { agentId: "codex:main", label: "codex:main" });
  if (!state.activeManualRunId) state.activeManualRunId = run.runId;
}

function pickRunForRawEvent(rawEvent, forceRunId = null) {
  if (forceRunId) return ensureRun(forceRunId, { agentId: `codex:${forceRunId}`, label: `codex:${forceRunId}` });
  const identity = sanitizeRunIdentity(extractRunIdentity(rawEvent));
  if (identity) {
    const runId = `explicit:${identity}`;
    return ensureRun(runId, {
      agentId: `codex:${identity}`,
      label: `codex:${identity}`,
      simulated: identity.startsWith("sim-"),
    });
  }
  return ensureRun(state.activeManualRunId || "main", {
    agentId: state.activeManualRunId ? `codex:${state.activeManualRunId}` : "codex:main",
    label: state.activeManualRunId ? `codex:${state.activeManualRunId}` : "codex:main",
  });
}

function addTimelineRecord(run, rawEvent, derivedEvents) {
  const ts = derivedEvents[0]?.ts || getRawEventTimestamp(rawEvent);
  const rawType = derivedEvents[0]?.rawType || getRawEventType(rawEvent);
  const filePath = derivedEvents.find((item) => item.filePath)?.filePath || null;
  const record = {
    id: state.timelineEventId,
    ts,
    rawType,
    rawEvent,
    derived: derivedEvents,
    summary: deriveSummary(derivedEvents),
    filePath,
  };
  state.timelineEventId += 1;
  run.timeline.push(record);
  if (run.timeline.length > 3000) run.timeline.shift();
  return record;
}

function deriveSummary(derivedEvents) {
  const kinds = derivedEvents.map((item) => item.kind);
  if (kinds.includes("error")) {
    const err = derivedEvents.find((item) => item.kind === "error");
    return `Error: ${err?.message || "unknown"}`;
  }
  if (kinds.includes("success")) return "Success event";
  if (kinds.includes("file.changed")) {
    const file = derivedEvents.find((item) => item.kind === "file.changed");
    return `File changed: ${file?.filePath || "unknown"}`;
  }
  if (kinds.includes("tool.activity")) {
    const tool = derivedEvents.find((item) => item.kind === "tool.activity");
    return `Tool activity: ${tool?.toolName || "tool"}`;
  }
  if (kinds.includes("human.gate")) return "Approval required";
  if (kinds.includes("stall")) return "Run stalled";
  return derivedEvents[0]?.message || "Note";
}

function isHumanText(value) {
  const text = String(value || "").toLowerCase();
  return /(approval|approve|awaiting user|needs user input|human input|manual gate|waiting for user|review)/.test(text);
}

function classifyBlocker(run) {
  const recent = run.timeline.slice(-20);
  const recentText = recent.map((record) => `${record.rawType} ${record.summary}`).join(" ").toLowerCase();
  const verifyErrors = recent.filter((record) => /verify|test|assert|qa/.test(`${record.rawType} ${record.summary}`.toLowerCase()) && /error|failed|failure/.test(record.summary.toLowerCase())).length;

  const signatureCounts = new Map();
  for (const item of run.errorSignatures) {
    signatureCounts.set(item.signature, (signatureCounts.get(item.signature) || 0) + 1);
  }
  const repeatedSameFailure = Array.from(signatureCounts.values()).some((count) => count >= 2);

  if (/(dependency|waiting on|network lock|install lock|upstream pending|blocked by service)/.test(recentText)) {
    return "dependency_wait";
  }
  if (verifyErrors >= 2) return "verify_loop";
  if (repeatedSameFailure) return "tool_fail_loop";

  const noProgress = run.lastToolAt > 0 && run.lastToolAt > run.lastFileChangeAt && nowMs() - run.lastToolAt > 120000;
  if (noProgress) return "no_progress";

  if (run.blocked) return "no_progress";
  return "none";
}

function riskForRun(run) {
  const blockedAge = run.blockedSinceTs ? nowMs() - run.blockedSinceTs : 0;
  if (run.needsAttentionSeverity === "critical" || run.failureStreak >= 3 || blockedAge > 30 * 60 * 1000) return "high";
  if (run.needsAttentionSeverity === "warn" || blockedAge > 10 * 60 * 1000) return "med";
  return "low";
}

function operationalStatus(run) {
  if (run.requiresHumanGate) return "needs-human";
  if (run.status === "error") return "failed";
  if (run.blockerClass === "verify_loop" || run.blockerClass === "tool_fail_loop") return "loop";
  if (run.blocked) return "blocked";
  if (run.status === "done") return "done";
  if (run.status === "working") return "active";
  const idleAge = nowMs() - (run.lastTs || run.createdAt || nowMs());
  if (idleAge <= 120000) return "waiting";
  return "waiting";
}

function phaseImpact(run) {
  if (run.requiresHumanGate) return PHASE_WEIGHT["approval-gate"];
  return PHASE_WEIGHT[run.currentPhase] || 1;
}

function updateRunDerivedFields(run) {
  run.blockerClass = classifyBlocker(run);

  const shouldBlock = run.blocked || CULDESAC_BLOCKERS.has(run.blockerClass);
  if (shouldBlock) {
    if (!run.blockedSinceTs) run.blockedSinceTs = run.lastTs || nowMs();
  } else {
    run.blockedSinceTs = 0;
  }

  run.operationalStatus = operationalStatus(run);
  run.runtimeMs = Math.max(0, (run.lastTs || run.createdAt) - (run.firstTs || run.createdAt));
  run.lastActionTs = run.lastTs || run.createdAt;
  run.needsAttentionSeverity = inferNeedsAttentionSeverity(run);
  run.approvalRisk = riskForRun(run);

  const anomalous = ["blocked", "loop", "failed"].includes(run.operationalStatus);
  if (anomalous && !run.firstAnomalyTs) {
    run.firstAnomalyTs = run.lastTs || nowMs();
  }
}

function updateAllDerived() {
  for (const run of state.runs.values()) updateRunDerivedFields(run);
  if (state.replay.active && state.replay.previewRun) updateRunDerivedFields(state.replay.previewRun);
}

function pushAlert(run, derived, ts) {
  const severity = derived.attentionSeverity || "none";
  if (severity === "none") return;
  run.alertFeed.push({
    ts,
    severity,
    code: derived.attentionCode || "unknown",
    message: derived.message || derived.rawType || "Attention required",
  });
  if (run.alertFeed.length > 120) run.alertFeed.shift();
}

function applyDerivedEvent(run, derived) {
  const ts = derived.ts || nowMs();
  const text = `${derived.rawType || ""} ${derived.message || ""}`.toLowerCase();

  run.currentPhase = inferPhaseForDerived(derived);
  if (run.firstTs === null) run.firstTs = ts;
  run.lastTs = Math.max(run.lastTs || 0, ts);

  if (derived.kind === "step.started") run.status = "working";
  if (derived.kind === "step.ended" && run.status !== "error") run.status = "done";

  if (derived.kind === "tool.activity") {
    run.toolCount += 1;
    run.lastToolAt = ts;
    run.status = "working";
    run.blocked = false;
    run.blockedReason = "";
  }

  if (derived.kind === "file.changed") {
    run.fileCount += 1;
    run.lastFileChangeAt = ts;
    run.status = "working";
    run.blocked = false;
    run.blockedReason = "";
  }

  if (derived.kind === "error") {
    run.errorCount += 1;
    run.failureStreak += 1;
    run.status = "error";
    const signature = (derived.signature || derived.message || derived.rawType || "error").toLowerCase().slice(0, 96);
    run.errorSignatures.push({ ts, signature });
    if (run.errorSignatures.length > 200) run.errorSignatures.shift();
  }

  if (derived.kind === "success") {
    run.successCount += 1;
    run.failureStreak = 0;
    run.status = "done";
    run.lastSuccessTs = ts;
    run.blocked = false;
    run.blockedReason = "";
  }

  if (derived.kind === "stall") {
    run.blocked = true;
    run.blockedReason = derived.message || "Run appears stalled";
  }

  if (derived.kind === "human.gate") {
    run.requiresHumanGate = true;
    run.approvalSummary = derived.message || "Requires approval";
    if (!run.previousPhaseBeforeApproval) {
      run.previousPhaseBeforeApproval = run.currentPhase;
    }
  }

  if (/(blocked|on hold|awaiting|waiting for)/.test(text)) {
    run.blocked = true;
    run.blockedReason = derived.message || derived.rawType || "blocked";
  }

  if (isHumanText(text)) {
    run.requiresHumanGate = true;
    run.approvalSummary = derived.message || "Requires approval";
    if (!run.previousPhaseBeforeApproval) {
      run.previousPhaseBeforeApproval = run.currentPhase;
    }
  }

  pushAlert(run, derived, ts);
}

function integrateDerivedSet(run, rawEvent, derivedEvents, options = {}) {
  if (run.rawEvents.length > 4000) run.rawEvents.shift();
  run.rawEvents.push(rawEvent);

  addTimelineRecord(run, rawEvent, derivedEvents);
  for (const derived of derivedEvents) {
    applyDerivedEvent(run, derived);
  }

  if (!options.skipPersistence) queuePersistence();
}

function ingestRawEvent(rawEvent, options = {}) {
  if (!rawEvent || typeof rawEvent !== "object") return;
  const run = pickRunForRawEvent(rawEvent, options.forceRunId || null);
  const derivedEvents = mapCodexToVizEvents(rawEvent);
  integrateDerivedSet(run, rawEvent, derivedEvents, { skipPersistence: options.skipPersistence === true });
  if (!state.selectedRunId) state.selectedRunId = run.runId;
  updateAllDerived();
  renderUi();
}

function queuePersistence() {
  if (state.persistTimer) return;
  state.persistTimer = window.setTimeout(() => {
    state.persistTimer = null;
    persistRunsToStorage();
  }, 500);
}

function persistRunsToStorage() {
  const data = state.runOrder
    .map((runId) => {
      const run = state.runs.get(runId);
      if (!run) return null;
      return {
        runId: run.runId,
        agentId: run.agentId,
        label: run.label,
        laneName: run.laneName,
        manual: run.manual,
        simulated: run.simulated,
        createdAt: run.createdAt,
        rawEvents: run.rawEvents.slice(-1500),
      };
    })
    .filter(Boolean);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function persistSettings() {
  const payload = {
    reducedMotion: state.ui.reducedMotion,
    colorblindPalette: state.ui.colorblindPalette,
    tileSize: state.ui.tileSize,
    queueSearch: state.ui.queueSearch,
    queueFilters: state.ui.queueFilters,
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function restoreSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (typeof parsed.reducedMotion === "boolean") state.ui.reducedMotion = parsed.reducedMotion;
    if (typeof parsed.colorblindPalette === "boolean") state.ui.colorblindPalette = parsed.colorblindPalette;
    if (["s", "m", "l"].includes(parsed.tileSize)) state.ui.tileSize = parsed.tileSize;
    if (typeof parsed.queueSearch === "string") state.ui.queueSearch = parsed.queueSearch;
    if (parsed.queueFilters && typeof parsed.queueFilters === "object") {
      state.ui.queueFilters = {
        phase: parsed.queueFilters.phase || "all",
        status: parsed.queueFilters.status || "all",
        agentType: parsed.queueFilters.agentType || "all",
      };
    }
  } catch {
    // ignore
  }

  reducedMotionToggleEl.checked = state.ui.reducedMotion;
  colorblindToggleEl.checked = state.ui.colorblindPalette;
  tileSizeSelectEl.value = state.ui.tileSize;
  agentSearchEl.value = state.ui.queueSearch;
  phaseFilterEl.value = state.ui.queueFilters.phase;
  statusFilterEl.value = state.ui.queueFilters.status;
  typeFilterEl.value = state.ui.queueFilters.agentType;
  document.body.classList.toggle("reduced-motion", state.ui.reducedMotion);
  document.body.classList.toggle("colorblind", state.ui.colorblindPalette);
}

function restoreRunsFromStorage() {
  let parsed = [];
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) return;

  for (const item of parsed) {
    if (!item || !item.runId || !Array.isArray(item.rawEvents)) continue;
    const run = ensureRun(item.runId, {
      agentId: item.agentId || `codex:${item.runId}`,
      label: item.label || item.agentId || `codex:${item.runId}`,
      laneName: item.laneName,
      manual: Boolean(item.manual),
      simulated: Boolean(item.simulated),
    });
    run.createdAt = Number(item.createdAt) || run.createdAt;

    for (const rawEvent of item.rawEvents) {
      const derivedEvents = mapCodexToVizEvents(rawEvent);
      integrateDerivedSet(run, rawEvent, derivedEvents, { skipPersistence: true });
    }
  }

  updateAllDerived();
}

function getRunsForView() {
  const runs = [];
  const replaySourceId = state.replay.active ? state.replay.sourceRunId : null;
  for (const runId of state.runOrder) {
    if (runId === replaySourceId && state.replay.previewRun) {
      runs.push(state.replay.previewRun);
      continue;
    }
    const run = state.runs.get(runId);
    if (run) runs.push(run);
  }
  if (runs.length === 0 && state.replay.previewRun) runs.push(state.replay.previewRun);
  return runs;
}

function getSelectedRealRun() {
  if (!state.selectedRunId) return null;
  return state.runs.get(state.selectedRunId) || null;
}

function getActiveRunForView() {
  if (state.replay.active && state.replay.previewRun && state.replay.sourceRunId === state.selectedRunId) {
    return state.replay.previewRun;
  }
  return getSelectedRealRun();
}

function severityClass(severity) {
  if (severity === "critical") return "sev-critical";
  if (severity === "warn") return "sev-warn";
  if (severity === "info") return "sev-info";
  return "";
}

function blockerLabel(blocker) {
  if (blocker === "verify_loop") return "verify_loop";
  if (blocker === "tool_fail_loop") return "tool_fail_loop";
  if (blocker === "dependency_wait") return "dependency_wait";
  if (blocker === "no_progress") return "no_progress";
  return "none";
}

function queueSort(a, b) {
  const sev = (ATTENTION_RANK[b.needsAttentionSeverity] || 0) - (ATTENTION_RANK[a.needsAttentionSeverity] || 0);
  if (sev !== 0) return sev;
  const impact = phaseImpact(b) - phaseImpact(a);
  if (impact !== 0) return impact;
  const aAge = a.blockedSinceTs || a.lastActionTs || 0;
  const bAge = b.blockedSinceTs || b.lastActionTs || 0;
  return aAge - bAge;
}

function selectRun(runId, options = {}) {
  const run = state.runs.get(runId);
  if (!run) return;

  state.selectedRunId = runId;
  state.ui.selectedAgentRunId = runId;
  state.ui.focusedPhase = run.requiresHumanGate ? "approval" : run.currentPhase;
  state.ui.highlightRunId = runId;
  if (options.drawerMode) state.ui.drawerMode = options.drawerMode;
  setAgentDrawerOpen(true);

  if (state.replay.active && state.replay.sourceRunId !== runId) stopReplay();

  scrollQueueToRun(runId);
  renderUi();
  scrollMapToPhase(state.ui.focusedPhase);
}

function scrollMapToPhase(phase) {
  if (!mapViewportEl) return;
  if (phase === "approval") {
    mapViewportEl.scrollTo({ top: mapViewportEl.scrollHeight, behavior: "smooth" });
    return;
  }
  const index = PHASE_COLUMNS.findIndex((item) => item.id === phase);
  if (index < 0) return;
  const colW = mapViewportEl.clientWidth / PHASE_COLUMNS.length;
  const left = Math.max(0, index * colW - colW / 3);
  mapViewportEl.scrollTo({ left, behavior: "smooth" });
}

function scrollQueueToRun(runId) {
  const card = attentionQueueEl.querySelector(`[data-run-id="${CSS.escape(runId)}"]`);
  if (card) card.scrollIntoView({ block: "nearest" });
}

function approveRun(runId) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.requiresHumanGate = false;
  run.blocked = false;
  run.blockedReason = "";
  run.approvalSummary = "";
  run.status = "working";
  run.currentPhase = run.previousPhaseBeforeApproval || run.currentPhase || "execute";
  run.previousPhaseBeforeApproval = null;
  run.blockerClass = "none";
  run.lastTs = nowMs();
  updateRunDerivedFields(run);
  queuePersistence();
  renderUi();
}

function restartRun(runId) {
  const run = state.runs.get(runId);
  if (!run) return;
  run.blocked = false;
  run.blockedReason = "";
  run.failureStreak = 0;
  run.status = "working";
  run.blockerClass = "none";
  run.lastTs = nowMs();
  updateRunDerivedFields(run);
  queuePersistence();
  renderUi();
}

function provideInput(runId, text) {
  const run = state.runs.get(runId);
  if (!run) return;
  const message = String(text || "").trim();
  if (!message) return;
  ingestRawEvent(
    {
      type: "operator.input",
      run_id: runId.replace(/^explicit:/, ""),
      ts: nowMs(),
      message,
      requires_approval: false,
    },
    { forceRunId: runId }
  );
}

function jumpToFirstAnomaly(runId) {
  const run = state.runs.get(runId);
  if (!run || !run.firstAnomalyTs) return;
  const record = run.timeline.find((item) => item.ts >= run.firstAnomalyTs);
  if (record) {
    run.highlight = { until: nowMs() + 2500, phase: run.currentPhase };
  }
  selectRun(runId, { drawerMode: "failure" });
}

function actionRecommendations(run) {
  if (!run) return ["Select an agent to inspect."];
  if (run.requiresHumanGate) {
    return [
      "Review approval summary and risk badge.",
      "Approve only if the action is safe for current environment.",
      "If unclear, provide targeted operator input before approving.",
    ];
  }
  if (run.blockerClass === "verify_loop") {
    return [
      "Restart from last known good checkpoint.",
      "Narrow scope to one failing test.",
      "Capture exact failing assertion and rerun once.",
    ];
  }
  if (run.blockerClass === "tool_fail_loop") {
    return ["Stop repeating tool command.", "Inspect the first failure payload.", "Provide input with a constrained next step."];
  }
  if (run.blockerClass === "dependency_wait") {
    return ["Check upstream dependency health.", "Defer retries with backoff.", "Move agent to alternate non-blocked task if possible."];
  }
  if (run.blockerClass === "no_progress") {
    return ["Restart run from checkpoint.", "Request concrete file change output.", "Escalate if no progress after one retry."];
  }
  return ["Monitor current flow.", "Verify one concrete success signal.", "Keep intervention minimal while active."];
}

function renderGlobalHud() {
  const runs = getRunsForView();
  const mode = state.replay.active ? "Replay" : "Live";
  const run = getActiveRunForView();
  const attentionRuns = runs
    .filter((item) => item.requiresHumanGate || (ATTENTION_RANK[item.needsAttentionSeverity] || 0) >= ATTENTION_RANK.info)
    .sort(queueSort);
  const stalledRuns = runs.filter((item) => CULDESAC_BLOCKERS.has(item.blockerClass));
  const approvals = runs.filter((item) => item.requiresHumanGate);
  const criticalCount = attentionRuns.filter((item) => item.needsAttentionSeverity === "critical").length;

  if (!state.ui.opsDrawerOpen && criticalCount > state.ui.previousCriticalCount) {
    showOpsToast(`Critical attention item detected (${criticalCount})`);
  }
  state.ui.previousCriticalCount = criticalCount;

  summaryRunIdentityEl.textContent = run ? `${run.laneName} | ${run.label}` : "Lorong: Waiting | codex:main";
  summaryModeEl.textContent = `Mode: ${mode}`;

  if (mode === "Replay") {
    summaryConnectionEl.textContent = "Connection: Replay source";
  } else {
    const connectionState = deriveConnectionState();
    const label = connectionState === "connected" ? "Connected" : connectionState === "reconnecting" ? "Reconnecting" : "Disconnected";
    summaryConnectionEl.textContent = `Connection: ${label}`;
  }

  const topStatus = deriveTopStatus(run);
  summaryStatusEl.textContent = `Status: ${topStatus}`;
  summaryRuntimeEl.textContent = `Runtime: ${run ? formatDuration(run.runtimeMs) : "0s"}`;

  if (run?.blockedSinceTs) {
    summaryBlockedSinceEl.classList.remove("is-hidden");
    summaryBlockedSinceEl.textContent = `Blocked since: ${ageText(run.blockedSinceTs)}`;
  } else {
    summaryBlockedSinceEl.classList.add("is-hidden");
  }

  const anomalyRun = run?.firstAnomalyTs
    ? run
    : runs.filter((item) => item.firstAnomalyTs).sort((a, b) => a.firstAnomalyTs - b.firstAnomalyTs)[0];
  state.ui.summaryFocusRunId = anomalyRun?.runId || null;

  if (anomalyRun?.firstAnomalyTs) {
    summaryFirstAnomalyEl.classList.remove("is-hidden");
    summaryFirstAnomalyEl.textContent = `First anomaly: ${new Date(anomalyRun.firstAnomalyTs).toLocaleTimeString()}`;
  } else {
    summaryFirstAnomalyEl.classList.add("is-hidden");
  }

  summaryNeedsAttentionEl.textContent = `Needs attention: ${attentionRuns.length}`;
  summaryStalledEl.textContent = `System stalled: ${stalledRuns.length}`;
  summaryApprovalsEl.textContent = `Approvals pending: ${approvals.length}`;

  opsTabBadgeEl.textContent = String(attentionRuns.length);
  opsTabBadgeEl.classList.toggle("critical", criticalCount > 0);
  opsTabEl.classList.toggle("pulse", criticalCount > 0 && !state.ui.reducedMotion);

  summaryPrimaryCtaEl.textContent = "Open Ops";
  summaryPrimaryCtaEl.dataset.action = "open-ops";

  const hasActiveRuns = runs.some((item) => item.operationalStatus === "active" || item.operationalStatus === "waiting");
  const hasOpenIssues = attentionRuns.length > 0 || approvals.length > 0 || stalledRuns.length > 0;
  const shouldExpandSummary = mode === "Replay" || hasActiveRuns || hasOpenIssues || topStatus === "Blocked" || topStatus === "Degraded";
  topSummaryBarEl.classList.toggle("summary-expanded", shouldExpandSummary);

  const shouldPulseSimulationCta = mode === "Live" && !shouldExpandSummary && !state.ui.reducedMotion;
  summaryRunSimBtnEl.classList.toggle("pulse", shouldPulseSimulationCta);

  if (run) {
    runBadgeEl.textContent = `${APP_NAME} | ${run.laneName} | ${run.label}`;
  } else {
    runBadgeEl.textContent = `${APP_NAME} | no run selected`;
  }
}

function phaseLaneGeometry(index) {
  const margin = 18;
  const top = 58;
  const bottom = 24;
  const gap = 40;
  const laneW = Math.floor((WORLD.width - margin * 2 - gap * (PHASE_COLUMNS.length - 1)) / PHASE_COLUMNS.length);
  const laneH = WORLD.height - top - bottom;
  const x = margin + index * (laneW + gap);
  const y = top;
  const signH = 82;
  const sectionGap = 8;
  const sectionY = y + signH + 8;
  const sectionH = laneH - signH - 16;
  const culH = Math.floor(sectionH * 0.38);
  const mainH = sectionH - culH - sectionGap;
  return {
    lane: { x, y, w: laneW, h: laneH },
    sign: { x: x + 6, y: y + 6, w: laneW - 12, h: signH },
    main: { x: x + 8, y: sectionY, w: laneW - 16, h: mainH },
    cul: { x: x + 8, y: sectionY + mainH + sectionGap, w: laneW - 16, h: culH },
  };
}

function drawRoundedRect(target, x, y, w, h, radius, fill, stroke = null) {
  target.beginPath();
  target.moveTo(x + radius, y);
  target.lineTo(x + w - radius, y);
  target.quadraticCurveTo(x + w, y, x + w, y + radius);
  target.lineTo(x + w, y + h - radius);
  target.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  target.lineTo(x + radius, y + h);
  target.quadraticCurveTo(x, y + h, x, y + h - radius);
  target.lineTo(x, y + radius);
  target.quadraticCurveTo(x, y, x + radius, y);
  target.closePath();
  target.fillStyle = fill;
  target.fill();
  if (stroke) {
    target.strokeStyle = stroke;
    target.stroke();
  }
}

function drawText(target, text, x, y, color = "#f4f0de", size = 12) {
  target.fillStyle = color;
  target.font = `bold ${size}px "Lucida Console", "Monaco", monospace`;
  target.fillText(text, Math.round(x), Math.round(y));
}

function drawPatternRect(target, image, rect, alpha = 1) {
  if (!image) return;
  const pattern = target.createPattern(image, "repeat");
  if (!pattern) return;
  target.save();
  target.globalAlpha = alpha;
  target.fillStyle = pattern;
  target.fillRect(rect.x, rect.y, rect.w, rect.h);
  target.restore();
}

function getRotatedPatternImage(image, degrees) {
  if (!image) return null;
  const key = `${image.src || "inline"}|${degrees}`;
  if (ROTATED_PATTERN_CACHE.has(key)) return ROTATED_PATTERN_CACHE.get(key);
  const rad = (degrees * Math.PI) / 180;
  const srcW = image.naturalWidth || image.width || 1;
  const srcH = image.naturalHeight || image.height || 1;
  const outW = Math.ceil(Math.abs(srcW * Math.cos(rad)) + Math.abs(srcH * Math.sin(rad))) || 1;
  const outH = Math.ceil(Math.abs(srcW * Math.sin(rad)) + Math.abs(srcH * Math.cos(rad))) || 1;
  const off = document.createElement("canvas");
  off.width = outW;
  off.height = outH;
  const offCtx = off.getContext("2d");
  if (!offCtx) return image;
  offCtx.imageSmoothingEnabled = false;
  offCtx.translate(outW / 2, outH / 2);
  offCtx.rotate(rad);
  offCtx.drawImage(image, -srcW / 2, -srcH / 2);
  ROTATED_PATTERN_CACHE.set(key, off);
  return off;
}

function drawSidewalkSurface(target, rect) {
  drawPatternRect(target, CITY_ART.sidewalk.image, rect, 1);
  target.fillStyle = "rgba(13, 31, 45, 0.22)";
  target.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function drawRoadSurface(target, rect, variant) {
  drawPatternRect(target, CITY_ART.roadBase.image, rect, 1);
  const centerW = variant === "main" ? 12 : 8;
  const centerRect = {
    x: Math.round(rect.x + rect.w / 2 - centerW / 2),
    y: rect.y + 8,
    w: centerW,
    h: Math.max(10, rect.h - 16),
  };
  const dashVertical = getRotatedPatternImage(CITY_ART.whiteDash.image, 90);
  drawPatternRect(target, dashVertical || CITY_ART.whiteDash.image, centerRect, variant === "main" ? 0.95 : 0.75);

  if (variant === "main") return;

  const crosswalkH = Math.min(26, Math.max(12, Math.floor(rect.h * 0.24)));
  const crosswalkRect = {
    x: rect.x + Math.max(10, Math.floor(rect.w * 0.06)),
    y: rect.y + rect.h - crosswalkH - 6,
    w: Math.max(8, rect.w - Math.max(20, Math.floor(rect.w * 0.12))),
    h: crosswalkH,
  };
  drawPatternRect(target, CITY_ART.crosswalk.image, crosswalkRect, 0.88);
}

function drawBuildingDividers(target, laneGeometries) {
  if (laneGeometries.length < 2) return;
  for (let i = 0; i < laneGeometries.length - 1; i += 1) {
    const left = laneGeometries[i].lane;
    const right = laneGeometries[i + 1].lane;
    const dividerX = left.x + left.w;
    const dividerW = right.x - dividerX;
    if (dividerW < 8) continue;

    const dividerRect = {
      x: dividerX + 1,
      y: left.y,
      w: Math.max(2, dividerW - 2),
      h: left.h,
    };

    target.fillStyle = "rgba(18, 37, 54, 0.6)";
    target.fillRect(dividerRect.x, dividerRect.y, dividerRect.w, dividerRect.h);

    const sprites = CITY_BUILDING_KEYS.map((key) => CITY_ART[key].image).filter(Boolean);
    if (!sprites.length) continue;

    let yCursor = dividerRect.y + dividerRect.h - 4;
    let seq = i;
    while (yCursor > dividerRect.y + 18) {
      const sprite = sprites[seq % sprites.length];
      const scale = 0.12 + ((seq % 3) * 0.02);
      const baseW = sprite.naturalWidth || sprite.width || 1;
      const baseH = sprite.naturalHeight || sprite.height || 1;
      const drawW = Math.max(14, Math.min(dividerRect.w - 4, Math.floor(baseW * scale)));
      const drawH = Math.max(18, Math.floor(baseH * (drawW / baseW)));
      const drawX = dividerRect.x + Math.floor((dividerRect.w - drawW) / 2);
      const drawY = yCursor - drawH;
      if (drawY < dividerRect.y + 4) break;
      target.drawImage(sprite, drawX, drawY, drawW, drawH);
      yCursor = drawY - 4;
      seq += 1;
    }

    target.fillStyle = "rgba(11, 23, 35, 0.2)";
    target.fillRect(dividerRect.x, dividerRect.y, dividerRect.w, dividerRect.h);
  }
}

function stableSortRuns(runs) {
  return [...runs].sort((a, b) => {
    const order = (STATUS_ORDER[a.operationalStatus] || 9) - (STATUS_ORDER[b.operationalStatus] || 9);
    if (order !== 0) return order;
    const phase = String(a.currentPhase).localeCompare(String(b.currentPhase));
    if (phase !== 0) return phase;
    const recency = (b.lastActionTs || 0) - (a.lastActionTs || 0);
    if (recency !== 0) return recency;
    return String(a.runId).localeCompare(String(b.runId));
  });
}

function actorDims(densityMode) {
  const base = state.ui.tileSize === "s" ? { w: 70, h: 88 } : state.ui.tileSize === "l" ? { w: 102, h: 122 } : { w: 84, h: 102 };
  if (!densityMode) return base;
  return { w: Math.max(58, base.w - 18), h: Math.max(78, base.h - 20) };
}

function shortLabel(run, densityMode) {
  const raw = run.label.replace(/^codex:/, "");
  return densityMode ? raw.slice(0, 9) : raw.slice(0, 12);
}

function progressTsForRun(run) {
  return Math.max(run.lastToolAt || 0, run.lastFileChangeAt || 0, run.lastSuccessTs || 0, run.firstTs || 0, run.createdAt || 0);
}

function progressAgeMs(run) {
  const ts = progressTsForRun(run);
  if (!ts) return 0;
  return Math.max(0, nowMs() - ts);
}

function visualStateForRun(run) {
  if (run.requiresHumanGate || run.operationalStatus === "needs-human") return "approval";
  if (run.operationalStatus === "loop" || run.blockerClass === "verify_loop" || run.blockerClass === "tool_fail_loop") return "loop";
  if (run.operationalStatus === "blocked") return "blocked";
  if (run.operationalStatus === "failed") return "failed";
  if (run.operationalStatus === "active") return "active";
  if (run.operationalStatus === "done") return "done";
  return "waiting";
}

function characterSpriteForRun(run) {
  if (!CHARACTER_SPRITES.images.length) return null;
  const idx = hashString(run.runId) % CHARACTER_SPRITES.images.length;
  return CHARACTER_SPRITES.images[idx] || null;
}

function drawFallbackCharacter(target, x, y, w, h, color = "#dde8f4") {
  drawRoundedRect(target, x + Math.floor(w * 0.34), y + Math.floor(h * 0.06), Math.floor(w * 0.32), Math.floor(h * 0.24), 6, color);
  drawRoundedRect(target, x + Math.floor(w * 0.22), y + Math.floor(h * 0.28), Math.floor(w * 0.56), Math.floor(h * 0.56), 8, color);
}

function drawTimeChip(target, x, y, text, ageMs) {
  const palette = ageMs >= 10 * 60 * 1000 ? { bg: "rgba(154, 41, 41, 0.92)", fg: "#ffe6e6" } : ageMs >= 2 * 60 * 1000 ? { bg: "rgba(148, 109, 28, 0.9)", fg: "#fff2d3" } : { bg: "rgba(23, 56, 82, 0.9)", fg: "#dff2ff" };
  const width = Math.max(44, text.length * 6 + 8);
  drawRoundedRect(target, x, y, width, 14, 5, palette.bg, "rgba(205, 232, 255, 0.45)");
  drawText(target, text, x + 4, y + 10, palette.fg, 8);
}

function drawBubble(target, cx, cy) {
  target.fillStyle = "#ffd548";
  target.beginPath();
  target.arc(cx, cy, 5, 0, Math.PI * 2);
  target.fill();
  target.beginPath();
  target.arc(cx - 6, cy + 8, 2, 0, Math.PI * 2);
  target.fill();
}

function drawStateIcon(target, x, y, stateId) {
  if (stateId === "approval") {
    drawText(target, "📋", x, y, "#f4f9ff", 10);
  } else if (stateId === "active") {
    drawText(target, "⌨", x, y, "#c8f2dd", 9);
  } else if (stateId === "loop") {
    drawText(target, "🔁", x, y, "#ffd8d0", 10);
  }
}

function drawClusterBadge(target, x, y, count) {
  const text = `+${count}`;
  const width = Math.max(18, 8 + text.length * 6);
  drawRoundedRect(target, x - width, y, width, 14, 5, "rgba(20, 47, 73, 0.94)", "rgba(205, 232, 255, 0.56)");
  drawText(target, text, x - width + 4, y + 10, "#e7f5ff", 8);
}

function motionForActor(placement, visualState, timeSec, reducedMotion) {
  const seed = (hashString(placement.run.runId) % 1000) / 1000;
  if (reducedMotion) {
    return { dx: 0, dy: 0, alpha: visualState === "done" ? 0.62 : 1, shake: 0, typingOn: visualState === "active", sitOffset: visualState === "done" ? 4 : 0 };
  }
  const t = timeSec + seed;
  if (visualState === "active") {
    return { dx: Math.sin(t * 5) * 2, dy: Math.sin(t * 8) * 1.5, alpha: 1, shake: 0, typingOn: Math.sin(t * 10) > 0, sitOffset: 0 };
  }
  if (visualState === "waiting") {
    return { dx: 0, dy: Math.sin(t * 2.5) * 0.6, alpha: 1, shake: 0, typingOn: false, sitOffset: 0 };
  }
  if (visualState === "blocked") {
    return { dx: 0, dy: 0, alpha: 1, shake: Math.sin(t * 28) * 1.6, typingOn: false, sitOffset: 0 };
  }
  if (visualState === "approval") {
    return { dx: 0, dy: Math.sin(t * 4) * 0.5, alpha: 1, shake: 0, typingOn: false, sitOffset: 0 };
  }
  if (visualState === "loop") {
    return { dx: Math.sin(t * 3) * Math.max(4, placement.w * 0.14), dy: 0, alpha: 1, shake: 0, typingOn: false, sitOffset: 0 };
  }
  if (visualState === "failed") {
    return { dx: 0, dy: 0, alpha: 0.95, shake: Math.sin(t * 18) * 2.1, typingOn: false, sitOffset: 0 };
  }
  return { dx: 0, dy: 0, alpha: 0.62, shake: 0, typingOn: false, sitOffset: 4 };
}

function drawAgentActor(target, placement, timeSec) {
  const { run, x, y, w, h, densityMode, section, clusterCount } = placement;
  const visualState = visualStateForRun(run);
  const token = STATUS_TOKENS[run.operationalStatus] || STATUS_TOKENS.waiting;
  const selected = run.runId === state.ui.selectedAgentRunId;
  const highlighted = run.runId === state.ui.highlightRunId || (run.highlight && run.highlight.until > nowMs());
  const border = selected || highlighted ? "#f7e085" : token.color;

  drawRoundedRect(target, x, y, w, h, 6, "rgba(8, 20, 32, 0.55)", border);

  const motion = motionForActor(placement, visualState, timeSec, state.ui.reducedMotion);
  const sprite = characterSpriteForRun(run);
  const spriteW = Math.max(26, Math.floor(w * 0.7));
  const spriteH = Math.max(28, Math.floor(h * 0.72));
  const baseX = x + Math.floor((w - spriteW) / 2 + motion.dx + motion.shake);
  const baseY = y + h - spriteH - 11 + Math.round(motion.dy) + motion.sitOffset;

  target.save();
  target.globalAlpha = motion.alpha;
  if (sprite) {
    target.drawImage(sprite, baseX, baseY, spriteW, spriteH);
  } else {
    drawFallbackCharacter(target, baseX, baseY, spriteW, spriteH, "#dce8f6");
  }
  target.restore();

  if (visualState === "blocked" || visualState === "failed") {
    target.strokeStyle = visualState === "failed" ? "rgba(214, 56, 56, 0.95)" : "rgba(242, 98, 98, 0.9)";
    target.lineWidth = 2;
    target.strokeRect(baseX - 2, baseY - 2, spriteW + 4, spriteH + 4);
  }

  if (visualState === "waiting") drawBubble(target, baseX + spriteW - 3, baseY - 5);
  if (visualState === "approval" || visualState === "active" || visualState === "loop") drawStateIcon(target, baseX + spriteW - 8, baseY - 2, visualState);

  if (motion.typingOn) {
    drawRoundedRect(target, baseX + Math.floor(spriteW * 0.15), baseY + spriteH - 11, Math.max(10, Math.floor(spriteW * 0.7)), 6, 2, "rgba(10, 29, 43, 0.9)", "rgba(168, 233, 199, 0.65)");
  }

  const timeText = `⏳ ${ageText(progressTsForRun(run))}`;
  drawTimeChip(target, x + 3, y + 2, timeText, progressAgeMs(run));
  drawText(target, shortLabel(run, densityMode), x + 4, y + h - 4, "#dceefe", 8);

  if (section === "cul" && run.blockerClass !== "none") drawText(target, `${BLOCKER_ICON[run.blockerClass] || ""}`, x + w - 13, y + h - 4, "#ffd6d0", 8);
  if (clusterCount > 0) drawClusterBadge(target, x + w - 2, y + 2, clusterCount);
}

function packActors(rect, runs, densityMode, section, phase) {
  const dims = actorDims(densityMode);
  const spacing = densityMode ? 4 : 8;
  const startX = rect.x + 6;
  const startY = rect.y + 22;
  const usableW = rect.w - 12;
  const usableH = rect.h - 26;
  const cols = Math.max(1, Math.floor((usableW + spacing) / (dims.w + spacing)));
  const rows = Math.max(1, Math.floor((usableH + spacing) / (dims.h + spacing)));
  const capacity = Math.max(1, cols * rows);
  const sorted = stableSortRuns(runs);
  const placements = [];

  const assignAt = (slotIndex, representative, members) => {
    const col = slotIndex % cols;
    const row = Math.floor(slotIndex / cols);
    const px = startX + col * (dims.w + spacing);
    const py = startY + row * (dims.h + spacing);
    placements.push({
      run: representative,
      x: px,
      y: py,
      w: dims.w,
      h: dims.h,
      densityMode,
      phase,
      section,
      clusterCount: Math.max(0, members.length - 1),
      memberRunIds: members.map((item) => item.runId),
    });
  };

  if (sorted.length <= capacity) {
    for (let i = 0; i < sorted.length; i += 1) {
      assignAt(i, sorted[i], [sorted[i]]);
    }
    return { placements, clustered: false };
  }

  const singles = Math.max(0, capacity - 1);
  for (let i = 0; i < singles; i += 1) {
    assignAt(i, sorted[i], [sorted[i]]);
  }
  const clusteredMembers = sorted.slice(singles);
  assignAt(singles, clusteredMembers[0], clusteredMembers);
  return { placements, clustered: true };
}

function drawMap() {
  const timeSec = performance.now() / 1000;
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  drawRoundedRect(ctx, 0, 0, WORLD.width, WORLD.height, 0, "#0d2235");
  drawText(ctx, "City Control Room", 18, 24, "#e8f5ff", 15);
  drawText(ctx, "Stateful Pixel Agents | Main Road = flow | Cul-de-Sac = stalled", 18, 42, "#c0d6e8", 10);

  const runs = getRunsForView();
  state.ui.actorRects = [];
  const useCityArt = state.ui.cityArtEnabled
    && CITY_ART.roadBase.image
    && CITY_ART.sidewalk.image
    && CITY_ART.whiteDash.image
    && CITY_ART.crosswalk.image
    && CITY_ART.building06.image
    && CITY_ART.building07.image
    && CITY_ART.building08.image
    && CITY_ART.building09.image;

  let densityTriggered = false;
  const lanes = PHASE_COLUMNS.map((lane, idx) => {
    const g = phaseLaneGeometry(idx);
    const laneRuns = runs.filter((run) => !run.requiresHumanGate && run.currentPhase === lane.id);
    const culRuns = laneRuns.filter((run) => CULDESAC_BLOCKERS.has(run.blockerClass));
    const mainRuns = laneRuns.filter((run) => !CULDESAC_BLOCKERS.has(run.blockerClass));
    const activeCount = laneRuns.filter((run) => run.operationalStatus === "active").length;
    const waitingCount = laneRuns.filter((run) => run.operationalStatus === "waiting").length;
    const stalledCount = culRuns.length;
    const oldestStallTs = culRuns
      .map((run) => run.blockedSinceTs || run.lastActionTs || 0)
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    return { lane, g, laneRuns, culRuns, mainRuns, activeCount, waitingCount, stalledCount, oldestStallTs };
  });

  for (const item of lanes) {
    const { g, stalledCount } = item;
    if (useCityArt) {
      drawRoundedRect(ctx, g.lane.x, g.lane.y, g.lane.w, g.lane.h, 6, "#152e45", "rgba(161, 199, 224, 0.2)");
      drawSidewalkSurface(ctx, g.lane);
      drawRoundedRect(ctx, g.lane.x, g.lane.y, g.lane.w, g.lane.h, 6, "rgba(0, 0, 0, 0)", "rgba(161, 199, 224, 0.2)");
    } else {
      drawRoundedRect(ctx, g.lane.x, g.lane.y, g.lane.w, g.lane.h, 6, "#17324a", "rgba(161, 199, 224, 0.2)");
    }

    if (useCityArt) {
      drawRoundedRect(ctx, g.main.x, g.main.y, g.main.w, g.main.h, 5, "rgba(23, 41, 56, 0.95)");
      drawRoadSurface(ctx, g.main, "main");
      drawRoundedRect(ctx, g.main.x, g.main.y, g.main.w, g.main.h, 5, "rgba(0, 0, 0, 0)", "rgba(146, 198, 228, 0.26)");
    } else {
      drawRoundedRect(ctx, g.main.x, g.main.y, g.main.w, g.main.h, 5, "rgba(43, 81, 104, 0.45)", "rgba(146, 198, 228, 0.26)");
    }

    if (useCityArt) {
      drawRoundedRect(ctx, g.cul.x, g.cul.y, g.cul.w, g.cul.h, 8, "rgba(47, 30, 34, 0.9)");
      drawRoadSurface(ctx, g.cul, "cul");
      if (stalledCount > 0) {
        ctx.fillStyle = "rgba(156, 52, 52, 0.35)";
        ctx.fillRect(g.cul.x, g.cul.y, g.cul.w, g.cul.h);
      }
      drawRoundedRect(ctx, g.cul.x, g.cul.y, g.cul.w, g.cul.h, 8, "rgba(0, 0, 0, 0)", "rgba(209, 108, 108, 0.5)");
    } else {
      drawRoundedRect(ctx, g.cul.x, g.cul.y, g.cul.w, g.cul.h, 8, "rgba(56, 34, 38, 0.75)", "rgba(209, 108, 108, 0.5)");
    }
  }

  if (useCityArt) {
    drawBuildingDividers(ctx, lanes.map((item) => item.g));
  }

  for (const item of lanes) {
    const {
      lane,
      g,
      mainRuns,
      culRuns,
      activeCount,
      waitingCount,
      stalledCount,
      oldestStallTs,
    } = item;
    drawRoundedRect(ctx, g.sign.x, g.sign.y, g.sign.w, g.sign.h, 6, "#0f2539", "rgba(161, 199, 224, 0.3)");

    const warning = stalledCount > 0;
    const signName = `${lane.emoji} ${lane.street}${warning ? " ⚠" : ""}`;
    drawText(ctx, signName, g.sign.x + 8, g.sign.y + 20, "#f4f7de", 11);
    drawText(ctx, `🚗 ${activeCount} Active | ⏳ ${waitingCount} Waiting | 🛑 ${stalledCount} Stalled`, g.sign.x + 8, g.sign.y + 40, "#d4e5f3", 9);
    drawText(ctx, `Oldest stall: ${oldestStallTs ? ageText(oldestStallTs) : "n/a"}`, g.sign.x + 8, g.sign.y + 58, "#bfd3e6", 8);

    if (warning) {
      ctx.fillStyle = "rgba(212, 75, 75, 0.85)";
      ctx.fillRect(g.sign.x + 4, g.sign.y + g.sign.h - 5, g.sign.w - 8, 3);
    }

    drawText(ctx, "Main Road", g.main.x + 8, g.main.y + 14, "#e8f4df", 9);
    drawText(ctx, `Cul-de-Sac (${stalledCount} Stalled)`, g.cul.x + 8, g.cul.y + 14, "#ffd5cb", 9);

    let mainPacked = packActors(g.main, mainRuns, false, "main", lane.id);
    if (mainPacked.clustered) {
      densityTriggered = true;
      mainPacked = packActors(g.main, mainRuns, true, "main", lane.id);
    }

    let culPacked = packActors(g.cul, culRuns, false, "cul", lane.id);
    if (culPacked.clustered) {
      densityTriggered = true;
      culPacked = packActors(g.cul, culRuns, true, "cul", lane.id);
    }

    for (const actor of mainPacked.placements) {
      drawAgentActor(ctx, actor, timeSec);
      state.ui.actorRects.push(actor);
    }

    for (const actor of culPacked.placements) {
      drawAgentActor(ctx, actor, timeSec);
      state.ui.actorRects.push(actor);
    }
  }

  state.ui.mapDensityMode = densityTriggered;
  state.ui.keyboardFocusIndex = clamp(state.ui.keyboardFocusIndex, 0, Math.max(0, state.ui.actorRects.length - 1));

  renderMapOverlay();
}

function renderMapOverlay() {
  mapOverlayEl.innerHTML = "";
  const scaleX = canvas.clientWidth / WORLD.width;
  const scaleY = canvas.clientHeight / WORLD.height;

  state.ui.actorRects.forEach((actor, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-tile-hit";
    button.dataset.runId = actor.run.runId;
    button.dataset.phase = actor.phase;
    button.dataset.memberCount = String(actor.memberRunIds.length);
    button.style.left = `${Math.round(actor.x * scaleX)}px`;
    button.style.top = `${Math.round(actor.y * scaleY)}px`;
    button.style.width = `${Math.max(4, Math.round(actor.w * scaleX))}px`;
    button.style.height = `${Math.max(4, Math.round(actor.h * scaleY))}px`;
    const clusterSuffix = actor.clusterCount > 0 ? ` | clustered +${actor.clusterCount}` : "";
    button.title = `${actor.run.label} | ${actor.run.operationalStatus}${clusterSuffix}`;
    button.setAttribute(
      "aria-label",
      `${actor.run.label}, ${actor.run.operationalStatus}, ${phaseStreetLabel(actor.phase)}${actor.clusterCount > 0 ? `, cluster of ${actor.memberRunIds.length}` : ""}`
    );
    button.tabIndex = index === state.ui.keyboardFocusIndex ? 0 : -1;

    button.addEventListener("click", () => {
      selectRun(actor.run.runId, { drawerMode: "overview" });
    });

    button.addEventListener("keydown", (event) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const total = state.ui.actorRects.length;
      if (total === 0) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        state.ui.keyboardFocusIndex = (index + 1) % total;
      } else {
        state.ui.keyboardFocusIndex = (index - 1 + total) % total;
      }
      renderMapOverlay();
      const next = mapOverlayEl.querySelectorAll(".map-tile-hit")[state.ui.keyboardFocusIndex];
      next?.focus();
    });

    mapOverlayEl.append(button);
  });
}

function filteredRunsForList(runs) {
  const search = state.ui.queueSearch.trim().toLowerCase();
  const { phase, status, agentType } = state.ui.queueFilters;
  return runs.filter((run) => {
    if (search && !`${run.label} ${run.agentId}`.toLowerCase().includes(search)) return false;
    if (phase !== "all") {
      if (phase === "approval") {
        if (!run.requiresHumanGate) return false;
      } else if (run.currentPhase !== phase) {
        return false;
      }
    }
    if (status !== "all" && run.operationalStatus !== status) return false;
    if (agentType !== "all" && inferAgentType(run) !== agentType) return false;
    return true;
  });
}

function renderNeedsAttentionQueue(runs) {
  const queueRuns = runs
    .filter((run) => run.requiresHumanGate || (ATTENTION_RANK[run.needsAttentionSeverity] || 0) >= ATTENTION_RANK.info)
    .sort(queueSort);

  attentionQueueEl.innerHTML = "";
  for (const run of queueRuns) {
    const token = STATUS_TOKENS[run.operationalStatus] || STATUS_TOKENS.waiting;
    const li = document.createElement("li");
    li.className = `attn-card ${severityClass(run.needsAttentionSeverity)}${run.runId === state.ui.selectedAgentRunId ? " selected" : ""}`;
    li.dataset.runId = run.runId;

    const iconType = inferAgentType(run) === "simulated" ? "🧪" : inferAgentType(run) === "manual" ? "🛠" : "🤖";
    const phaseLabel = run.requiresHumanGate ? "approval" : run.currentPhase;
    const latestAlert = run.alertFeed.at(-1);
    const alertText = latestAlert?.message || run.blockedReason || run.approvalSummary || "Attention required";

    li.innerHTML = `
      <div class="attn-head">
        <span>${iconType} ${run.label.replace(/^codex:/, "")}</span>
        <span class="state-badge ${token.className}">${token.icon} ${run.operationalStatus}</span>
      </div>
      <div class="attn-sub">Phase: ${phaseLabel}</div>
      <div class="attn-sub">${alertText}</div>
      <div class="attn-sub">Blocked since: ${run.blockedSinceTs ? ageText(run.blockedSinceTs) : "n/a"}</div>
      <div class="attn-actions">
        <button type="button" data-action="approve" data-run-id="${run.runId}">Approve</button>
        <button type="button" data-action="restart" data-run-id="${run.runId}">Restart</button>
        <button type="button" data-action="failure" data-run-id="${run.runId}">View failure</button>
        <button type="button" data-action="input" data-run-id="${run.runId}">Provide input</button>
        <button type="button" data-action="open" data-run-id="${run.runId}">Open agent</button>
      </div>
    `;

    attentionQueueEl.append(li);
  }

  if (queueRuns.length === 0) {
    const li = document.createElement("li");
    li.className = "attn-card";
    li.textContent = "No agents currently need attention.";
    attentionQueueEl.append(li);
  }
}

function renderAgentTable(runs) {
  const filtered = filteredRunsForList(runs).sort((a, b) => (b.lastActionTs || 0) - (a.lastActionTs || 0));
  agentTableBodyEl.innerHTML = "";
  for (const run of filtered) {
    const tr = document.createElement("tr");
    tr.className = `agent-row${run.runId === state.ui.selectedAgentRunId ? " selected" : ""}`;
    tr.dataset.runId = run.runId;
    tr.tabIndex = 0;

    tr.innerHTML = `
      <td>${run.label.replace(/^codex:/, "")}</td>
      <td>${run.requiresHumanGate ? "approval" : run.currentPhase}</td>
      <td><span class="state-badge ${(STATUS_TOKENS[run.operationalStatus] || STATUS_TOKENS.waiting).className}">${run.operationalStatus}</span></td>
      <td>${formatDuration(run.runtimeMs)}</td>
      <td>${run.lastActionTs ? ageText(run.lastActionTs) : "n/a"}</td>
    `;

    tr.addEventListener("click", () => selectRun(run.runId));
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectRun(run.runId);
      }
    });

    agentTableBodyEl.append(tr);
  }
}

function renderApprovalStreet(runs) {
  const approvals = runs.filter((run) => run.requiresHumanGate).sort(queueSort);
  approvalCountEl.textContent = `${approvals.length} pending`;
  if (approvals.length > 0) setApprovalStreetExpanded(true);
  if (approvals.length === 0 && state.ui.approvalStreetExpanded && !state.ui.approvalStreetManual) {
    setApprovalStreetExpanded(false);
  }
  approvalListEl.innerHTML = "";

  for (const run of approvals) {
    const div = document.createElement("article");
    div.className = "approval-tile";
    div.dataset.runId = run.runId;
    div.innerHTML = `
      <strong>🧍 ${run.label.replace(/^codex:/, "")}</strong>
      <span>${run.approvalSummary || "Awaiting approval"}</span>
      <span>Risk: ${run.approvalRisk.toUpperCase()}</span>
      <button type="button" data-action="approve" data-run-id="${run.runId}">Approve</button>
    `;
    div.addEventListener("click", () => selectRun(run.runId));
    approvalListEl.append(div);
  }

  if (approvals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No pending approvals.";
    approvalListEl.append(empty);
  }
}

function renderDrawer() {
  const run = getActiveRunForView();
  if (!run) {
    drawerTitleEl.textContent = "No agent selected";
    drawerTaskEl.textContent = "Select an agent tile, queue card, or table row.";
    drawerLastSuccessEl.textContent = "Last success: n/a";
    drawerBlockerEl.textContent = "Blocker: none";
    drawerRecommendationsEl.innerHTML = "";
    drawerEventsEl.innerHTML = "";
    return;
  }

  drawerTitleEl.textContent = run.label;
  drawerTaskEl.textContent = run.timeline.at(-1)?.summary || "No event captured yet.";
  drawerLastSuccessEl.textContent = `Last success: ${run.lastSuccessTs ? ageText(run.lastSuccessTs) : "n/a"}`;
  drawerBlockerEl.textContent = `Blocker: ${blockerLabel(run.blockerClass)}`;

  drawerRecommendationsEl.innerHTML = "";
  for (const rec of actionRecommendations(run)) {
    const li = document.createElement("li");
    li.textContent = rec;
    drawerRecommendationsEl.append(li);
  }

  const events = run.timeline.slice(-20).reverse();
  drawerEventsEl.innerHTML = "";
  for (const event of events) {
    const li = document.createElement("li");
    li.textContent = `${new Date(event.ts).toLocaleTimeString()} | ${event.summary}`;
    drawerEventsEl.append(li);
  }
}

function renderReplayUi() {
  const sourceRun = state.replay.active ? state.runs.get(state.replay.sourceRunId) : getSelectedRealRun();
  const max = sourceRun ? sourceRun.rawEvents.length : 0;
  replaySliderEl.max = String(max);

  if (state.replay.active) {
    replaySliderEl.value = String(state.replay.index);
    replayInfoEl.textContent = `Replay ${state.replay.index}/${max} at ${state.replay.speed}x`;
    playPauseBtnEl.textContent = state.replay.playing ? "Pause" : "Play";
  } else {
    replaySliderEl.value = String(max);
    replayInfoEl.textContent = "Replay: live mode";
    playPauseBtnEl.textContent = "Play";
  }
}

function renderWsStatus() {
  renderGlobalHud();
}

function renderUi() {
  updateAllDerived();
  const runs = getRunsForView();
  renderGlobalHud();
  drawMap();
  renderNeedsAttentionQueue(runs);
  renderAgentTable(runs);
  renderApprovalStreet(runs);
  renderDrawer();
  renderReplayUi();
}

function connectWebSocket() {
  if (state.ws.reconnectTimer) {
    clearTimeout(state.ws.reconnectTimer);
    state.ws.reconnectTimer = null;
  }

  if (state.ws.socket) {
    state.ws.manualReconnect = true;
    state.ws.socket.close();
    state.ws.socket = null;
    state.ws.manualReconnect = false;
  }

  state.ws.status = "connecting";
  renderWsStatus();

  let socket;
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  state.ws.socket = socket;

  socket.addEventListener("open", () => {
    state.ws.status = "connected";
    state.ws.attempts = 0;
    renderWsStatus();
  });

  socket.addEventListener("message", (message) => {
    const payload = typeof message.data === "string" ? message.data : "";
    if (!payload) return;
    try {
      ingestRawEvent(JSON.parse(payload));
    } catch {
      ingestRawEvent({ type: "dashboard.parse.error", ts: nowMs(), message: "Invalid websocket payload" });
    }
  });

  socket.addEventListener("error", () => {
    state.ws.status = "error";
    renderWsStatus();
  });

  socket.addEventListener("close", () => {
    state.ws.socket = null;
    if (state.ws.manualReconnect) return;
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  const delay = Math.min(10000, 500 * 2 ** state.ws.attempts);
  state.ws.status = `reconnecting in ${(delay / 1000).toFixed(1)}s`;
  renderWsStatus();
  state.ws.attempts += 1;
  state.ws.reconnectTimer = window.setTimeout(() => {
    connectWebSocket();
  }, delay);
}

function startReplay(runId) {
  const sourceRun = state.runs.get(runId);
  if (!sourceRun) return;

  stopReplayTimer();
  state.replay.active = true;
  state.replay.playing = false;
  state.replay.sourceRunId = runId;
  state.replay.index = 0;
  state.replay.speed = Number(replaySpeedEl.value) || 1;
  state.replay.previewRun = createRun({
    runId: `replay:${runId}`,
    agentId: `${sourceRun.agentId}:replay`,
    label: sourceRun.label,
  });
  rebuildReplayPreview();
}

function rebuildReplayPreview() {
  const sourceRun = state.runs.get(state.replay.sourceRunId);
  if (!sourceRun) {
    stopReplay();
    return;
  }

  const preview = createRun({
    runId: `replay:${sourceRun.runId}`,
    agentId: `${sourceRun.agentId}:replay`,
    label: sourceRun.label,
  });

  const max = clamp(state.replay.index, 0, sourceRun.rawEvents.length);
  for (let i = 0; i < max; i += 1) {
    const raw = sourceRun.rawEvents[i];
    const derived = mapCodexToVizEvents(raw);
    integrateDerivedSet(preview, raw, derived, { skipPersistence: true });
  }

  state.replay.previewRun = preview;
  updateRunDerivedFields(preview);
}

function startReplayTimer() {
  stopReplayTimer();
  state.replay.timer = window.setInterval(() => {
    const sourceRun = state.runs.get(state.replay.sourceRunId);
    if (!sourceRun) {
      stopReplay();
      renderUi();
      return;
    }

    state.replay.index = Math.min(sourceRun.rawEvents.length, state.replay.index + state.replay.speed);
    rebuildReplayPreview();

    if (state.replay.index >= sourceRun.rawEvents.length) {
      state.replay.playing = false;
      stopReplayTimer();
    }

    renderUi();
  }, 340);
}

function stopReplayTimer() {
  if (state.replay.timer) {
    clearInterval(state.replay.timer);
    state.replay.timer = null;
  }
}

function stopReplay() {
  stopReplayTimer();
  state.replay.active = false;
  state.replay.playing = false;
  state.replay.sourceRunId = null;
  state.replay.previewRun = null;
  state.replay.index = 0;
}

function exportSelectedRun() {
  const run = getSelectedRealRun();
  if (!run) return;
  const lines = run.rawEvents.map((event) => JSON.stringify(event)).join("\n");
  const blob = new Blob([lines], { type: "application/jsonl" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${run.label.replace(/[^a-z0-9:_-]/gi, "_")}.jsonl`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importRunFromFile(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const events = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") events.push(parsed);
    } catch {
      // ignore
    }
  }

  if (events.length === 0) return;

  state.manualRunCounter += 1;
  const runId = `manual:${state.manualRunCounter}`;
  ensureRun(runId, {
    manual: true,
    agentId: `codex:run:${state.manualRunCounter}`,
    label: `codex:run:${state.manualRunCounter}`,
  });

  for (const event of events) {
    ingestRawEvent(event, { forceRunId: runId, skipPersistence: true });
  }

  state.activeManualRunId = runId;
  selectRun(runId);
  queuePersistence();
  renderUi();
}

function clearSimulatorTimers() {
  for (const timer of state.simulatorTimers) clearInterval(timer);
  state.simulatorTimers.length = 0;
}

function runScenario(name) {
  const events = scenarioEvents(name);
  let index = 0;
  const timer = window.setInterval(() => {
    const event = events[index];
    if (!event) {
      clearInterval(timer);
      return;
    }

    ingestRawEvent({ ...event, ts: nowMs() });
    if (event.run_id) {
      const runId = `explicit:${sanitizeRunIdentity(event.run_id)}`;
      if (state.runs.has(runId)) selectRun(runId);
    }
    index += 1;
  }, 900);
  state.simulatorTimers.push(timer);
}

function runSimulatorPack() {
  clearSimulatorTimers();
  runScenario("scolded");
  window.setTimeout(() => runScenario("longtask"), 400);
  window.setTimeout(() => runScenario("asleep"), 800);
}

function runFullSimulationDemo() {
  runSimulatorPack();
}

function scenarioEvents(name) {
  if (name === "scolded") {
    return [
      { type: "turn.started", run_id: "sim-scolded", message: "Start fixing lint in frontend" },
      { type: "tool.exec", run_id: "sim-scolded", tool: "Bash", message: "npm test -- ui", path: "ui/navbar.tsx" },
      { type: "tool.failed", run_id: "sim-scolded", message: "same error: expected 2 got 3", path: "tests/ui/navbar.test.ts" },
      { type: "tool.exec", run_id: "sim-scolded", tool: "Edit", message: "patch component", path: "ui/navbar.tsx" },
      { type: "tool.failed", run_id: "sim-scolded", message: "same error: expected 2 got 3", path: "tests/ui/navbar.test.ts" },
      { type: "note", run_id: "sim-scolded", message: "waiting for approval to rerun test" },
      { type: "turn.completed", run_id: "sim-scolded", message: "stopped after repeated failure" },
    ];
  }

  if (name === "longtask") {
    return [
      { type: "turn.started", run_id: "sim-longtask", message: "Refactor infra pipeline" },
      { type: "tool.run", run_id: "sim-longtask", tool: "Read", message: "scan terraform", path: "infra/terraform/main.tf" },
      { type: "tool.run", run_id: "sim-longtask", tool: "Bash", message: "terraform plan", path: "infra/terraform/main.tf" },
      { type: "tool.failed", run_id: "sim-longtask", tool: "Bash", message: "dependency lock: waiting on service" },
      { type: "tool.run", run_id: "sim-longtask", tool: "Edit", message: "small update", path: "infra/deploy.yaml" },
      { type: "item.succeeded", run_id: "sim-longtask", message: "plan validated", path: "infra/deploy.yaml" },
      { type: "turn.completed", run_id: "sim-longtask", message: "long task wrapped" },
    ];
  }

  return [
    { type: "turn.started", run_id: "sim-asleep", message: "Waiting for instruction" },
    { type: "tool.run", run_id: "sim-asleep", tool: "Read", message: "Open task context", path: "README.md" },
    { type: "note", run_id: "sim-asleep", message: "No next action provided" },
    { type: "note", run_id: "sim-asleep", message: "Agent idle" },
    { type: "turn.completed", run_id: "sim-asleep", message: "Paused" },
  ];
}

function setupEventHandlers() {
  opsTabEl.addEventListener("click", () => setOpsDrawerOpen(!state.ui.opsDrawerOpen));
  opsDrawerCloseEl.addEventListener("click", () => setOpsDrawerOpen(false));
  opsBackdropEl.addEventListener("click", () => setOpsDrawerOpen(false));
  agentDrawerCloseEl.addEventListener("click", () => setAgentDrawerOpen(false));
  agentDrawerBackdropEl.addEventListener("click", () => setAgentDrawerOpen(false));

  opsDevtoolsToggleEl.addEventListener("click", () => {
    setOpsDevtoolsExpanded(!state.ui.opsDevtoolsExpanded);
  });

  summaryNeedsAttentionEl.addEventListener("click", () => {
    setOpsDrawerOpen(true);
    attentionQueueEl.scrollTo({ top: 0, behavior: "smooth" });
  });

  summaryStalledEl.addEventListener("click", () => {
    setOpsDrawerOpen(true);
    attentionQueueEl.scrollTo({ top: 0, behavior: "smooth" });
  });

  summaryApprovalsEl.addEventListener("click", () => {
    setApprovalStreetExpanded(true, { manual: true });
  });

  summaryFirstAnomalyEl.addEventListener("click", () => {
    if (!state.ui.summaryFocusRunId) return;
    jumpToFirstAnomaly(state.ui.summaryFocusRunId);
  });

  summaryPrimaryCtaEl.addEventListener("click", () => {
    setOpsDrawerOpen(true);
  });

  summaryRunSimBtnEl.addEventListener("click", () => {
    runFullSimulationDemo();
  });

  approvalStreetToggleEl.addEventListener("click", () => {
    setApprovalStreetExpanded(!state.ui.approvalStreetExpanded, { manual: true });
  });

  newRunBtnEl.addEventListener("click", () => {
    state.manualRunCounter += 1;
    const runId = `manual:${state.manualRunCounter}`;
    ensureRun(runId, {
      manual: true,
      agentId: `codex:run:${state.manualRunCounter}`,
      label: `codex:run:${state.manualRunCounter}`,
    });
    state.activeManualRunId = runId;
    selectRun(runId);
  });

  reconnectBtnEl.addEventListener("click", () => {
    state.ws.attempts = 0;
    connectWebSocket();
  });

  simScoldedBtnEl.addEventListener("click", () => runScenario("scolded"));
  simLongtaskBtnEl.addEventListener("click", () => runScenario("longtask"));
  simAsleepBtnEl.addEventListener("click", () => runScenario("asleep"));
  simPackBtnEl.addEventListener("click", () => runSimulatorPack());

  reducedMotionToggleEl.addEventListener("change", () => {
    state.ui.reducedMotion = reducedMotionToggleEl.checked;
    document.body.classList.toggle("reduced-motion", state.ui.reducedMotion);
    persistSettings();
  });

  colorblindToggleEl.addEventListener("change", () => {
    state.ui.colorblindPalette = colorblindToggleEl.checked;
    document.body.classList.toggle("colorblind", state.ui.colorblindPalette);
    persistSettings();
    renderUi();
  });

  tileSizeSelectEl.addEventListener("change", () => {
    state.ui.tileSize = tileSizeSelectEl.value;
    persistSettings();
    renderUi();
  });

  const updateFilter = () => {
    state.ui.queueSearch = agentSearchEl.value;
    state.ui.queueFilters.phase = phaseFilterEl.value;
    state.ui.queueFilters.status = statusFilterEl.value;
    state.ui.queueFilters.agentType = typeFilterEl.value;
    persistSettings();
    renderUi();
  };

  agentSearchEl.addEventListener("input", updateFilter);
  phaseFilterEl.addEventListener("change", updateFilter);
  statusFilterEl.addEventListener("change", updateFilter);
  typeFilterEl.addEventListener("change", updateFilter);

  attentionQueueEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest("[data-run-id]");
    const runId = button?.dataset.runId || card?.dataset.runId;
    if (!runId) return;

    const action = button?.dataset.action;
    if (!action) {
      selectRun(runId);
      return;
    }

    if (action === "approve") {
      approveRun(runId);
      return;
    }
    if (action === "restart") {
      restartRun(runId);
      return;
    }
    if (action === "failure") {
      selectRun(runId, { drawerMode: "failure" });
      return;
    }
    if (action === "input") {
      const text = window.prompt("Provide operator input:", "");
      if (text) provideInput(runId, text);
      return;
    }
    if (action === "open") {
      selectRun(runId, { drawerMode: "overview" });
    }
  });

  approvalListEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='approve']");
    if (!button) return;
    approveRun(button.dataset.runId);
  });

  approveNextBtnEl.addEventListener("click", () => {
    const approvals = getRunsForView().filter((run) => run.requiresHumanGate).sort(queueSort);
    if (approvals[0]) approveRun(approvals[0].runId);
  });

  batchApproveBtnEl.addEventListener("click", () => {
    const approvals = getRunsForView().filter((run) => run.requiresHumanGate);
    if (approvals.length === 0) return;
    if (!window.confirm(`Approve all ${approvals.length} pending items?`)) return;
    for (const run of approvals) approveRun(run.runId);
  });

  jumpFirstAnomalyBtnEl.addEventListener("click", () => {
    const run = getSelectedRealRun();
    if (run) jumpToFirstAnomaly(run.runId);
  });

  provideInputBtnEl.addEventListener("click", () => {
    const run = getSelectedRealRun();
    if (!run) return;
    const text = window.prompt("Provide operator input:", "");
    if (text) provideInput(run.runId, text);
  });

  replaySpeedEl.addEventListener("change", () => {
    state.replay.speed = Number(replaySpeedEl.value) || 1;
    if (state.replay.playing) startReplayTimer();
    renderReplayUi();
  });

  replaySliderEl.addEventListener("input", () => {
    const sourceRun = getSelectedRealRun();
    if (!sourceRun) return;
    if (!state.replay.active || state.replay.sourceRunId !== sourceRun.runId) startReplay(sourceRun.runId);
    state.replay.index = clamp(Number(replaySliderEl.value) || 0, 0, sourceRun.rawEvents.length);
    rebuildReplayPreview();
    renderUi();
  });

  playPauseBtnEl.addEventListener("click", () => {
    const sourceRun = getSelectedRealRun();
    if (!sourceRun) return;
    if (!state.replay.active || state.replay.sourceRunId !== sourceRun.runId) startReplay(sourceRun.runId);
    state.replay.playing = !state.replay.playing;
    if (state.replay.playing) startReplayTimer();
    else stopReplayTimer();
    renderReplayUi();
  });

  liveViewBtnEl.addEventListener("click", () => {
    stopReplay();
    renderUi();
  });

  exportRunBtnEl.addEventListener("click", () => exportSelectedRun());

  importRunInputEl.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importRunFromFile(file);
    importRunInputEl.value = "";
  });

  window.addEventListener("resize", () => renderMapOverlay());
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.ui.agentDrawerOpen) setAgentDrawerOpen(false);
    if (state.ui.opsDrawerOpen) setOpsDrawerOpen(false);
  });
}

let lastFrameAt = performance.now();
function frame(now) {
  if (now - lastFrameAt > 250) {
    lastFrameAt = now;
    renderGlobalHud();
    drawMap();
    renderNeedsAttentionQueue(getRunsForView());
    renderApprovalStreet(getRunsForView());
    if (state.ui.criticalToastUntil && nowMs() > state.ui.criticalToastUntil) {
      state.ui.criticalToastUntil = 0;
      opsToastEl.hidden = true;
    }
  }
  requestAnimationFrame(frame);
}

async function boot() {
  ensureMainRun();
  try {
    await preloadCharacterSprites();
  } catch (error) {
    if (!CHARACTER_SPRITES.warned) {
      CHARACTER_SPRITES.warned = true;
      console.error("[character-sprites] preload crashed, using fallback silhouette", error);
    }
  }
  try {
    await preloadCityArt();
  } catch (error) {
    state.ui.cityArtEnabled = false;
    console.error("[city-art] preload crashed, using vector street fallback", error);
  }
  restoreSettings();
  restoreRunsFromStorage();
  setupEventHandlers();
  setOpsDrawerOpen(false);
  setAgentDrawerOpen(false);
  setApprovalStreetExpanded(false);
  setOpsDevtoolsExpanded(false);
  connectWebSocket();
  state.replay.speed = Number(replaySpeedEl.value) || 1;
  updateAllDerived();
  renderUi();
  requestAnimationFrame(frame);
}

window.dispatchAgentEvent = (event) => {
  ingestRawEvent(event);
};

window.agentVizDemo = {
  runScenario,
  runSimulatorPack,
  dispatch: (event) => window.dispatchAgentEvent(event),
  approveRun,
  restartRun,
  provideInput,
  jumpToFirstAnomaly,
};

boot();
