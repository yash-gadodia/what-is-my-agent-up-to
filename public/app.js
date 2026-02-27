const canvas = document.getElementById("cityCanvas");
const ctx = canvas.getContext("2d");

const wsStatusEl = document.getElementById("wsStatus");
const metricsEl = document.getElementById("metrics");
const lastTypeEl = document.getElementById("lastType");
const logLinesEl = document.getElementById("logLines");

const WORLD = {
  width: 1280,
  height: 720,
  tile: 16,
  cols: 80,
  rows: 45,
};

const DISTRICTS = {
  Frontend: { x1: 0, y1: 0, x2: 39, y2: 21 },
  Backend: { x1: 40, y1: 0, x2: 79, y2: 21 },
  Infra: { x1: 0, y1: 22, x2: 39, y2: 44 },
  Tests: { x1: 40, y1: 22, x2: 79, y2: 44 },
};

const HQ = { x: 40, y: 22 };

const state = {
  buildings: new Map(),
  vehicles: [],
  effects: [],
  lastEvents: [],
  wsState: "connecting",
  lastEventType: "none",
};

const FILE_REGEX = /([\w./-]+\.(?:ts|tsx|js|jsx|py|md|json|yml|yaml|go|rs|java|c|cpp|h))/gi;

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function districtCenter(name) {
  const d = DISTRICTS[name];
  return {
    x: Math.floor((d.x1 + d.x2) / 2),
    y: Math.floor((d.y1 + d.y2) / 2),
  };
}

function chooseDistrictFromPath(filePath) {
  const p = filePath.toLowerCase();
  if (/(^|\/)(test|tests|__tests__)(\/|$)/.test(p)) return "Tests";
  if (/(infra|docker|k8s|terraform)/.test(p)) return "Infra";
  if (/(ui|frontend|components)/.test(p)) return "Frontend";
  return "Backend";
}

function chooseDistrictFromEvent(evt, fallback = "Backend") {
  const blob = JSON.stringify(evt).toLowerCase();
  if (/(test|__tests__|jest|vitest|pytest)/.test(blob)) return "Tests";
  if (/(infra|docker|k8s|terraform|deploy|ci)/.test(blob)) return "Infra";
  if (/(ui|frontend|component|css|dom|react|vue)/.test(blob)) return "Frontend";
  if (/(api|server|backend|db|sql)/.test(blob)) return "Backend";
  return fallback;
}

function typeOfEvent(evt) {
  const candidates = [
    evt?.type,
    evt?.event,
    evt?.name,
    evt?.kind,
    evt?.status,
    evt?.level,
  ];
  for (const item of candidates) {
    if (typeof item === "string" && item.trim()) return item;
  }
  return "unknown";
}

