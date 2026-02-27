import {
  mapCodexToVizEvents,
  extractRunIdentity,
  getRawEventTimestamp,
  getRawEventType,
} from "./mapping.js";

const WS_URL = "ws://localhost:8787";
const DIFF_HELPER_URL = "http://localhost:8790";
const STORAGE_KEY = "agent-viz-runs-v2";
const SETTINGS_KEY = "agent-viz-settings-v1";

const WORLD = {
  width: 1280,
  height: 720,
  tile: 16,
};

const DISTRICTS = {
  CBD: { x: 8, y: 8, w: 20, h: 12, color: "#5c88d5", glow: "#9ac1ff" },
  Bugis: { x: 32, y: 8, w: 18, h: 12, color: "#59b885", glow: "#9de6c0" },
  Jurong: { x: 8, y: 24, w: 20, h: 13, color: "#d88b4f", glow: "#ffbe8a" },
  Changi: { x: 52, y: 24, w: 20, h: 13, color: "#6ea4c5", glow: "#ace0f7" },
};

const HQ = { x: 40, y: 21 };
const MARINA = { x: 34, y: 22, w: 13, h: 8 };

const DISTRICT_TOOL_HINTS = {
  Changi: /(test|tests|__tests__|pytest|jest|vitest|assert)/,
  Jurong: /(infra|docker|k8s|terraform|helm|deploy|pipeline|ci|cd|config)/,
  Bugis: /(ui|frontend|component|css|html|view|react|vue|svelte)/,
  CBD: /.*/,
};

const AUNTIE_LINES = [
  "Aiya, same error again.",
  "Show logs first lah.",
  "Scope too big, break down can?",
];
const UNCLE_LINES = ["Check env and configs."];
const MRT_LINES = ["Train running, agent busy."];

const NPCS = {
  auntie: { x: 4, y: 30, color: "#f2be8f", label: "Auntie Debug" },
  uncle: { x: 18, y: 38, color: "#9ed9ff", label: "Uncle Ops" },
  mrt: { x: 49, y: 16, color: "#ffd87f", label: "MRT Controller" },
};

const canvas = document.getElementById("cityCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const wsStatusEl = document.getElementById("wsStatus");
const repoPathInputEl = document.getElementById("repoPathInput");
const useGitDiffToggleEl = document.getElementById("useGitDiffToggle");
const setRepoBtnEl = document.getElementById("setRepoBtn");
const reconnectBtnEl = document.getElementById("reconnectBtn");
const helperStatusEl = document.getElementById("helperStatus");
const newRunBtnEl = document.getElementById("newRunBtn");
const simPackBtnEl = document.getElementById("simPackBtn");
const simScoldedBtnEl = document.getElementById("simScoldedBtn");
const simLongtaskBtnEl = document.getElementById("simLongtaskBtn");
const simAsleepBtnEl = document.getElementById("simAsleepBtn");
const runListEl = document.getElementById("runList");
const stuckBannerEl = document.getElementById("stuckBanner");
const runBadgeEl = document.getElementById("runBadge");
const playPauseBtnEl = document.getElementById("playPauseBtn");
const liveViewBtnEl = document.getElementById("liveViewBtn");
const replaySpeedEl = document.getElementById("replaySpeed");
const exportRunBtnEl = document.getElementById("exportRunBtn");
const importRunInputEl = document.getElementById("importRunInput");
const replaySliderEl = document.getElementById("replaySlider");
const replayInfoEl = document.getElementById("replayInfo");
const timelineListEl = document.getElementById("timelineList");
const metricDurationEl = document.getElementById("metricDuration");
const metricToolCountEl = document.getElementById("metricToolCount");
const metricFileCountEl = document.getElementById("metricFileCount");
const metricErrorCountEl = document.getElementById("metricErrorCount");
const metricSuccessCountEl = document.getElementById("metricSuccessCount");
const metricStuckEl = document.getElementById("metricStuck");
const interventionTextEl = document.getElementById("interventionText");
const inspectorSummaryEl = document.getElementById("inspectorSummary");
const inspectorRawEl = document.getElementById("inspectorRaw");

const staticLayer = buildStaticLayer();

const state = {
  runs: new Map(),
  runOrder: [],
  selectedRunId: null,
  activeManualRunId: null,
  manualRunCounter: 0,
  timelineSelectionByRun: new Map(),
  timelineEventId: 1,
  ws: {
    socket: null,
    status: "connecting",
    attempts: 0,
    reconnectTimer: null,
    manualReconnect: false,
  },
  git: {
    repoPath: "",
    useGitDiff: false,
    lastPollAt: 0,
    lastFingerprint: "",
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

function statusClass(status) {
  if (status === "working") return "status-working";
  if (status === "error") return "status-error";
  if (status === "done") return "status-done";
  return "status-idle";
}

function sanitizeRunIdentity(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-:]+|[-:]+$/g, "")
    .slice(0, 80);
}

function districtFromPath(filePath) {
  const value = String(filePath || "").toLowerCase();
  if (/(^|\/)(tests|test|__tests__)(\/|$)/.test(value)) return "Changi";
  if (/(infra|docker|k8s|terraform|helm|ansible)/.test(value)) return "Jurong";
  if (/(ui|frontend|component|components|styles|css|web)/.test(value)) return "Bugis";
  return "CBD";
}

function districtFromText(text) {
  const lower = String(text || "").toLowerCase();
  for (const [district, pattern] of Object.entries(DISTRICT_TOOL_HINTS)) {
    if (pattern.test(lower)) return district;
  }
  return "CBD";
}

function tileToPx(col, row) {
  return {
    x: col * WORLD.tile,
    y: row * WORLD.tile,
  };
}

function districtCenterPx(name) {
  const d = DISTRICTS[name] || DISTRICTS.CBD;
  return {
    x: (d.x + d.w / 2) * WORLD.tile,
    y: (d.y + d.h / 2) * WORLD.tile,
  };
}

function formatTime(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString();
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min > 0) return `${min}m ${rem}s`;
  return `${sec}s`;
}

function levelFromTouches(touches) {
  if (touches >= 5) return 3;
  if (touches >= 2) return 2;
  return 1;
}

