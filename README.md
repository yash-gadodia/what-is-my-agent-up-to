# What Is My Agent Up To? (WIMUT)

WIMUT is a live observability dashboard for Codex agent runs.
It turns raw runtime activity into a visual, operator-friendly control tower so teams can quickly understand what the agent is doing, where effort is going, and when intervention is needed.

License: MIT (see `/LICENSE`).

## Open Source

- Contribution guide: `/CONTRIBUTING.md`
- Community expectations: `/CODE_OF_CONDUCT.md`

WIMUT focuses on one core question:
- What is my agent up to right now?

## Problem

Agent coding sessions are hard to observe live. Teams can usually see output, but still cannot quickly answer:

- what the agent is doing now
- whether progress is real or just repetitive tool loops
- where changes are happening
- when to intervene

## Why This Matters

- Trust: makes agent behavior visible instead of opaque
- Speed: reduces time to understand current run state
- Control: enables timely intervention when stuck patterns appear
- Communication: gives engineers and stakeholders a shared runtime view

## Solution

WIMUT combines:

- live Codex app-server notifications
- stable derived event mapping (`step`, `tool.activity`, `file.changed`, `error`, `success`)
- run lanes, timeline, scorecard, stuck detection, and replay
- a Singapore-themed pixel city metaphor that makes activity legible in seconds

## Visual-First Layout (Current)

Default load state:

- sticky one-row top summary bar (run identity, mode, connection, status, runtime, anomaly/counters)
- streets canvas as the main viewport
- left-edge `OPS` tab with attention badge (drawer closed by default)
- right agent drawer closed until an agent is selected
- bottom Approval Street as a thin strip when approvals are `0 pending`

Core interactions:

- `Needs attention` opens Ops drawer to the queue
- `Approvals pending` expands Approval Street
- `First anomaly` jumps focus and highlights the relevant run
- top CTA is context-sensitive: `Approve next` -> `Jump to first anomaly` -> `Open Ops`

Replay and simulator controls live under `Ops -> Dev tools` (collapsed by default) so fallback reliability is preserved without shrinking the visual map.

## What We Built

- Real-time dashboard for Codex app-server runs
- Multi-run lanes with status (`idle`, `working`, `error`, `done`)
- Event inspector (raw payload + derived meaning)
- Stuck scoring and suggested intervention text
- Replay/import/export for deterministic demos
- Simulator pack (`scolded`, `longtask`, `asleep`) for reliability
- Multi-agent swarm mode for concurrent local testing
- Optional git-diff helper for ground-truth changed files

## Architecture (Current)

1. `relay.mjs` starts `codex app-server` and connects as a JSON-RPC client.
2. Relay sends `initialize`, `thread/start`, then `turn/start` with your prompt.
3. Relay forwards app-server notifications to browser websocket clients at `ws://localhost:8787`.
4. `public/mapping.js` converts raw notifications to stable derived events.
5. `public/app.js` updates run state, scorecard, stuck detection, timeline, and canvas visuals.
6. Optional `helper.mjs` provides git-diff signals to strengthen file-change truth.

## Build and Runtime Components

- `server.mjs`: static web server for the UI on `http://localhost:8788`
- `relay.mjs`: Codex app-server harness and websocket broadcaster on `ws://localhost:8787`
- `helper.mjs`: optional git diff API on `http://localhost:8790`
- `public/mapping.js`: event normalization and derived signal mapping
- `public/app.js`: runtime state machine, rendering, replay, and UX logic

## Event Flow (Harness)

1. Codex app-server emits protocol notifications.
2. Relay forwards notifications plus lifecycle events (`relay.started`, `appserver.connected`, `appserver.error`, `codex.exit`).
3. Frontend ingests raw events and derives stable semantic events.
4. Derived events drive UI state, animation, metrics, and interventions.
5. Optional helper adds repository diff-based file-change events.

## How To Run

```bash
npm install
npm run dev
```

Open:

- [http://localhost:8788](http://localhost:8788)

In another terminal, run relay:

```bash
node relay.mjs --repo /abs/path/to/target/repo --prompt "Run tests and fix the first failure"
```

Optional relay internals:

```bash
node relay.mjs --repo /abs/path --prompt "..." --port 8787 --app-server-port 8791
```

Optional git diff helper:

```bash
npm run helper
```

Then in the UI:

1. Confirm top summary connection chip reaches `Connected` (or use `Reconnect` in `Ops -> Dev tools`)
2. Use `Needs attention` and `Approvals pending` chips to jump to intervention surfaces
3. Select an agent tile or queue card to open the right Agent Drawer
4. Expand `Ops -> Dev tools` for replay/simulator controls when needed

## Multi-Agent Local Testing

Use swarm mode to generate concurrent runs:

```bash
npm run swarm -- --repo /abs/path/to/repo --count 4 --port 8899 --continuous true
```

Open the UI against swarm:

- [http://localhost:8788/?ws=ws://localhost:8899](http://localhost:8788/?ws=ws://localhost:8899)

For judge-friendly local demo inside the UI:

- click `Sim calm swarm` for a slow, readable 5-agent lane walkthrough
- one primary active agent per cycle, occasional secondary activity
- low error rate to avoid visual overload

## Railway Auto Redeploy On Push

This repo includes GitHub Actions workflow:

- `.github/workflows/railway-redeploy-on-push.yml`

It deploys to Railway on every push.

Required GitHub repository secrets:

- `RAILWAY_TOKEN` (required)
- `RAILWAY_SERVICE_ID` (required)
- `RAILWAY_PROJECT_ID` (optional)
- `RAILWAY_ENVIRONMENT_ID` (optional)

## Troubleshooting

- WebSocket stuck on reconnecting
  - confirm relay is running on `ws://localhost:8787`
  - confirm app-server port `8791` is free (or set `--app-server-port`)
  - click `Reconnect WS`
- Relay exits immediately with app-server error
  - confirm Codex CLI supports `codex app-server`
  - check relay output for `appserver.error`
  - relay is intentionally fail-fast (no automatic fallback to `exec --json`)
- App-server starts but no visible progress
  - verify prompt is passed in relay command
  - inspect timeline raw payloads in the inspector
  - run simulator pack to validate render path
- Events arrive but city does not react
  - inspect timeline and raw JSON in inspector
  - tune mapping logic in `/public/mapping.js`
- Missing file paths in visuals
  - enable helper and `Use git diff` for ground truth
- Helper offline
  - start `npm run helper`
  - confirm port `8790` is free

## Repo File Map

- `/relay.mjs` Codex app-server relay (JSON-RPC client) to websocket
- `/swarm.mjs` multi-agent relay orchestrator for concurrent testing
- `/server.mjs` static server for `/public` on `8788`
- `/helper.mjs` optional git diff helper on `8790`
- `/public/mapping.js` raw event/notification to derived visual events
- `/public/app.js` runtime, city rendering, lanes, replay, simulator
- `/docs/OPERATORS.md` operator workflow and runbook notes
- `/docs/SOUL.md` design and product principles
- `/docs/OPENAI.md` Codex app-server integration notes
- `/AGENTS.md` repo-level execution instructions
