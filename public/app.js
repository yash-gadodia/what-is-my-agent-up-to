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

const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
};

const CharacterState = {
  IDLE: "idle",
  WALK: "walk",
  TYPE: "type",
};

const WALK_SPEED_PX_PER_SEC = 48;
const WALK_FRAME_DURATION_SEC = 0.15;
const TYPE_FRAME_DURATION_SEC = 0.3;
const CHARACTER_SITTING_OFFSET_PX = 6;
const CHARACTER_RENDER_SCALE = 2;
const READING_TOOLS = new Set(["Read", "Grep", "Glob", "WebFetch", "WebSearch"]);

const DISTRICT_COLORS = {
  Frontend: "#63d1c6",
  Backend: "#6fa8ff",
  Infra: "#5eb5ff",
  Tests: "#82df9b",
};

const DISTRICT_PIXEL = {
  Frontend: {
    outsideA: "#3d6d56",
    outsideB: "#477e61",
    floorA: "#859f8f",
    floorB: "#93ac9d",
    accent: "#63d1c6",
  },
  Backend: {
    outsideA: "#3f5f86",
    outsideB: "#4a6d96",
    floorA: "#8b9eb6",
    floorB: "#99abc1",
    accent: "#7ab6ff",
  },
  Infra: {
    outsideA: "#51637a",
    outsideB: "#5c7188",
    floorA: "#93a0af",
    floorB: "#9facba",
    accent: "#8bc3ff",
  },
  Tests: {
    outsideA: "#5b7c4b",
    outsideB: "#688a57",
    floorA: "#9bb28f",
    floorB: "#a8be9c",
    accent: "#98e58b",
  },
};

const FILE_REGEX = /([\w./-]+\.(?:ts|tsx|js|jsx|py|md|json|yml|yaml|go|rs|java|c|cpp|h))/gi;

const state = {
  buildings: new Map(),
  agents: new Map(),
  vehicles: [],
  effects: [],
  lastEvents: [],
  wsState: "connecting",
  lastEventType: "none",
};

const _ = "";

const DESK_SQUARE_SPRITE = (() => {
  const W = "#8B6914";
  const L = "#A07828";
  const S = "#B8922E";
  const D = "#6B4E0A";
  const rows = [];
  rows.push(new Array(32).fill(_));
  rows.push([_, ...new Array(30).fill(W), _]);
  for (let r = 0; r < 4; r += 1) {
    rows.push([_, W, ...new Array(28).fill(r < 1 ? L : S), W, _]);
  }
  rows.push([_, D, ...new Array(28).fill(W), D, _]);
  for (let r = 0; r < 6; r += 1) {
    rows.push([_, W, ...new Array(28).fill(S), W, _]);
  }
  rows.push([_, W, ...new Array(28).fill(L), W, _]);
  for (let r = 0; r < 6; r += 1) {
    rows.push([_, W, ...new Array(28).fill(S), W, _]);
  }
  rows.push([_, D, ...new Array(28).fill(W), D, _]);
  for (let r = 0; r < 4; r += 1) {
    rows.push([_, W, ...new Array(28).fill(r > 2 ? L : S), W, _]);
  }
  rows.push([_, ...new Array(30).fill(W), _]);
  for (let r = 0; r < 4; r += 1) {
    const row = new Array(32).fill(_);
    row[1] = D;
    row[2] = D;
    row[29] = D;
    row[30] = D;
    rows.push(row);
  }
  rows.push(new Array(32).fill(_));
  rows.push(new Array(32).fill(_));
  return rows;
})();

const CHAIR_SPRITE = (() => {
  const W = "#8B6914";
  const D = "#6B4E0A";
  const B = "#5C3D0A";
  const S = "#A07828";
  return [
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, D, W, W, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, W, W, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, D, _, _, _, _, D, _, _, _, _, _],
    [_, _, _, _, _, D, _, _, _, _, D, _, _, _, _, _],
  ];
})();