function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeDistrictSlots() {
  const all = {};
  for (const [district, bounds] of Object.entries(DISTRICTS)) {
    const slots = [];
    let i = 0;
    for (let y = bounds.y + 2; y <= bounds.y + bounds.h - 3; y += 3) {
      for (let x = bounds.x + 2; x <= bounds.x + bounds.w - 4; x += 4) {
        slots.push({ district, index: i, col: x, row: y });
        i += 1;
      }
    }
    all[district] = slots;
  }
  return all;
}

const DISTRICT_SLOTS = makeDistrictSlots();

function createEmptyNpcState() {
  return {
    auntie: { text: "", until: 0, nextIndex: 0 },
    uncle: { text: "", until: 0, nextIndex: 0 },
    mrt: { text: "", until: 0, nextIndex: 0 },
  };
}

function createRun({ runId, agentId, label, manual = false, simulated = false }) {
  return {
    runId,
    agentId,
    label,
    manual,
    simulated,
    status: "idle",
    createdAt: nowMs(),
    firstTs: null,
    lastTs: null,
    rawEvents: [],
    timeline: [],
    toolCount: 0,
    fileCount: 0,
    errorCount: 0,
    successCount: 0,
    noteCount: 0,
    fileStats: new Map(),
    slotStats: {
      CBD: new Map(),
      Bugis: new Map(),
      Jurong: new Map(),
      Changi: new Map(),
    },
    districtTouches: {
      CBD: 0,
      Bugis: 0,
      Jurong: 0,
      Changi: 0,
    },
    vehicles: [],
    effects: [],
    toolTimes: [],
    fileTimes: [],
    errorSignatures: [],
    failureStreak: 0,
    lastToolAt: 0,
    lastFileChangeAt: 0,
    stuckScore: 0,
    stuckReason: "",
    intervention: "No intervention needed yet.",
    npcs: createEmptyNpcState(),
    lastBubbleAt: {
      auntie: 0,
      uncle: 0,
      mrt: 0,
    },
    highlight: null,
  };
}

function getRunLabelFromIdentity(identity) {
  if (!identity) return "codex:main";
  return `codex:${identity}`;
}

function ensureRun(runId, { agentId, label, manual = false, simulated = false } = {}) {
  if (state.runs.has(runId)) return state.runs.get(runId);

  const run = createRun({
    runId,
    agentId: agentId || `codex:${runId}`,
    label: label || agentId || `codex:${runId}`,
    manual,
    simulated,
  });

  state.runs.set(runId, run);
  state.runOrder.unshift(runId);
  if (!state.selectedRunId) state.selectedRunId = runId;
  return run;
}

function ensureMainRun() {
  const run = ensureRun("main", {
    agentId: "codex:main",
    label: "codex:main",
  });

  if (!state.activeManualRunId) {
    state.activeManualRunId = run.runId;
  }
}

function pickRunForRawEvent(rawEvent, forceRunId = null) {
  if (forceRunId) {
    const forced = ensureRun(forceRunId, {
      agentId: forceRunId.startsWith("manual:")
        ? `codex:run:${forceRunId.split(":")[1] || "manual"}`
        : `codex:${forceRunId}`,
      label: forceRunId.startsWith("manual:")
        ? `codex:run:${forceRunId.split(":")[1] || "manual"}`
        : `codex:${forceRunId}`,
    });
    return forced;
  }

  const identity = sanitizeRunIdentity(extractRunIdentity(rawEvent));
  if (identity) {
    const runId = `explicit:${identity}`;
    const run = ensureRun(runId, {
      agentId: getRunLabelFromIdentity(identity),
      label: getRunLabelFromIdentity(identity),
      simulated: identity.startsWith("sim-"),
    });
    return run;
  }

  return ensureRun(state.activeManualRunId || "main", {
    agentId:
      state.activeManualRunId && state.activeManualRunId.startsWith("manual:")
        ? `codex:run:${state.activeManualRunId.split(":")[1] || "main"}`
        : "codex:main",
    label:
      state.activeManualRunId && state.activeManualRunId.startsWith("manual:")
        ? `codex:run:${state.activeManualRunId.split(":")[1] || "main"}`
        : "codex:main",
  });
}

function pruneTimes(list, now, windowMs) {
  while (list.length > 0 && now - list[0] > windowMs) {
    list.shift();
  }
}

function rotateLine(run, who, lines, cooldownMs = 5000) {
  const now = nowMs();
  if (now - run.lastBubbleAt[who] < cooldownMs) return;
  const npc = run.npcs[who];
  const next = lines[npc.nextIndex % lines.length];
  npc.text = next;
  npc.until = now + 5000;
  npc.nextIndex += 1;
  run.lastBubbleAt[who] = now;
}

function applyDerivedEvent(run, derived, options = {}) {
  const transient = options.transient !== false;
  const ts = derived.ts || nowMs();
  const rawType = derived.rawType || "unknown";
  const text = `${rawType} ${derived.message || ""}`.toLowerCase();

  if (run.firstTs === null) run.firstTs = ts;
  run.lastTs = Math.max(run.lastTs || 0, ts);

  if (derived.kind === "step.started") {
    run.status = "working";
  }

  if (derived.kind === "step.ended") {
    if (run.status !== "error") {
      run.status = "done";
    }
  }

  if (derived.kind === "tool.activity") {
    run.toolCount += 1;
    run.lastToolAt = ts;
    run.toolTimes.push(ts);
    run.status = "working";

    const district = districtFromText(`${text} ${derived.toolName || ""}`);
    if (transient) spawnVehicle(run, district, derived.toolName || "tool");

    if (run.toolTimes.length >= 6) {
      rotateLine(run, "mrt", MRT_LINES, 4000);
    }
  }

  if (derived.kind === "file.changed" && derived.filePath) {
    run.fileCount += 1;
    run.lastFileChangeAt = ts;
    run.fileTimes.push(ts);

    const district = districtFromPath(derived.filePath);
    run.districtTouches[district] += 1;

    const slots = DISTRICT_SLOTS[district];
    const slotIndex = hashString(derived.filePath) % slots.length;

    const previous = run.fileStats.get(derived.filePath) || {
      touches: 0,
      district,
      slotIndex,
    };

    previous.touches += 1;
    previous.district = district;
    previous.slotIndex = slotIndex;
    run.fileStats.set(derived.filePath, previous);

    const slotMap = run.slotStats[district];
    const slotState = slotMap.get(slotIndex) || { touches: 0, level: 1, filePath: derived.filePath };
    slotState.touches += 1;
    slotState.level = Math.max(slotState.level, levelFromTouches(previous.touches));
    slotState.filePath = derived.filePath;
    slotMap.set(slotIndex, slotState);
  }

  if (derived.kind === "error") {
    run.errorCount += 1;
    run.failureStreak += 1;
    run.status = "error";

    const signature = derived.signature || (derived.message || rawType).toLowerCase().slice(0, 90);
    run.errorSignatures.push({ ts, signature });

    const district = districtFromText(`${text} ${derived.message || ""}`);
    if (transient) {
      spawnBeacon(run, district);
      spawnSmoke(run, district);
    }

    rotateLine(run, "auntie", AUNTIE_LINES, 2600);

    if (district === "Jurong") {
      rotateLine(run, "uncle", UNCLE_LINES, 3600);
    }
  }

  if (derived.kind === "success") {
    run.successCount += 1;
    run.failureStreak = 0;
    if (run.status !== "error") {
      run.status = "done";
    }

    if (transient) {
      spawnFireworks(run);
    }
  }

  if (derived.kind === "note") {
    run.noteCount += 1;
  }

  if (/codex\.exit/.test(rawType.toLowerCase())) {
    if (String(derived.message || "").includes("0")) {
      run.status = "done";
    }
  }
}