function extractFilePaths(evt) {
  const found = new Set();
  const text = JSON.stringify(evt);
  let match;
  while ((match = FILE_REGEX.exec(text)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

function buildingLevel(touches) {
  if (touches >= 5) return 3;
  if (touches >= 2) return 2;
  return 1;
}

function fileTileWithinDistrict(filePath, districtName) {
  const d = DISTRICTS[districtName];
  const width = d.x2 - d.x1 + 1;
  const height = d.y2 - d.y1 + 1;
  const h = hashString(filePath);
  const x = d.x1 + (h % width);
  const y = d.y1 + (Math.floor(h / width) % height);
  return { x, y };
}

function addLogLine(line) {
  state.lastEvents.unshift(line);
  if (state.lastEvents.length > 6) state.lastEvents.length = 6;
}

function spawnVehicleToDistrict(district, color = "#f1c40f") {
  const target = districtCenter(district);
  state.vehicles.push({
    x: HQ.x,
    y: HQ.y,
    targetX: target.x,
    targetY: target.y,
    speed: 18,
    color,
  });
}

function spawnEffectPulse(x, y, color = "#2ecc71", ttl = 0.8) {
  state.effects.push({ type: "pulse", x, y, color, ttl, age: 0 });
}

function spawnEffectBeacon(x, y, color = "#e74c3c", ttl = 2.0) {
  state.effects.push({ type: "beacon", x, y, color, ttl, age: 0, blink: 0 });
}

function isToolCallEvent(evt, eventType) {
  const raw = `${eventType} ${JSON.stringify(evt)}`.toLowerCase();
  return /(tool_call|tool.call|turn.started|turn_start|assistant.turn.started|step.started)/.test(raw);
}

function isErrorEvent(evt, eventType) {
  const raw = `${eventType} ${JSON.stringify(evt)}`.toLowerCase();
  return /(error|failed|exception|fatal|timeout)/.test(raw);
}

function isSuccessEvent(evt, eventType) {
  const raw = `${eventType} ${JSON.stringify(evt)}`.toLowerCase();
  return /(completed|passed|succeeded|success|done|exit"?:0)/.test(raw);
}

function applyFileChange(filePath, district) {
  const tile = fileTileWithinDistrict(filePath, district);
  const key = `${tile.x},${tile.y}`;
  const prev = state.buildings.get(key) || { touches: 0, level: 0, district };

  const touches = prev.touches + 1;
  const level = buildingLevel(touches);
  state.buildings.set(key, { touches, level, district });

  if (level > prev.level) {
    spawnEffectPulse(tile.x, tile.y, "#2ecc71", 0.7);
  }
}

function handleCodexEvent(evt) {
  const eventType = typeOfEvent(evt);
  state.lastEventType = eventType;
  addLogLine(`${new Date().toLocaleTimeString()}  ${eventType}`);

  const guessedDistrict = chooseDistrictFromEvent(evt, "Backend");

  if (isToolCallEvent(evt, eventType)) {
    spawnVehicleToDistrict(guessedDistrict, "#f1c40f");
  }

  const paths = extractFilePaths(evt);
  for (const filePath of paths) {
    const district = chooseDistrictFromPath(filePath);
    applyFileChange(filePath, district);
  }

  const center = districtCenter(guessedDistrict);

  if (isErrorEvent(evt, eventType)) {
    spawnEffectBeacon(center.x, center.y, "#ff4f64", 2.0);
  } else if (isSuccessEvent(evt, eventType)) {
    spawnEffectPulse(center.x, center.y, "#35d07f", 1.0);
  }

  updateHud();
}

function updateVehicles(dt) {
  for (let i = state.vehicles.length - 1; i >= 0; i -= 1) {
    const v = state.vehicles[i];
    const move = v.speed * dt;

    if (v.x !== v.targetX) {
      const dx = v.targetX - v.x;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), move);
      v.x += step;
    } else if (v.y !== v.targetY) {
      const dy = v.targetY - v.y;
      const step = Math.sign(dy) * Math.min(Math.abs(dy), move);
      v.y += step;
    } else {
      state.vehicles.splice(i, 1);
    }
  }
}

function updateEffects(dt) {
  for (let i = state.effects.length - 1; i >= 0; i -= 1) {
    const effect = state.effects[i];
    effect.age += dt;
    if (effect.type === "beacon") {
      effect.blink += dt;
    }
    if (effect.age >= effect.ttl) {
      state.effects.splice(i, 1);
    }
  }
}

function drawTileRect(tx, ty, color, inset = 0) {
  const px = tx * WORLD.tile + inset;
  const py = ty * WORLD.tile + inset;
  const size = WORLD.tile - inset * 2;
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
}

function drawGrid() {
  ctx.fillStyle = "#0b1323";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.strokeStyle = "rgba(109, 147, 217, 0.15)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= WORLD.cols; x += 1) {
    const px = x * WORLD.tile + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, WORLD.height);
    ctx.stroke();
  }

  for (let y = 0; y <= WORLD.rows; y += 1) {
    const py = y * WORLD.tile + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(WORLD.width, py);
    ctx.stroke();
  }
}

