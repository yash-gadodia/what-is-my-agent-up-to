# What Is My Agent Up To? (WIMUT)

WIMUT is a live observability dashboard for Codex agent runs.
It turns raw runtime activity into a visual, operator-friendly control tower so teams can quickly understand what the agent is doing, where effort is going, and when intervention is needed.

## Hackathon Context

In live coding-agent sessions, logs are noisy and hard to interpret under time pressure.
This project is built for hackathon judges and operators who need fast answers, not deep protocol reading.

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
- Communication: gives technical and non-technical stakeholders a shared view

## Solution

WIMUT combines:

- live Codex app-server notifications
- stable derived event mapping (`step`, `tool.activity`, `file.changed`, `error`, `success`)
- run lanes, timeline, scorecard, stuck detection, and replay
- a Singapore-themed pixel city metaphor that makes activity legible in seconds

## What We Built

- Real-time dashboard for Codex app-server runs
- Multi-run lanes with status (`idle`, `working`, `error`, `done`)
- Event inspector (raw payload + derived meaning)
- Stuck scoring and suggested intervention text
- Replay/import/export for deterministic demos
- Simulator pack (`scolded`, `longtask`, `asleep`) for reliability
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

1. Set `Repo path`
2. Enable `Use git diff`
3. Click `Set Repo`

## Hackathon Judging Criteria

This project is explicitly optimized for:

1. Clarity of idea
2. Technical execution
3. Completeness
4. Impact and insight
5. Use of Codex

## Judging Coverage Checklist

- Clarity of idea: story panel and captions explain current status quickly.
- Technical execution: live Codex app-server run is visible in map and timeline.
- Completeness: live mode, inspector, scorecard, replay, simulator all work.
- Impact and insight: stuck score and intervention guidance are demonstrated.
- Use of Codex: raw inspector shows Codex-driven notifications in real time.

## Demo Script (2 Minutes)

1. Start UI and relay.
2. State one-line value prop: "We make agent runs observable and intervenable."
3. Show live websocket status and run lanes.
4. Trigger activity and explain district mapping (CBD/Bugis/Jurong/Changi).
5. Open a timeline item and show raw event plus derived meaning.
6. Show scorecard + stuck intervention suggestion.
7. Switch to replay and scrub quickly.
8. Trigger simulator pack to show deterministic fallback reliability.

## Submission Requirements

Submissions close at **6:00 PM local time**.

Required:

1. Public GitHub repository
2. 2 minute video
3. Optional demo link

## Pre-Submission QA

1. Confirm repository is public.
2. Confirm README reflects current architecture and demo flow.
3. Record and verify a <=2 minute video.
4. Include at least one visible live Codex app-server run in the video.
5. Verify replay and simulator fallback paths.
6. Add optional demo link if hosting is available.

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
- `/server.mjs` static server for `/public` on `8788`
- `/helper.mjs` optional git diff helper on `8790`
- `/public/mapping.js` raw event/notification to derived visual events
- `/public/app.js` runtime, city rendering, lanes, replay, simulator
- `/docs/HACKATHON.md` judging framing and demo strategy
- `/docs/SOUL.md` design and product principles
- `/docs/OPENAI.md` Codex app-server integration notes
- `/AGENTS.md` repo-level execution instructions