function evaluateStuck(run, clock = nowMs()) {
  const windowMs = 2 * 60 * 1000;

  pruneTimes(run.toolTimes, clock, windowMs);
  pruneTimes(run.fileTimes, clock, windowMs);

  while (run.errorSignatures.length > 0 && clock - run.errorSignatures[0].ts > windowMs) {
    run.errorSignatures.shift();
  }

  const signatureCounts = new Map();
  for (const item of run.errorSignatures) {
    signatureCounts.set(item.signature, (signatureCounts.get(item.signature) || 0) + 1);
  }

  const repeatedError = Array.from(signatureCounts.values()).some((count) => count >= 2);
  const busyNoFile = run.toolTimes.length >= 5 && run.fileTimes.length === 0;
  const failureSpree = run.failureStreak >= 3;

  let score = 0;
  if (repeatedError) score += 0.45;
  if (busyNoFile) score += 0.35;
  if (failureSpree) score += 0.3;
  if (run.status === "error") score += 0.12;

  run.stuckScore = clamp(score, 0, 1);

  if (run.stuckScore > 0.7) {
    if (busyNoFile) {
      run.stuckReason = "Tool loops are active but files are not changing.";
      run.intervention = "Ask the agent to summarise what it tried and propose next steps";
    } else {
      run.stuckReason = "Repeated failures detected.";
      run.intervention = "Try narrowing scope and asking for one failing test only";
    }
    rotateLine(run, "auntie", AUNTIE_LINES, 2200);
  } else {
    run.stuckReason = "";
    run.intervention = "No intervention needed yet.";
  }
}

function summariseEvent(derivedEvents) {
  const kinds = derivedEvents.map((item) => item.kind);

  if (kinds.includes("error")) {
    const err = derivedEvents.find((item) => item.kind === "error");
    return err?.message || "Error";
  }
  if (kinds.includes("file.changed")) {
    const file = derivedEvents.find((item) => item.kind === "file.changed");
    return `Changed ${file?.filePath || "file"}`;
  }
  if (kinds.includes("success")) {
    return "Success signal";
  }
  if (kinds.includes("tool.activity")) {
    const tool = derivedEvents.find((item) => item.kind === "tool.activity");
    return `Tool activity ${tool?.toolName ? `(${tool.toolName})` : ""}`.trim();
  }
  const note = derivedEvents.find((item) => item.kind === "note");
  return note?.message || "Note";
}

function addTimelineRecord(run, rawEvent, derivedEvents) {
  const ts = derivedEvents[0]?.ts || getRawEventTimestamp(rawEvent);
  const rawType = derivedEvents[0]?.rawType || getRawEventType(rawEvent);
  const fileEvent = derivedEvents.find((item) => item.kind === "file.changed");
  const district = fileEvent ? districtFromPath(fileEvent.filePath) : districtFromText(rawType);

  const record = {
    id: state.timelineEventId,
    ts,
    rawType,
    rawEvent,
    derived: derivedEvents,
    summary: summariseEvent(derivedEvents),
    district,
    filePath: fileEvent?.filePath || null,
  };

  state.timelineEventId += 1;

  run.timeline.push(record);
  if (run.timeline.length > 3000) run.timeline.shift();

  return record;
}

function queuePersistence() {
  if (state.persistTimer) return;
  state.persistTimer = window.setTimeout(() => {
    state.persistTimer = null;
    persistRunsToStorage();
  }, 600);
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
    // Ignore localStorage quota errors.
  }
}

function persistSettings() {
  const payload = {
    repoPath: state.git.repoPath,
    useGitDiff: state.git.useGitDiff,
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}

function restoreSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (typeof parsed.repoPath === "string") {
      state.git.repoPath = parsed.repoPath;
    }
    if (typeof parsed.useGitDiff === "boolean") {
      state.git.useGitDiff = parsed.useGitDiff;
    }
  } catch {
    // Ignore invalid settings payload.
  }

  repoPathInputEl.value = state.git.repoPath;
  useGitDiffToggleEl.checked = state.git.useGitDiff;
}

function restoreRunsFromStorage() {
  let parsed = [];
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    parsed = [];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return;

  let maxManualId = 0;

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    if (!item.runId || !Array.isArray(item.rawEvents)) continue;

    const run = ensureRun(item.runId, {
      agentId: item.agentId || `codex:${item.runId}`,
      label: item.label || item.agentId || `codex:${item.runId}`,
      manual: Boolean(item.manual),
      simulated: Boolean(item.simulated),
    });

    run.createdAt = Number(item.createdAt) || run.createdAt;

    for (const rawEvent of item.rawEvents) {
      integrateRawEvent(run, rawEvent, {
        source: "restore",
        transient: false,
        skipPersistence: true,
        allowGitDiff: false,
      });
    }

    run.vehicles = [];
    run.effects = [];

    if (typeof run.runId === "string" && run.runId.startsWith("manual:")) {
      const parsedManual = Number(run.runId.split(":")[1]);
      if (Number.isFinite(parsedManual)) {
        maxManualId = Math.max(maxManualId, parsedManual);
      }
    }
  }

  if (maxManualId > 0) {
    state.manualRunCounter = maxManualId;
  }
}