function drawDistrictLabels() {
  ctx.font = "bold 14px monospace";
  ctx.fillStyle = "rgba(219, 231, 255, 0.85)";

  for (const [name, d] of Object.entries(DISTRICTS)) {
    const x = d.x1 * WORLD.tile + 8;
    const y = d.y1 * WORLD.tile + 18;
    ctx.fillText(name, x, y);

    ctx.strokeStyle = "rgba(164, 191, 255, 0.2)";
    ctx.strokeRect(
      d.x1 * WORLD.tile + 0.5,
      d.y1 * WORLD.tile + 0.5,
      (d.x2 - d.x1 + 1) * WORLD.tile,
      (d.y2 - d.y1 + 1) * WORLD.tile
    );
  }
}

function drawHQ() {
  drawTileRect(HQ.x, HQ.y, "#f5f8ff", 1);
  drawTileRect(HQ.x, HQ.y, "#7eb6ff", 4);

  ctx.font = "11px monospace";
  ctx.fillStyle = "#b7cbff";
  ctx.fillText("HQ", HQ.x * WORLD.tile + 2, HQ.y * WORLD.tile - 4);
}

function drawBuildings() {
  for (const [key, b] of state.buildings.entries()) {
    const [xStr, yStr] = key.split(",");
    const x = Number(xStr);
    const y = Number(yStr);

    if (b.level === 1) drawTileRect(x, y, "#3f5f7f", 2);
    if (b.level === 2) drawTileRect(x, y, "#4f8ccf", 1);
    if (b.level === 3) drawTileRect(x, y, "#76d78c", 0);
  }
}

function drawVehicles() {
  for (const v of state.vehicles) {
    const px = Math.round(v.x * WORLD.tile);
    const py = Math.round(v.y * WORLD.tile);

    ctx.fillStyle = v.color;
    ctx.fillRect(px + 4, py + 4, 8, 8);
  }
}

function drawEffects() {
  for (const e of state.effects) {
    const px = e.x * WORLD.tile;
    const py = e.y * WORLD.tile;
    const progress = Math.min(1, e.age / e.ttl);

    if (e.type === "pulse") {
      const size = Math.floor(4 + progress * 18);
      const alpha = 1 - progress;
      ctx.fillStyle = `${e.color}${Math.floor(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`;
      ctx.fillRect(px + 8 - size / 2, py + 8 - size / 2, size, size);
    }

    if (e.type === "beacon") {
      const on = Math.floor(e.blink / 0.2) % 2 === 0;
      if (on) {
        ctx.fillStyle = e.color;
        ctx.fillRect(px + 2, py + 2, 12, 12);
      }
    }
  }
}

function render() {
  drawGrid();
  drawDistrictLabels();
  drawBuildings();
  drawHQ();
  drawVehicles();
  drawEffects();
}

function updateHud() {
  wsStatusEl.textContent = `WS: ${state.wsState}`;
  metricsEl.textContent = `buildings=${state.buildings.size} vehicles=${state.vehicles.length} effects=${state.effects.length}`;
  lastTypeEl.textContent = `last event: ${state.lastEventType}`;
  logLinesEl.textContent = state.lastEvents.join("\n");
}

function connectWebSocket() {
  const ws = new WebSocket("ws://localhost:8787");

  ws.addEventListener("open", () => {
    state.wsState = "connected";
    updateHud();
  });

  ws.addEventListener("close", () => {
    state.wsState = "disconnected";
    updateHud();
    setTimeout(connectWebSocket, 1200);
  });

  ws.addEventListener("error", () => {
    state.wsState = "error";
    updateHud();
  });

  ws.addEventListener("message", (msg) => {
    try {
      const evt = JSON.parse(msg.data);
      handleCodexEvent(evt);
    } catch {
      addLogLine("invalid ws payload");
      updateHud();
    }
  });
}

let previous = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;

  updateVehicles(dt);
  updateEffects(dt);
  render();
  updateHud();

  requestAnimationFrame(frame);
}

window.dispatchAgentEvent = (evt) => {
  if (!evt || typeof evt !== "object") return;
  handleCodexEvent(evt);
};

connectWebSocket();
updateHud();
requestAnimationFrame(frame);