const PC_SPRITE = (() => {
  const F = "#555555";
  const S = "#3A3A5C";
  const B = "#6688CC";
  const D = "#444444";
  return [
    [_, _, _, F, F, F, F, F, F, F, F, F, F, _, _, _],
    [_, _, _, F, S, S, S, S, S, S, S, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, S, S, S, S, S, S, S, F, _, _, _],
    [_, _, _, F, F, F, F, F, F, F, F, F, F, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ];
})();

const PLANT_SPRITE = (() => {
  const G = "#3D8B37";
  const D = "#2D6B27";
  const T = "#6B4E0A";
  const P = "#B85C3A";
  const R = "#8B4422";
  return [
    [_, _, _, _, _, _, G, G, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, G, G, G, G, _, _, _, _, _, _, _],
    [_, _, _, _, G, G, D, G, G, G, _, _, _, _, _, _],
    [_, _, _, G, G, D, G, G, D, G, G, _, _, _, _, _],
    [_, _, G, G, G, G, G, G, G, G, G, G, _, _, _, _],
    [_, G, G, D, G, G, G, G, G, G, D, G, G, _, _, _],
    [_, G, G, G, G, D, G, G, D, G, G, G, G, _, _, _],
    [_, _, G, G, G, G, G, G, G, G, G, G, _, _, _, _],
    [_, _, _, G, G, G, D, G, G, G, G, _, _, _, _, _],
    [_, _, _, _, G, G, G, G, G, G, _, _, _, _, _, _],
    [_, _, _, _, _, G, G, G, G, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, R, R, R, R, R, _, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, _, R, P, P, P, R, _, _, _, _, _, _],
    [_, _, _, _, _, _, R, R, R, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ];
})();

const BUBBLE_PERMISSION_SPRITE = (() => {
  const B = "#555566";
  const F = "#EEEEFF";
  const A = "#CCA700";
  return [
    [B, B, B, B, B, B, B, B, B, B, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, A, F, A, F, A, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, B, B, B, B, B, B, B, B, B, B],
    [_, _, _, _, B, B, B, _, _, _, _],
    [_, _, _, _, _, B, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _],
  ];
})();

const BUBBLE_WAITING_SPRITE = (() => {
  const B = "#555566";
  const F = "#EEEEFF";
  const G = "#44BB66";
  return [
    [_, B, B, B, B, B, B, B, B, B, _],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, G, F, B],
    [B, F, F, F, F, F, F, G, F, F, B],
    [B, F, F, G, F, F, G, F, F, F, B],
    [B, F, F, F, G, G, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [_, B, B, B, B, B, B, B, B, B, _],
    [_, _, _, _, B, B, B, _, _, _, _],
    [_, _, _, _, _, B, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _],
  ];
})();

const CHARACTER_ATLASES = Array.from({ length: 6 }, (_, i) => {
  const img = new Image();
  img.src = `/assets/characters/char_${i}.png`;
  return img;
});

const OFFICE = createOfficeLayout();
const DISTRICT_SEATS = OFFICE.seats;
const BLOCKED_TILES = OFFICE.blockedTiles;
const TILE_KIND = OFFICE.tileKind;
const TILE_DISTRICT = OFFICE.tileDistrict;
const DECOR_ITEMS = OFFICE.decor;

const TILE_MAP = Array.from({ length: WORLD.rows }, () =>
  Array.from({ length: WORLD.cols }, () => 1)
);

const spriteCache = new WeakMap();
const STATIC_LAYER = buildStaticLayer();

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

  const directCandidates = [
    evt?.path,
    evt?.file,
    evt?.filePath,
    evt?.filepath,
    evt?.target,
    evt?.payload?.path,
    evt?.payload?.file,
    evt?.data?.path,
  ];

  for (const value of directCandidates) {
    if (typeof value === "string" && /\.[a-zA-Z0-9]+$/.test(value)) {
      found.add(value);
    }
  }

  const listCandidates = [evt?.paths, evt?.files, evt?.payload?.paths, evt?.payload?.files];
  for (const list of listCandidates) {
    if (!Array.isArray(list)) continue;
    for (const value of list) {
      if (typeof value === "string" && /\.[a-zA-Z0-9]+$/.test(value)) {
        found.add(value);
      }
    }
  }

  const text = JSON.stringify(evt);
  let match;
  while ((match = FILE_REGEX.exec(text)) !== null) {
    found.add(match[1]);
  }

  return Array.from(found);
}

function extractToolName(evt) {
  const candidates = [
    evt?.tool,
    evt?.tool_name,
    evt?.toolName,
    evt?.name,
    evt?.call?.name,
    evt?.payload?.tool,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  const blob = JSON.stringify(evt);
  if (/\b(Read|Grep|Glob|WebFetch|WebSearch)\b/.test(blob)) return "Read";
  if (/\b(Write|Edit|MultiEdit|Replace|Patch)\b/.test(blob)) return "Write";
  if (/\b(Bash|Shell|Terminal|Command)\b/.test(blob)) return "Bash";
  return null;
}

function buildingLevel(touches) {
  if (touches >= 5) return 3;
  if (touches >= 2) return 2;
  return 1;
}

function addLogLine(line) {
  state.lastEvents.unshift(line);
  if (state.lastEvents.length > 8) state.lastEvents.length = 8;
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

function tileCenter(col, row) {
  return {
    x: col * WORLD.tile + WORLD.tile / 2,
    y: row * WORLD.tile + WORLD.tile / 2,
  };
}

function directionBetween(fromCol, fromRow, toCol, toRow) {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

function isWalkable(col, row, blockedTiles) {
  if (row < 0 || row >= WORLD.rows || col < 0 || col >= WORLD.cols) return false;
  if (TILE_MAP[row][col] === 0) return false;
  return !blockedTiles.has(`${col},${row}`);
}

function findPath(startCol, startRow, endCol, endRow, blockedTiles) {
  if (startCol === endCol && startRow === endRow) return [];

  const key = (c, r) => `${c},${r}`;
  const startKey = key(startCol, startRow);
  const endKey = key(endCol, endRow);

  if (!isWalkable(endCol, endRow, blockedTiles)) return [];

  const visited = new Set();
  const parent = new Map();
  const queue = [{ col: startCol, row: startRow }];

  visited.add(startKey);

  const dirs = [
    { dc: 0, dr: -1 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
    { dc: 1, dr: 0 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift();
    const currKey = key(curr.col, curr.row);

    if (currKey === endKey) {
      const path = [];
      let k = endKey;
      while (k !== startKey) {
        const [c, r] = k.split(",").map(Number);
        path.unshift({ col: c, row: r });
        k = parent.get(k);
      }
      return path;
    }

    for (const d of dirs) {
      const nc = curr.col + d.dc;
      const nr = curr.row + d.dr;
      const nk = key(nc, nr);
      if (visited.has(nk)) continue;
      if (!isWalkable(nc, nr, blockedTiles)) continue;
      visited.add(nk);
      parent.set(nk, currKey);
      queue.push({ col: nc, row: nr });
    }
  }

  return [];
}

function findNearestOpenTile(col, row) {
  if (isWalkable(col, row, BLOCKED_TILES)) return { col, row };

  for (let radius = 1; radius < 24; radius += 1) {
    for (let y = row - radius; y <= row + radius; y += 1) {
      for (let x = col - radius; x <= col + radius; x += 1) {
        if (Math.abs(x - col) !== radius && Math.abs(y - row) !== radius) continue;
        if (isWalkable(x, y, BLOCKED_TILES)) return { col: x, row: y };
      }
    }
  }

  return { col: HQ.x, row: HQ.y };
}

function seatForFile(filePath, district) {
  const seats = DISTRICT_SEATS[district] || DISTRICT_SEATS.Backend;
  return seats[hashString(filePath) % seats.length];
}

function spawnVehicleToDistrict(district, color = "#f1c40f") {
  const center = districtCenter(district);
  const target = findNearestOpenTile(center.x, center.y);
  const path = findPath(HQ.x, HQ.y, target.col, target.row, BLOCKED_TILES);

  if (path.length === 0) return;

  const spawn = tileCenter(HQ.x, HQ.y);

  state.vehicles.push({
    x: spawn.x,
    y: spawn.y,
    tileCol: HQ.x,
    tileRow: HQ.y,
    path,
    moveProgress: 0,
    dir: Direction.DOWN,
    frame: 0,
    frameTimer: 0,
    palette: hashString(`${district}-${Date.now()}`) % CHARACTER_ATLASES.length,
    state: CharacterState.WALK,
    currentTool: null,
    color,
  });
}

function spawnEffectPulse(x, y, color = "#2ecc71", ttl = 0.8) {
  state.effects.push({ type: "pulse", x, y, color, ttl, age: 0 });
}

function spawnEffectBeacon(x, y, color = "#e74c3c", ttl = 2.0) {
  state.effects.push({ type: "beacon", x, y, color, ttl, age: 0, blink: 0 });
}

function applyFileChange(filePath, district, toolName) {
  const seat = seatForFile(filePath, district);
  const key = `${district}:${seat.id}`;

  const prev = state.agents.get(key);
  const touches = (prev?.touches || 0) + 1;
  const level = buildingLevel(touches);
  const center = tileCenter(seat.seatCol, seat.seatRow);

  const agent =
    prev ||
    {
      id: key,
      x: center.x,
      y: center.y,
      tileCol: seat.seatCol,
      tileRow: seat.seatRow,
      state: CharacterState.TYPE,
      dir: seat.facingDir,
      frame: 0,
      frameTimer: 0,
      currentTool: toolName,
      palette: hashString(filePath) % CHARACTER_ATLASES.length,
      district,
      touches: 0,
      level: 1,
    };

  agent.currentTool = toolName || agent.currentTool;
  agent.touches = touches;
  agent.level = level;
  agent.filePath = filePath;

  state.agents.set(key, agent);
  state.buildings.set(key, { touches, level, district });

  if (level > (prev?.level || 0)) {
    spawnEffectPulse(seat.seatCol, seat.seatRow, "#2ecc71", 0.9);
  }
}

function handleCodexEvent(evt) {
  const eventType = typeOfEvent(evt);
  state.lastEventType = eventType;
  addLogLine(`${new Date().toLocaleTimeString()}  ${eventType}`);

  const guessedDistrict = chooseDistrictFromEvent(evt, "Backend");
  const toolName = extractToolName(evt);

  if (isToolCallEvent(evt, eventType)) {
    spawnVehicleToDistrict(guessedDistrict, "#f1c40f");
  }

  const paths = extractFilePaths(evt);
  for (const filePath of paths) {
    const district = chooseDistrictFromPath(filePath);
    applyFileChange(filePath, district, toolName);
  }

  const center = districtCenter(guessedDistrict);

  if (isErrorEvent(evt, eventType)) {
    spawnEffectBeacon(center.x, center.y, "#ff4f64", 2.0);
  } else if (isSuccessEvent(evt, eventType)) {
    spawnEffectPulse(center.x, center.y, "#35d07f", 1.0);
  }

  updateHud();
}

function updateAgents(dt) {
  for (const agent of state.agents.values()) {
    agent.frameTimer += dt;
    if (agent.frameTimer >= TYPE_FRAME_DURATION_SEC) {
      agent.frameTimer -= TYPE_FRAME_DURATION_SEC;
      agent.frame = (agent.frame + 1) % 2;
    }
  }
}

function updateVehicles(dt) {
  for (let i = state.vehicles.length - 1; i >= 0; i -= 1) {
    const v = state.vehicles[i];
    v.frameTimer += dt;
    if (v.frameTimer >= WALK_FRAME_DURATION_SEC) {
      v.frameTimer -= WALK_FRAME_DURATION_SEC;
      v.frame = (v.frame + 1) % 4;
    }

    if (v.path.length === 0) {
      state.vehicles.splice(i, 1);
      continue;
    }

    const nextTile = v.path[0];
    v.dir = directionBetween(v.tileCol, v.tileRow, nextTile.col, nextTile.row);
    v.moveProgress += (WALK_SPEED_PX_PER_SEC / WORLD.tile) * dt;

    const fromCenter = tileCenter(v.tileCol, v.tileRow);
    const toCenter = tileCenter(nextTile.col, nextTile.row);
    const t = Math.min(v.moveProgress, 1);

    v.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
    v.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

    if (v.moveProgress >= 1) {
      v.tileCol = nextTile.col;
      v.tileRow = nextTile.row;
      v.x = toCenter.x;
      v.y = toCenter.y;
      v.path.shift();
      v.moveProgress = 0;
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

function drawPx(target, x, y, w, h, color) {
  target.fillStyle = color;
  target.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function fillTile(target, tx, ty, color, inset = 0) {
  const px = tx * WORLD.tile + inset;
  const py = ty * WORLD.tile + inset;
  drawPx(target, px, py, WORLD.tile - inset * 2, WORLD.tile - inset * 2, color);
}

function getCachedSprite(sprite, zoom = 1) {
  let cache = spriteCache.get(sprite);
  if (!cache) {
    cache = new Map();
    spriteCache.set(sprite, cache);
  }

  if (cache.has(zoom)) {
    return cache.get(zoom);
  }

  const rows = sprite.length;
  const cols = sprite[0].length;
  const offscreen = document.createElement("canvas");
  offscreen.width = cols * zoom;
  offscreen.height = rows * zoom;

  const c = offscreen.getContext("2d");
  c.imageSmoothingEnabled = false;

  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < cols; col += 1) {
      const color = sprite[r][col];
      if (!color) continue;
      c.fillStyle = color;
      c.fillRect(col * zoom, r * zoom, zoom, zoom);
    }
  }

  cache.set(zoom, offscreen);
  return offscreen;
}

function drawSpriteData(target, sprite, x, y, zoom = 1) {
  const cached = getCachedSprite(sprite, zoom);
  target.drawImage(cached, Math.round(x), Math.round(y));
}

function isReadingTool(tool) {
  if (!tool) return false;
  return READING_TOOLS.has(tool);
}

function drawCharacterSprite(ch, seated = false) {
  const atlas = CHARACTER_ATLASES[ch.palette % CHARACTER_ATLASES.length];
  const frameWalk = [0, 1, 2, 1];

  let row = 0;
  if (ch.dir === Direction.UP) row = 1;
  else if (ch.dir === Direction.LEFT || ch.dir === Direction.RIGHT) row = 2;

  let frameCol = 1;
  if (ch.state === CharacterState.WALK) {
    frameCol = frameWalk[ch.frame % 4];
  } else if (ch.state === CharacterState.TYPE) {
    frameCol = isReadingTool(ch.currentTool) ? 5 + (ch.frame % 2) : 3 + (ch.frame % 2);
  }

  const drawW = 16 * CHARACTER_RENDER_SCALE;
  const drawH = 32 * CHARACTER_RENDER_SCALE;
  const x = Math.round(ch.x - drawW / 2);
  const yOffset = seated ? CHARACTER_SITTING_OFFSET_PX : 0;
  const y = Math.round(ch.y + yOffset - drawH);

  drawPx(
    ctx,
    ch.x - 7 * CHARACTER_RENDER_SCALE,
    ch.y + 6,
    14 * CHARACTER_RENDER_SCALE,
    3,
    "rgba(0,0,0,0.28)"
  );

  if (atlas.complete && atlas.naturalWidth > 0) {
    const sx = frameCol * 16;
    const sy = row * 32;

    if (ch.dir === Direction.LEFT) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(atlas, sx, sy, 16, 32, -x - drawW, y, drawW, drawH);
      ctx.restore();
    } else {
      ctx.drawImage(atlas, sx, sy, 16, 32, x, y, drawW, drawH);
    }
    return;
  }

  drawPx(ctx, x + 4, y + 8, 8, 8, "#f2c4a8");
  drawPx(ctx, x + 4, y + 16, 8, 8, "#76b2ff");
  drawPx(ctx, x + 5, y + 24, 3, 6, "#334466");
  drawPx(ctx, x + 8, y + 24, 3, 6, "#334466");
}

function drawAgents() {
  const agents = Array.from(state.agents.values()).sort((a, b) => a.y - b.y);
  for (const agent of agents) {
    drawCharacterSprite(agent, true);
    if (agent.level >= 3) {
      drawPx(ctx, agent.x - 5, agent.y - 22, 10, 2, "#ffd870");
      drawPx(ctx, agent.x - 3, agent.y - 24, 6, 2, "#ffd870");
    }
  }
}

function drawVehicles() {
  const movers = [...state.vehicles].sort((a, b) => a.y - b.y);
  for (const v of movers) {
    drawCharacterSprite(v, false);
  }
}

function drawEffects() {
  for (const e of state.effects) {
    const p = tileCenter(e.x, e.y);
    const progress = Math.min(1, e.age / e.ttl);

    if (e.type === "pulse") {
      const size = Math.floor(4 + progress * 14);
      const alpha = 1 - progress;
      ctx.strokeStyle = `rgba(180,255,196,${alpha.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - size, p.y - size, size * 2, size * 2);
    }

    if (e.type === "beacon") {
      const on = Math.floor(e.blink / 0.2) % 2 === 0;
      if (on) {
        drawSpriteData(ctx, BUBBLE_PERMISSION_SPRITE, p.x - 6, p.y - 28, 1);
      } else {
        drawSpriteData(ctx, BUBBLE_WAITING_SPRITE, p.x - 6, p.y - 28, 1);
      }
    }
  }
}

function render() {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(STATIC_LAYER, 0, 0);
  drawAgents();
  drawVehicles();
  drawEffects();
}

function updateHud() {
  wsStatusEl.textContent = `WS: ${state.wsState}`;
  metricsEl.textContent = `agents=${state.agents.size} couriers=${state.vehicles.length} effects=${state.effects.length}`;
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

function buildStaticLayer() {
  const layer = document.createElement("canvas");
  layer.width = WORLD.width;
  layer.height = WORLD.height;
  const c = layer.getContext("2d");
  c.imageSmoothingEnabled = false;

  drawWorldTiles(c);
  drawDistrictFurniture(c);
  drawDecor(c);
  drawHQ(c);
  drawDistrictLabels(c);

  return layer;
}

function drawWorldTiles(c) {
  drawPx(c, 0, 0, WORLD.width, WORLD.height, "#192b3c");

  for (let y = 0; y < WORLD.rows; y += 1) {
    for (let x = 0; x < WORLD.cols; x += 1) {
      const kind = TILE_KIND[y][x];
      const district = TILE_DISTRICT[y][x] || "Backend";
      const palette = DISTRICT_PIXEL[district] || DISTRICT_PIXEL.Backend;
      const px = x * WORLD.tile;
      const py = y * WORLD.tile;

      if (kind === "outside") {
        const base = (x + y) % 2 === 0 ? palette.outsideA : palette.outsideB;
        drawPx(c, px, py, 16, 16, base);
        drawPx(c, px, py, 16, 1, "rgba(255,255,255,0.05)");
      } else if (kind === "office_floor") {
        const base = (x + y) % 2 === 0 ? palette.floorA : palette.floorB;
        drawPx(c, px, py, 16, 16, base);
        drawPx(c, px, py, 16, 1, "rgba(255,255,255,0.08)");
        drawPx(c, px, py, 1, 16, "rgba(0,0,0,0.08)");
        if ((x + y) % 3 === 0) drawPx(c, px + 10, py + 3, 2, 2, "rgba(255,255,255,0.1)");
      } else if (kind === "hall") {
        drawPx(c, px, py, 16, 16, "#7f6b53");
        drawPx(c, px, py + 2, 16, 2, "#9b8468");
        drawPx(c, px, py + 8, 16, 1, "rgba(255,255,255,0.12)");
      } else if (kind === "lobby") {
        drawPx(c, px, py, 16, 16, "#b89f7a");
        drawPx(c, px, py, 16, 2, "#d6c19a");
        drawPx(c, px, py + 8, 16, 1, "rgba(0,0,0,0.14)");
      } else if (kind === "meeting_floor") {
        drawPx(c, px, py, 16, 16, "#9f8f77");
        drawPx(c, px, py + 4, 16, 1, "rgba(255,255,255,0.1)");
        drawPx(c, px, py + 12, 16, 1, "rgba(0,0,0,0.1)");
      } else if (kind === "wall") {
        drawPx(c, px, py, 16, 4, "#ece1cf");
        drawPx(c, px, py + 4, 16, 12, "#a58967");
        drawPx(c, px, py + 4, 2, 12, "#c8ae87");
        drawPx(c, px + 13, py + 5, 2, 10, "#8a6d4a");
        drawPx(c, px + 2, py + 2, 12, 1, palette.accent);
      } else if (kind === "glass") {
        drawPx(c, px, py, 16, 16, "#8db5c0");
        drawPx(c, px, py, 16, 2, "#d4ebf3");
        drawPx(c, px, py + 2, 2, 14, "#6d8c93");
        drawPx(c, px + 14, py + 2, 2, 14, "#6d8c93");
        drawPx(c, px + 4, py + 6, 8, 2, "rgba(255,255,255,0.25)");
      }
    }
  }
}

function drawDistrictFurniture(c) {
  for (const seats of Object.values(DISTRICT_SEATS)) {
    for (const seat of seats) {
      const deskX = seat.deskCol * WORLD.tile;
      const deskY = seat.deskRow * WORLD.tile;

      drawSpriteData(c, DESK_SQUARE_SPRITE, deskX, deskY, 1);
      drawSpriteData(c, PC_SPRITE, deskX + 8, deskY + 4, 1);
      drawSpriteData(c, CHAIR_SPRITE, seat.seatCol * WORLD.tile, seat.seatRow * WORLD.tile, 1);
    }
  }
}

function drawDecor(c) {
  for (const item of DECOR_ITEMS) {
    if (item.type === "plant") {
      drawSpriteData(c, PLANT_SPRITE, item.col * WORLD.tile, item.row * WORLD.tile - 8, 1);
    }
    if (item.type === "bookshelf") {
      const px = item.col * WORLD.tile;
      const py = item.row * WORLD.tile;
      drawPx(c, px, py, 16, 16, "#64441d");
      drawPx(c, px + 1, py + 2, 14, 2, "#a46e2c");
      drawPx(c, px + 1, py + 7, 14, 2, "#a46e2c");
      drawPx(c, px + 1, py + 12, 14, 2, "#a46e2c");
      drawPx(c, px + 3, py + 3, 2, 3, "#d45050");
      drawPx(c, px + 6, py + 3, 2, 3, "#5c97d2");
      drawPx(c, px + 9, py + 3, 2, 3, "#6bb170");
      drawPx(c, px + 12, py + 3, 2, 3, "#d3b25b");
    }
    if (item.type === "coffee") {
      const px = item.col * WORLD.tile;
      const py = item.row * WORLD.tile;
      drawPx(c, px + 2, py + 2, 12, 12, "#6a7078");
      drawPx(c, px + 4, py + 4, 8, 6, "#a6d7f5");
      drawPx(c, px + 5, py + 11, 6, 2, "#3c3f45");
    }
  }
}

function drawHQ(c) {
  const px = HQ.x * WORLD.tile;
  const py = HQ.y * WORLD.tile;

  drawPx(c, px - 16, py - 16, 48, 48, "#806547");
  drawPx(c, px - 14, py - 14, 44, 44, "#a88a66");
  drawPx(c, px - 6, py - 10, 28, 10, "#d6b085");
  drawPx(c, px - 2, py + 1, 20, 10, "#7c5635");
  drawPx(c, px + 4, py + 12, 8, 8, "#5c4028");

  c.font = "bold 11px monospace";
  c.fillStyle = "#f9f2dd";
  c.fillText("RECEPTION", px - 15, py - 20);
}

function drawDistrictLabels(c) {
  for (const [name, d] of Object.entries(DISTRICTS)) {
    const x = d.x1 * WORLD.tile + 8;
    const y = d.y1 * WORLD.tile + 7;

    drawPx(c, x - 4, y - 2, 122, 20, "rgba(14,24,35,0.56)");
    c.font = "bold 16px monospace";
    c.fillStyle = "#f3f7ff";
    c.fillText(name.toUpperCase(), x + 4, y + 13);
  }
}

function createOfficeLayout() {
  const tileKind = Array.from({ length: WORLD.rows }, () =>
    Array.from({ length: WORLD.cols }, () => "outside")
  );
  const tileDistrict = Array.from({ length: WORLD.rows }, () =>
    Array.from({ length: WORLD.cols }, () => null)
  );
  const blockedTiles = new Set();
  const decor = [];
  const seats = {
    Frontend: [],
    Backend: [],
    Infra: [],
    Tests: [],
  };

  function key(col, row) {
    return `${col},${row}`;
  }

  function inBounds(col, row) {
    return col >= 0 && col < WORLD.cols && row >= 0 && row < WORLD.rows;
  }

  function setTile(col, row, kind, district) {
    if (!inBounds(col, row)) return;
    tileKind[row][col] = kind;
    tileDistrict[row][col] = district;
  }

  function block(col, row) {
    if (!inBounds(col, row)) return;
    blockedTiles.add(key(col, row));
  }

  function unblock(col, row) {
    blockedTiles.delete(key(col, row));
  }

  function setWall(col, row, district) {
    setTile(col, row, "wall", district);
    block(col, row);
  }

  function setGlass(col, row, district) {
    setTile(col, row, "glass", district);
    block(col, row);
  }

  function carveHallPath(fromCol, fromRow, toCol, toRow, district) {
    let x = fromCol;
    let y = fromRow;

    while (x !== toCol) {
      setTile(x, y, "hall", district);
      unblock(x, y);
      x += Math.sign(toCol - x);
    }

    while (y !== toRow) {
      setTile(x, y, "hall", district);
      unblock(x, y);
      y += Math.sign(toRow - y);
    }

    setTile(toCol, toRow, "hall", district);
    unblock(toCol, toRow);
  }

  function pickDoorTowardsHQ(room) {
    const centerX = Math.floor((room.x1 + room.x2) / 2);
    const centerY = Math.floor((room.y1 + room.y2) / 2);
    const dx = HQ.x - centerX;
    const dy = HQ.y - centerY;

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) {
        return { x: room.x2, y: centerY, insideX: room.x2 - 1, insideY: centerY };
      }
      return { x: room.x1, y: centerY, insideX: room.x1 + 1, insideY: centerY };
    }

    if (dy > 0) {
      return { x: centerX, y: room.y2, insideX: centerX, insideY: room.y2 - 1 };
    }
    return { x: centerX, y: room.y1, insideX: centerX, insideY: room.y1 + 1 };
  }

  function placeMeetingRoom(room, district, districtName) {
    let x1 = room.x1 + 2;
    let y1 = room.y1 + 2;

    if (districtName === "Backend") x1 = room.x2 - 10;
    if (districtName === "Infra") y1 = room.y2 - 8;
    if (districtName === "Tests") {
      x1 = room.x2 - 10;
      y1 = room.y2 - 8;
    }

    const meeting = {
      x1,
      y1,
      x2: x1 + 8,
      y2: y1 + 6,
    };

    for (let y = meeting.y1; y <= meeting.y2; y += 1) {
      for (let x = meeting.x1; x <= meeting.x2; x += 1) {
        setTile(x, y, "meeting_floor", district);
      }
    }

    for (let x = meeting.x1; x <= meeting.x2; x += 1) {
      setGlass(x, meeting.y1, district);
      setGlass(x, meeting.y2, district);
    }
    for (let y = meeting.y1; y <= meeting.y2; y += 1) {
      setGlass(meeting.x1, y, district);
      setGlass(meeting.x2, y, district);
    }

    const doorX = Math.floor((meeting.x1 + meeting.x2) / 2);
    const doorY = districtName === "Infra" || districtName === "Tests" ? meeting.y1 : meeting.y2;
    setTile(doorX, doorY, "hall", district);
    unblock(doorX, doorY);

    return meeting;
  }

  function canPlaceDesk(col, row) {
    const footprint = [
      { x: col, y: row },
      { x: col + 1, y: row },
      { x: col, y: row + 1 },
      { x: col + 1, y: row + 1 },
      { x: col + 1, y: row + 2 },
    ];

    for (const cell of footprint) {
      if (!inBounds(cell.x, cell.y)) return false;
      if (tileKind[cell.y][cell.x] !== "office_floor") return false;
      if (blockedTiles.has(key(cell.x, cell.y))) return false;
    }

    return true;
  }

  for (const [district, bounds] of Object.entries(DISTRICTS)) {
    for (let y = bounds.y1; y <= bounds.y2; y += 1) {
      for (let x = bounds.x1; x <= bounds.x2; x += 1) {
        setTile(x, y, "outside", district);
      }
    }

    const room = {
      x1: bounds.x1 + 2,
      y1: bounds.y1 + 2,
      x2: bounds.x2 - 2,
      y2: bounds.y2 - 2,
    };

    for (let y = room.y1 + 1; y <= room.y2 - 1; y += 1) {
      for (let x = room.x1 + 1; x <= room.x2 - 1; x += 1) {
        setTile(x, y, "office_floor", district);
      }
    }

    for (let x = room.x1; x <= room.x2; x += 1) {
      setWall(x, room.y1, district);
      setWall(x, room.y2, district);
    }
    for (let y = room.y1; y <= room.y2; y += 1) {
      setWall(room.x1, y, district);
      setWall(room.x2, y, district);
    }

    const meeting = placeMeetingRoom(room, district, district);

    const door = pickDoorTowardsHQ(room);
    setTile(door.x, door.y, "hall", district);
    unblock(door.x, door.y);
    setTile(door.insideX, door.insideY, "hall", district);
    unblock(door.insideX, door.insideY);

    const roomCenterX = Math.floor((room.x1 + room.x2) / 2);
    const roomCenterY = Math.floor((room.y1 + room.y2) / 2);
    carveHallPath(door.insideX, door.insideY, roomCenterX, roomCenterY, district);

    carveHallPath(HQ.x, HQ.y, door.x, door.y, district);

    decor.push({ type: "plant", col: room.x1 + 1, row: room.y1 + 1 });
    decor.push({ type: "plant", col: room.x2 - 1, row: room.y1 + 1 });
    decor.push({ type: "bookshelf", col: room.x1 + 1, row: room.y2 - 1 });
    decor.push({ type: "coffee", col: room.x2 - 1, row: room.y2 - 1 });

    block(room.x1 + 1, room.y1 + 1);
    block(room.x2 - 1, room.y1 + 1);
    block(room.x1 + 1, room.y2 - 1);
    block(room.x2 - 1, room.y2 - 1);

    let seatId = 0;
    const corridorX = roomCenterX;
    const corridorY = roomCenterY;

    for (let y = room.y1 + 3; y <= room.y2 - 5; y += 6) {
      for (let x = room.x1 + 3; x <= room.x2 - 5; x += 7) {
        if (Math.abs(x - corridorX) <= 2 || Math.abs(y - corridorY) <= 1) continue;
        if (x >= meeting.x1 - 1 && x <= meeting.x2 + 1 && y >= meeting.y1 - 2 && y <= meeting.y2 + 1) continue;
        if (!canPlaceDesk(x, y)) continue;

        const seatCol = x + 1;
        const seatRow = y + 2;

        seats[district].push({
          id: `${district}-${seatId}`,
          district,
          deskCol: x,
          deskRow: y,
          seatCol,
          seatRow,
          facingDir: Direction.UP,
        });
        seatId += 1;

        block(x, y);
        block(x + 1, y);
        block(x, y + 1);
        block(x + 1, y + 1);
        block(seatCol, seatRow);
      }
    }
  }

  for (let y = HQ.y - 1; y <= HQ.y + 1; y += 1) {
    for (let x = HQ.x - 1; x <= HQ.x + 1; x += 1) {
      setTile(x, y, "lobby", "Tests");
      unblock(x, y);
    }
  }

  unblock(HQ.x, HQ.y);

  return {
    tileKind,
    tileDistrict,
    blockedTiles,
    decor,
    seats,
  };
}

function connectDemoHelpers() {
  let demoTimer = null;

  function dispatch(evt) {
    window.dispatchAgentEvent(evt);
  }

  const api = {
    help() {
      console.log("Agent Viz demo commands:");
      console.log('window.dispatchAgentEvent({ type: "item.completed", path: "tests/unit/foo.test.ts" });');
      console.log('window.dispatchAgentEvent({ type: "error", message: "failed", path: "server/api.ts" });');
      console.log("window.agentVizDemo.complete('src/components/button.tsx');");
      console.log("window.agentVizDemo.error('lint failed', 'tests/unit/foo.test.ts');");
      console.log("window.agentVizDemo.tool('Read', 'README.md');");
      console.log("window.agentVizDemo.play(); // scripted 1-minute showcase");
      console.log("window.agentVizDemo.stop();");
    },
    dispatch,
    complete(path = "tests/unit/foo.test.ts") {
      dispatch({ type: "item.completed", path });
    },
    error(message = "task failed", path = "src/server/index.ts") {
      dispatch({ type: "error", message, path });
    },
    tool(tool = "Read", path = "src/app.ts") {
      dispatch({ type: "tool_call", tool, path });
    },
    burst() {
      dispatch({ type: "tool_call", tool: "Read", path: "src/app.ts" });
      dispatch({ type: "item.completed", path: "src/app.ts" });
      dispatch({ type: "tool_call", tool: "Edit", path: "src/components/panel.tsx" });
      dispatch({ type: "item.completed", path: "src/components/panel.tsx" });
      dispatch({ type: "tool_call", tool: "Read", path: "tests/unit/foo.test.ts" });
      dispatch({ type: "item.completed", path: "tests/unit/foo.test.ts" });
      dispatch({ type: "error", message: "timeout", path: "infra/deploy.yaml" });
    },
    play() {
      api.stop();
      const script = [
        { type: "tool_call", tool: "Read", path: "README.md" },
        { type: "item.completed", path: "README.md" },
        { type: "tool_call", tool: "Edit", path: "src/frontend/dashboard.tsx" },
        { type: "item.completed", path: "src/frontend/dashboard.tsx" },
        { type: "tool_call", tool: "Bash", path: "package.json" },
        { type: "item.completed", path: "package.json" },
        { type: "tool_call", tool: "Read", path: "infra/terraform/main.tf" },
        { type: "error", message: "terraform plan failed", path: "infra/terraform/main.tf" },
        { type: "tool_call", tool: "Read", path: "tests/unit/auth.test.ts" },
        { type: "item.completed", path: "tests/unit/auth.test.ts" },
        { type: "tool_call", tool: "Edit", path: "server/routes/api.ts" },
        { type: "item.completed", path: "server/routes/api.ts" },
      ];

      let i = 0;
      demoTimer = setInterval(() => {
        dispatch(script[i]);
        i += 1;
        if (i >= script.length) {
          api.stop();
        }
      }, 1100);
    },
    stop() {
      if (demoTimer) {
        clearInterval(demoTimer);
        demoTimer = null;
      }
    },
  };

  window.agentVizDemo = api;
  window.showDispatchExamples = api.help;
}

let previous = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;

  updateAgents(dt);
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

connectDemoHelpers();
addLogLine("Tip: window.agentVizDemo.help() in DevTools console");
connectWebSocket();
updateHud();
requestAnimationFrame(frame);