function ingestRawEvent(rawEvent, options = {}) {
  if (!rawEvent || typeof rawEvent !== "object") return;

  const run = pickRunForRawEvent(rawEvent, options.forceRunId || null);
  integrateRawEvent(run, rawEvent, {
    source: options.source || "ws",
    transient: options.transient !== false,
    skipPersistence: options.skipPersistence === true,
    allowGitDiff: options.allowGitDiff !== false,
  });

  if (!state.selectedRunId) {
    state.selectedRunId = run.runId;
  }

  renderUi();
}

function integrateDerivedSet(run, rawEvent, derivedEvents, options = {}) {
  const transient = options.transient !== false;

  if (run.rawEvents.length > 4000) {
    run.rawEvents.shift();
  }
  run.rawEvents.push(rawEvent);

  const record = addTimelineRecord(run, rawEvent, derivedEvents);

  for (const derived of derivedEvents) {
    applyDerivedEvent(run, derived, { transient });
  }

  evaluateStuck(run);

  if (run.stuckScore > 0.7 && transient) {
    run.highlight = {
      district: record.district,
      filePath: record.filePath,
      until: nowMs() + 2400,
    };
  }

  if (!options.skipPersistence) {
    queuePersistence();
  }

  return record;
}

function shouldPollGitDiff(run, derivedEvents, source) {
  if (source === "git") return false;
  if (!state.git.useGitDiff || !state.git.repoPath) return false;

  if (run.rawEvents.length <= 1) return true;

  if (derivedEvents.some((item) => item.kind === "step.started" || item.kind === "step.ended")) {
    return true;
  }

  return false;
}

async function pollGitDiffForRun(run) {
  const currentTime = nowMs();
  if (currentTime - state.git.lastPollAt < 1500) return;
  state.git.lastPollAt = currentTime;

  try {
    const response = await fetch(`${DIFF_HELPER_URL}/api/diff`);
    if (!response.ok) {
      helperStatusEl.textContent = "Helper: diff unavailable";
      return;
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.files)) return;

    helperStatusEl.textContent = `Helper: ${payload.changedFiles || payload.files.length} changed file(s)`;

    const fingerprint = payload.files
      .map((file) => `${file.path}:${file.added}:${file.deleted}`)
      .sort()
      .join("|");

    if (fingerprint === state.git.lastFingerprint) {
      return;
    }

    state.git.lastFingerprint = fingerprint;

    const derived = payload.files.map((file) => ({
      kind: "file.changed",
      rawType: "helper.git.diff",
      ts: nowMs(),
      filePath: file.path,
      message: `git diff +${file.added} -${file.deleted}`,
      added: file.added,
      deleted: file.deleted,
    }));

    const rawEvent = {
      type: "helper.git.diff",
      ts: nowMs(),
      files: payload.files,
      repoPath: payload.repoPath,
    };

    integrateDerivedSet(run, rawEvent, derived, {
      source: "git",
      transient: true,
      skipPersistence: false,
    });

    renderUi();
  } catch {
    helperStatusEl.textContent = "Helper: offline";
  }
}

function integrateRawEvent(run, rawEvent, options = {}) {
  const source = options.source || "ws";
  const derivedEvents = mapCodexToVizEvents(rawEvent);
  const record = integrateDerivedSet(run, rawEvent, derivedEvents, {
    transient: options.transient !== false,
    skipPersistence: options.skipPersistence === true,
  });

  if (shouldPollGitDiff(run, derivedEvents, source) && options.allowGitDiff !== false) {
    pollGitDiffForRun(run);
  }

  return record;
}

function selectRun(runId) {
  if (!state.runs.has(runId)) return;

  state.selectedRunId = runId;
  if (state.replay.active && state.replay.sourceRunId !== runId) {
    stopReplay();
  }

  renderUi();
}

function createManualRun() {
  state.manualRunCounter += 1;
  const runId = `manual:${state.manualRunCounter}`;
  const run = ensureRun(runId, {
    manual: true,
    agentId: `codex:run:${state.manualRunCounter}`,
    label: `codex:run:${state.manualRunCounter}`,
  });

  state.activeManualRunId = run.runId;
  state.selectedRunId = run.runId;
  renderUi();
}

function spawnVehicle(run, district, toolName) {
  const start = tileToPx(HQ.x, HQ.y);
  const end = districtCenterPx(district);

  run.vehicles.push({
    x: start.x,
    y: start.y,
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y,
    progress: 0,
    duration: 1.2 + (hashString(`${toolName}-${nowMs()}`) % 100) / 100,
    district,
    toolName,
    color: district === "Jurong" ? "#ffb269" : district === "Bugis" ? "#7ce0ac" : "#79b8ff",
  });
}

function spawnBeacon(run, district) {
  const center = districtCenterPx(district);
  run.effects.push({
    type: "beacon",
    x: center.x,
    y: center.y,
    age: 0,
    ttl: 1.8,
  });
}

function spawnSmoke(run, district) {
  const center = districtCenterPx(district);
  for (let i = 0; i < 6; i += 1) {
    run.effects.push({
      type: "smoke",
      x: center.x + (Math.random() * 20 - 10),
      y: center.y + 8 + Math.random() * 8,
      vx: Math.random() * 8 - 4,
      vy: -12 - Math.random() * 10,
      age: 0,
      ttl: 1.6 + Math.random() * 0.8,
      size: 4 + Math.random() * 4,
    });
  }
}

function spawnFireworks(run) {
  const px = (MARINA.x + MARINA.w / 2) * WORLD.tile;
  const py = (MARINA.y + 1) * WORLD.tile;

  const particles = [];
  for (let i = 0; i < 22; i += 1) {
    const angle = (Math.PI * 2 * i) / 22;
    const speed = 28 + Math.random() * 30;
    particles.push({
      x: px,
      y: py,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      ttl: 0.85 + Math.random() * 0.5,
      color: i % 2 === 0 ? "#ffd77f" : "#9af3ff",
    });
  }

  run.effects.push({
    type: "firework",
    particles,
    age: 0,
    ttl: 1.4,
  });
}

function updateRunAnimations(run, dt) {
  for (let i = run.vehicles.length - 1; i >= 0; i -= 1) {
    const vehicle = run.vehicles[i];
    vehicle.progress += dt / vehicle.duration;
    if (vehicle.progress >= 1) {
      run.vehicles.splice(i, 1);
      continue;
    }

    const t = vehicle.progress;
    vehicle.x = vehicle.startX + (vehicle.endX - vehicle.startX) * t;
    vehicle.y = vehicle.startY + (vehicle.endY - vehicle.startY) * t;
  }

  for (let i = run.effects.length - 1; i >= 0; i -= 1) {
    const effect = run.effects[i];
    effect.age += dt;

    if (effect.type === "smoke") {
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
    }

    if (effect.type === "firework") {
      for (const particle of effect.particles) {
        particle.life += dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 18 * dt;
      }
    }

    if (effect.age >= effect.ttl) {
      run.effects.splice(i, 1);
    }
  }

  for (const npc of Object.values(run.npcs)) {
    if (npc.until < nowMs()) {
      npc.text = "";
    }
  }

  if (run.highlight && run.highlight.until < nowMs()) {
    run.highlight = null;
  }
}

function drawPx(target, x, y, w, h, color) {
  target.fillStyle = color;
  target.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawText(target, text, x, y, color = "#f4f0de", size = 12) {
  target.fillStyle = color;
  target.font = `bold ${size}px "Lucida Console", "Monaco", monospace`;
  target.fillText(text, Math.round(x), Math.round(y));
}

function buildStaticLayer() {
  const layer = document.createElement("canvas");
  layer.width = WORLD.width;
  layer.height = WORLD.height;
  const c = layer.getContext("2d");
  c.imageSmoothingEnabled = false;

  drawPx(c, 0, 0, WORLD.width, WORLD.height, "#15314a");

  for (let y = 0; y < WORLD.height; y += WORLD.tile) {
    const tone = y < 180 ? "#1f4f70" : y < 320 ? "#21445e" : "#1a374e";
    drawPx(c, 0, y, WORLD.width, WORLD.tile, tone);
  }

  for (let i = 0; i < 34; i += 1) {
    const x = 20 + i * 36;
    const h = 40 + ((i * 17) % 90);
    drawPx(c, x, 220 - h, 22, h, i % 3 === 0 ? "#223b4f" : "#2a4a61");
    drawPx(c, x + 4, 220 - h + 8, 3, 3, "#a6d8ff");
    drawPx(c, x + 12, 220 - h + 18, 3, 3, "#a6d8ff");
  }

  drawPx(c, MARINA.x * WORLD.tile, MARINA.y * WORLD.tile, MARINA.w * WORLD.tile, MARINA.h * WORLD.tile, "#2a84be");
  drawPx(c, MARINA.x * WORLD.tile, MARINA.y * WORLD.tile + 10, MARINA.w * WORLD.tile, 2, "#8dd4ff");
  drawPx(c, MARINA.x * WORLD.tile, MARINA.y * WORLD.tile + 28, MARINA.w * WORLD.tile, 2, "#8dd4ff");

  for (const [name, district] of Object.entries(DISTRICTS)) {
    const px = district.x * WORLD.tile;
    const py = district.y * WORLD.tile;
    const w = district.w * WORLD.tile;
    const h = district.h * WORLD.tile;

    drawPx(c, px, py, w, h, district.color);
    drawPx(c, px + 2, py + 2, w - 4, h - 4, "rgba(0,0,0,0.18)");

    drawPx(c, px, py, w, 2, district.glow);
    drawPx(c, px, py + h - 2, w, 2, district.glow);
    drawPx(c, px, py, 2, h, district.glow);
    drawPx(c, px + w - 2, py, 2, h, district.glow);

    drawText(c, name, px + 8, py + 18, "#f8f3df", 12);
  }

  drawMerlion(c);
  drawMrtTrack(c);

  return layer;
}

function drawMerlion(target) {
  const base = tileToPx(HQ.x, HQ.y);
  const x = base.x - 12;
  const y = base.y - 22;

  drawPx(target, x + 8, y + 28, 16, 12, "#b6c5d4");
  drawPx(target, x + 11, y + 16, 10, 14, "#d8e4ee");
  drawPx(target, x + 9, y + 8, 14, 10, "#dce8f2");
  drawPx(target, x + 15, y + 5, 6, 5, "#dce8f2");
  drawPx(target, x + 21, y + 9, 5, 3, "#8fd0ff");
  drawPx(target, x + 25, y + 10, 7, 2, "#6ec2ff");
  drawPx(target, x + 6, y + 38, 20, 4, "#8e6e4a");

  drawText(target, "MERLION HQ", x - 16, y + 52, "#ffe7bd", 10);
}

function drawMrtTrack(target) {
  const y = 210;
  drawPx(target, 24, y, WORLD.width - 48, 4, "#7d6c52");
  for (let x = 24; x < WORLD.width - 24; x += 18) {
    drawPx(target, x, y + 4, 5, 2, "#b39f81");
  }
}

function drawWaterShimmer(target, timeSec) {
  const baseX = MARINA.x * WORLD.tile;
  const baseY = MARINA.y * WORLD.tile;
  const width = MARINA.w * WORLD.tile;
  const rows = 5;

  for (let i = 0; i < rows; i += 1) {
    const y = baseY + 8 + i * 10;
    const offset = Math.floor((timeSec * 16 + i * 5) % 20);
    drawPx(target, baseX + offset, y, width - 20, 1, "rgba(188, 238, 255, 0.35)");
  }
}

function drawDistrictBuildings(target, run) {
  for (const [district, slots] of Object.entries(DISTRICT_SLOTS)) {
    const slotMap = run?.slotStats?.[district] || new Map();

    for (const slot of slots) {
      const slotState = slotMap.get(slot.index);
      if (!slotState) continue;
      const level = slotState.level;

      const px = slot.col * WORLD.tile;
      const py = slot.row * WORLD.tile;
      const height = level === 1 ? 10 : level === 2 ? 18 : 26;
      const color =
        district === "Bugis"
          ? "#95f0bf"
          : district === "Jurong"
            ? "#ffc38b"
              : district === "Changi"
              ? "#c3e7ff"
              : "#a9d3ff";

      drawPx(target, px, py + (16 - height), 12, height, color);
      drawPx(target, px + 2, py + (18 - height), 8, 2, "rgba(0,0,0,0.22)");
      if (level >= 2) {
        drawPx(target, px + 2, py + (14 - height), 2, 2, "#fff6b8");
        drawPx(target, px + 6, py + (10 - height), 2, 2, "#fff6b8");
      }
      if (level >= 3) {
        drawPx(target, px + 4, py + (6 - height), 4, 2, "#fff0aa");
      }
    }
  }
}

function drawVehicles(target, run) {
  for (const vehicle of run.vehicles) {
    drawPx(target, vehicle.x - 7, vehicle.y - 4, 14, 7, vehicle.color);
    drawPx(target, vehicle.x - 5, vehicle.y - 2, 6, 3, "#21384c");
    drawPx(target, vehicle.x - 6, vehicle.y + 3, 3, 2, "#1f2123");
    drawPx(target, vehicle.x + 2, vehicle.y + 3, 3, 2, "#1f2123");
  }
}

function drawEffects(target, run) {
  for (const effect of run.effects) {
    const progress = clamp(effect.age / effect.ttl, 0, 1);

    if (effect.type === "beacon") {
      const size = 8 + Math.floor(progress * 16);
      const alpha = 1 - progress;
      target.strokeStyle = `rgba(255, 89, 89, ${alpha.toFixed(3)})`;
      target.lineWidth = 2;
      target.strokeRect(effect.x - size / 2, effect.y - size / 2, size, size);
      drawPx(target, effect.x - 3, effect.y - 3, 6, 6, "#ff7575");
    }

    if (effect.type === "smoke") {
      const alpha = 1 - progress;
      drawPx(target, effect.x, effect.y, effect.size, effect.size, `rgba(190, 190, 190, ${alpha.toFixed(3)})`);
    }

    if (effect.type === "firework") {
      for (const particle of effect.particles) {
        const lifeP = clamp(particle.life / particle.ttl, 0, 1);
        if (lifeP >= 1) continue;
        const alpha = 1 - lifeP;
        drawPx(target, particle.x, particle.y, 2, 2, hexToRgba(particle.color, alpha.toFixed(3)));
      }
    }
  }
}

function drawNpc(target, npcData, runtimeState) {
  const px = npcData.x * WORLD.tile;
  const py = npcData.y * WORLD.tile;

  drawPx(target, px + 3, py + 2, 8, 8, npcData.color);
  drawPx(target, px + 4, py + 10, 6, 6, "#30495f");
  drawPx(target, px + 3, py + 16, 3, 4, "#252f3c");
  drawPx(target, px + 8, py + 16, 3, 4, "#252f3c");

  drawText(target, npcData.label, px - 18, py - 2, "#f5e6c8", 9);

  if (!runtimeState.text) return;

  const text = runtimeState.text;
  const width = Math.max(90, text.length * 6 + 10);
  const bx = px + 18;
  const by = py - 26;

  drawPx(target, bx, by, width, 18, "rgba(10, 18, 26, 0.85)");
  drawPx(target, bx + 2, by + 2, width - 4, 14, "rgba(240, 242, 220, 0.12)");
  drawPx(target, bx - 2, by + 10, 4, 4, "rgba(10, 18, 26, 0.85)");
  drawText(target, text, bx + 5, by + 12, "#f9f2d4", 10);
}

function drawHighlight(target, run) {
  if (!run?.highlight) return;

  const district = run.highlight.district;
  if (district && DISTRICTS[district]) {
    const d = DISTRICTS[district];
    target.strokeStyle = "#ffe28f";
    target.lineWidth = 2;
    target.strokeRect(d.x * WORLD.tile, d.y * WORLD.tile, d.w * WORLD.tile, d.h * WORLD.tile);
  }

  if (run.highlight.filePath && run.fileStats.has(run.highlight.filePath)) {
    const fileInfo = run.fileStats.get(run.highlight.filePath);
    const slot = DISTRICT_SLOTS[fileInfo.district][fileInfo.slotIndex];
    const x = slot.col * WORLD.tile;
    const y = slot.row * WORLD.tile;
    drawPx(target, x - 1, y - 1, 14, 14, "rgba(255, 226, 143, 0.4)");
  }
}

function drawHaze(target, run) {
  if (!run || run.stuckScore <= 0.7) return;

  const alpha = clamp((run.stuckScore - 0.7) * 1.2, 0.05, 0.3);
  drawPx(target, 0, 0, WORLD.width, WORLD.height, `rgba(120, 120, 110, ${alpha.toFixed(3)})`);

  const signX = HQ.x * WORLD.tile + 60;
  const signY = HQ.y * WORLD.tile + 16;
  drawPx(target, signX, signY, 112, 20, "rgba(117, 62, 35, 0.9)");
  drawPx(target, signX + 4, signY + 4, 104, 12, "rgba(225, 185, 122, 0.95)");
  drawText(target, "CONSTRUCTION STALLED", signX + 6, signY + 13, "#2f1a0d", 9);
}

function drawRun(run, timeSec) {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  ctx.drawImage(staticLayer, 0, 0);
  drawWaterShimmer(ctx, timeSec);

  if (!run) return;

  drawDistrictBuildings(ctx, run);
  drawVehicles(ctx, run);
  drawEffects(ctx, run);
  drawNpc(ctx, NPCS.auntie, run.npcs.auntie);
  drawNpc(ctx, NPCS.uncle, run.npcs.uncle);
  drawNpc(ctx, NPCS.mrt, run.npcs.mrt);
  drawHighlight(ctx, run);
  drawHaze(ctx, run);
}

function renderRunList() {
  runListEl.innerHTML = "";

  for (const runId of state.runOrder) {
    const run = state.runs.get(runId);
    if (!run) continue;

    const item = document.createElement("li");
    item.className = `run-item${state.selectedRunId === runId ? " active" : ""}`;
    item.dataset.runId = runId;

    const top = document.createElement("div");
    top.className = "run-top";

    const title = document.createElement("span");
    title.textContent = run.label;

    const status = document.createElement("span");
    status.className = `status-pill ${statusClass(run.status)}`;
    status.textContent = run.status;

    top.append(title, status);

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = `events=${run.rawEvents.length} files=${run.fileStats.size} errors=${run.errorCount}`;

    item.append(top, meta);
    runListEl.append(item);
  }
}

function getSelectedRealRun() {
  if (!state.selectedRunId) return null;
  return state.runs.get(state.selectedRunId) || null;
}

function getActiveRunForView() {
  if (state.replay.active && state.replay.previewRun) {
    return state.replay.previewRun;
  }
  return getSelectedRealRun();
}

function selectedTimelineRecord(run) {
  if (!run) return null;
  const selectedId = state.timelineSelectionByRun.get(run.runId);
  if (!selectedId) return null;
  return run.timeline.find((record) => record.id === selectedId) || null;
}

function renderTimeline() {
  timelineListEl.innerHTML = "";

  const run = getActiveRunForView();
  if (!run) return;

  const entries = run.timeline.slice(-200).reverse();
  const selectedId = state.timelineSelectionByRun.get(run.runId);

  for (const record of entries) {
    const li = document.createElement("li");
    li.className = `timeline-item${record.id === selectedId ? " active" : ""}`;
    li.dataset.timelineId = String(record.id);
    li.dataset.runId = run.runId;

    const derivedKinds = record.derived.map((item) => item.kind).join(", ");
    li.innerHTML = `<div>${formatTime(record.ts)} | ${record.rawType}</div><div>${record.summary}</div><div class="derived">${derivedKinds}</div>`;

    timelineListEl.append(li);
  }
}

function renderScorecard() {
  const run = getActiveRunForView();
  if (!run) {
    metricDurationEl.textContent = "0s";
    metricToolCountEl.textContent = "0";
    metricFileCountEl.textContent = "0";
    metricErrorCountEl.textContent = "0";
    metricSuccessCountEl.textContent = "0";
    metricStuckEl.textContent = "0.00";
    interventionTextEl.textContent = "No intervention needed yet.";
    return;
  }

  const duration = (run.lastTs || run.createdAt) - (run.firstTs || run.createdAt);
  metricDurationEl.textContent = formatDuration(duration);
  metricToolCountEl.textContent = String(run.toolCount);
  metricFileCountEl.textContent = String(run.fileCount);
  metricErrorCountEl.textContent = String(run.errorCount);
  metricSuccessCountEl.textContent = String(run.successCount);
  metricStuckEl.textContent = run.stuckScore.toFixed(2);
  interventionTextEl.textContent = run.intervention;

  if (run.stuckScore > 0.7) {
    stuckBannerEl.hidden = false;
    stuckBannerEl.textContent = `Stuck score ${run.stuckScore.toFixed(2)} | ${run.stuckReason}`;
  } else {
    stuckBannerEl.hidden = true;
  }
}

function renderInspector() {
  const run = getActiveRunForView();
  const record = selectedTimelineRecord(run);

  if (!run || !record) {
    inspectorSummaryEl.textContent = "Select a timeline item to inspect.";
    inspectorRawEl.textContent = "";
    return;
  }

  const derivedLine = record.derived.map((item) => item.kind).join(", ");
  inspectorSummaryEl.textContent = `${record.summary} | district: ${record.district} | derived: ${derivedLine}`;
  inspectorRawEl.textContent = JSON.stringify(record.rawEvent, null, 2);
}

function renderReplayUi() {
  const sourceRun = state.replay.active
    ? state.runs.get(state.replay.sourceRunId)
    : getSelectedRealRun();

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
  wsStatusEl.textContent = `WS: ${state.ws.status}`;
}

function renderRunBadge() {
  const run = getActiveRunForView();
  if (!run) {
    runBadgeEl.textContent = "run: none";
    return;
  }

  if (state.replay.active && state.replay.sourceRunId) {
    runBadgeEl.textContent = `run: ${run.label} (replay)`;
    return;
  }

  runBadgeEl.textContent = `run: ${run.label}`;
}

function renderUi() {
  renderWsStatus();
  renderRunList();
  renderTimeline();
  renderScorecard();
  renderInspector();
  renderReplayUi();
  renderRunBadge();
}

function handleTimelineClick(event) {
  const li = event.target.closest(".timeline-item");
  if (!li) return;

  const timelineId = Number(li.dataset.timelineId);
  const runId = li.dataset.runId;
  if (!Number.isFinite(timelineId) || !runId) return;

  const run = getActiveRunForView();
  if (!run || run.runId !== runId) return;

  state.timelineSelectionByRun.set(run.runId, timelineId);

  const record = run.timeline.find((item) => item.id === timelineId);
  if (record) {
    run.highlight = {
      district: record.district,
      filePath: record.filePath,
      until: nowMs() + 2800,
    };
  }

  renderUi();
}

function handleRunListClick(event) {
  const li = event.target.closest(".run-item");
  if (!li) return;
  const runId = li.dataset.runId;
  if (!runId) return;
  selectRun(runId);
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
      const rawEvent = JSON.parse(payload);
      ingestRawEvent(rawEvent, { source: "ws", transient: true, allowGitDiff: true });
    } catch {
      ingestRawEvent(
        {
          type: "dashboard.parse.error",
          ts: nowMs(),
          message: "Invalid websocket payload",
        },
        { source: "dashboard", transient: true, allowGitDiff: false }
      );
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

async function setRepoOnHelper() {
  const repoPath = repoPathInputEl.value.trim();
  state.git.repoPath = repoPath;
  state.git.useGitDiff = useGitDiffToggleEl.checked;
  persistSettings();

  if (!repoPath) {
    helperStatusEl.textContent = "Helper: repo path required";
    return;
  }

  try {
    const response = await fetch(`${DIFF_HELPER_URL}/api/setRepo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repoPath }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      helperStatusEl.textContent = `Helper: ${payload.error || "failed to set repo"}`;
      return;
    }

    helperStatusEl.textContent = `Helper: repo set (${payload.baselineFiles} baseline files)`;
  } catch {
    helperStatusEl.textContent = "Helper: offline on :8790";
  }
}

function setupEventHandlers() {
  runListEl.addEventListener("click", handleRunListClick);
  timelineListEl.addEventListener("click", handleTimelineClick);

  newRunBtnEl.addEventListener("click", () => {
    createManualRun();
  });

  reconnectBtnEl.addEventListener("click", () => {
    state.ws.attempts = 0;
    connectWebSocket();
  });

  setRepoBtnEl.addEventListener("click", () => {
    setRepoOnHelper();
  });

  useGitDiffToggleEl.addEventListener("change", () => {
    state.git.useGitDiff = useGitDiffToggleEl.checked;
    persistSettings();
  });

  repoPathInputEl.addEventListener("change", () => {
    state.git.repoPath = repoPathInputEl.value.trim();
    persistSettings();
  });

  replaySpeedEl.addEventListener("change", () => {
    const speed = Number(replaySpeedEl.value) || 1;
    state.replay.speed = speed;
    if (state.replay.playing) {
      startReplayTimer();
    }
    renderReplayUi();
  });

  replaySliderEl.addEventListener("input", () => {
    const sourceRun = getSelectedRealRun();
    if (!sourceRun) return;

    if (!state.replay.active || state.replay.sourceRunId !== sourceRun.runId) {
      startReplay(sourceRun.runId);
    }

    state.replay.index = clamp(Number(replaySliderEl.value) || 0, 0, sourceRun.rawEvents.length);
    rebuildReplayPreview();
    renderUi();
  });

  playPauseBtnEl.addEventListener("click", () => {
    const sourceRun = getSelectedRealRun();
    if (!sourceRun) return;

    if (!state.replay.active || state.replay.sourceRunId !== sourceRun.runId) {
      startReplay(sourceRun.runId);
    }

    state.replay.playing = !state.replay.playing;
    if (state.replay.playing) {
      startReplayTimer();
    } else {
      stopReplayTimer();
    }
    renderReplayUi();
  });

  liveViewBtnEl.addEventListener("click", () => {
    stopReplay();
    renderUi();
  });

  exportRunBtnEl.addEventListener("click", () => {
    exportSelectedRun();
  });

  importRunInputEl.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importRunFromFile(file);
    importRunInputEl.value = "";
  });

  simScoldedBtnEl.addEventListener("click", () => {
    runScenario("scolded");
  });

  simLongtaskBtnEl.addEventListener("click", () => {
    runScenario("longtask");
  });

  simAsleepBtnEl.addEventListener("click", () => {
    runScenario("asleep");
  });

  simPackBtnEl.addEventListener("click", () => {
    runSimulatorPack();
  });
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
    integrateRawEvent(preview, sourceRun.rawEvents[i], {
      source: "replay",
      transient: true,
      skipPersistence: true,
      allowGitDiff: false,
    });
  }

  state.replay.previewRun = preview;
  evaluateStuck(preview);
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

    const next = Math.min(sourceRun.rawEvents.length, state.replay.index + state.replay.speed);
    state.replay.index = next;
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
      if (parsed && typeof parsed === "object") {
        events.push(parsed);
      }
    } catch {
      // Ignore non JSON lines.
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
    ingestRawEvent(event, {
      source: "import",
      forceRunId: runId,
      transient: true,
      allowGitDiff: false,
    });
  }

  state.activeManualRunId = runId;
  state.selectedRunId = runId;
  queuePersistence();
  renderUi();
}

function scenarioEvents(name) {
  if (name === "scolded") {
    return [
      { type: "turn.started", run_id: "sim-scolded", message: "Start fixing lint in frontend" },
      { type: "tool.exec", run_id: "sim-scolded", tool: "Bash", message: "npm test -- ui", path: "ui/navbar.tsx" },
      { type: "tool.failed", run_id: "sim-scolded", message: "same error: expected 2 got 3", path: "tests/ui/navbar.test.ts" },
      { type: "tool.exec", run_id: "sim-scolded", tool: "Edit", message: "patch component", path: "ui/navbar.tsx" },
      { type: "tool.failed", run_id: "sim-scolded", message: "same error: expected 2 got 3", path: "tests/ui/navbar.test.ts" },
      { type: "tool.exec", run_id: "sim-scolded", tool: "Read", message: "read logs", path: "logs/latest.md" },
      { type: "turn.completed", run_id: "sim-scolded", message: "stopped after repeated failure" },
    ];
  }

  if (name === "longtask") {
    return [
      { type: "turn.started", run_id: "sim-longtask", message: "Refactor infra pipeline" },
      { type: "tool.run", run_id: "sim-longtask", tool: "Read", message: "scan terraform", path: "infra/terraform/main.tf" },
      { type: "tool.run", run_id: "sim-longtask", tool: "Bash", message: "terraform plan", path: "infra/terraform/main.tf" },
      { type: "tool.run", run_id: "sim-longtask", tool: "Read", message: "check deploy logs", path: "infra/deploy.yaml" },
      { type: "tool.run", run_id: "sim-longtask", tool: "Bash", message: "kubectl describe pod" },
      { type: "tool.run", run_id: "sim-longtask", tool: "Read", message: "retry and inspect" },
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

function clearSimulatorTimers() {
  for (const timer of state.simulatorTimers) {
    clearInterval(timer);
  }
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

    ingestRawEvent(
      {
        ...event,
        ts: nowMs(),
      },
      { source: "sim", transient: true, allowGitDiff: false }
    );

    if (event.run_id) {
      const runId = `explicit:${sanitizeRunIdentity(event.run_id)}`;
      if (state.runs.has(runId)) {
        state.selectedRunId = runId;
      }
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

let previousFrameTime = performance.now();

function frame(now) {
  const dt = clamp((now - previousFrameTime) / 1000, 0, 0.05);
  previousFrameTime = now;

  for (const run of state.runs.values()) {
    updateRunAnimations(run, dt);
    evaluateStuck(run, nowMs());
  }

  if (state.replay.active && state.replay.previewRun) {
    updateRunAnimations(state.replay.previewRun, dt);
    evaluateStuck(state.replay.previewRun, nowMs());
  }

  drawRun(getActiveRunForView(), now / 1000);
  requestAnimationFrame(frame);
}

function boot() {
  ensureMainRun();
  restoreSettings();
  restoreRunsFromStorage();
  setupEventHandlers();
  connectWebSocket();

  state.replay.speed = Number(replaySpeedEl.value) || 1;

  renderUi();
  requestAnimationFrame(frame);
}

window.dispatchAgentEvent = (event) => {
  ingestRawEvent(event, { source: "manual", transient: true, allowGitDiff: false });
};

window.agentVizDemo = {
  runScenario,
  runSimulatorPack,
  dispatch: (event) => window.dispatchAgentEvent(event),
};

boot();
