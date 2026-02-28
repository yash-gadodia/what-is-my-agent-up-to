# What Is My Agent Up To? (WIMUT)

Canvas dashboard for live Codex app-server events.

It listens to `ws://localhost:8787`, maps Codex app-server notifications into stable visual signals, and renders a Singapore-themed pixel city that shows activity, file touch points, failures, success, and stuck loops.

## Problem

Agent coding sessions are hard to observe live. Teams can see logs, but cannot quickly answer:

- what the agent is doing now
- where effort is going
- whether progress is real or stuck in a loop

## Solution

WIMUT turns Codex runtime signals into a visual control tower:

- app-server notifications streamed in real time
- stable derived signals (`tool`, `file change`, `error`, `success`, `step`)
- map + timeline + scorecard + replay for fast operator decisions

## What This Is

- Real-time visualiser for Codex app-server notifications
- Multi-run lanes with agent status: idle, working, error, done
- Replay, scrub, import, and export for demos
- Simulator pack for guaranteed stage flow

## Architecture (Current)

1. `relay.mjs` starts `codex app-server` and connects as a JSON-RPC client.
2. Relay sends `initialize`, `thread/start`, then `turn/start` with your prompt.
3. Relay forwards app-server notifications to browser websocket clients at `ws://localhost:8787`.
4. `public/mapping.js` converts raw notifications to stable derived events.
5. `public/app.js` updates run state, scorecard, stuck detection, timeline, and canvas visuals.
6. Optional `helper.mjs` adds git-diff ground truth for changed files.

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

Optional git diff helper (for ground truth changed files):

```bash
npm run helper
```

Then in the UI:

1. Set `Repo path`
2. Enable `Use git diff`
3. Click `Set Repo`

## Demo Script For Judges

1. Start UI with `npm run dev`.
2. Start relay with a coding prompt in a target repo.
3. Show live websocket status and runs list.
4. Explain city mapping:
   - `CBD` for general files
   - `Bugis` for frontend paths
   - `Jurong` for infra paths
   - `Changi` for tests
5. Trigger activity and narrate:
   - tool activity spawns vehicles from Merlion HQ
   - file changes upgrade district buildings
   - errors trigger red beacon and smoke
   - success triggers fireworks near Marina Bay
6. Show right panel scorecard and stuck score interventions.
7. Open timeline item and inspect raw JSON plus derived meaning.
8. Switch to replay, scrub slider, and speed up at `2x` or `5x`.
9. Run `Simulator Pack` for `scolded`, `longtask`, `asleep` flows.

## Simulator Mode

Built-in buttons generate plausible Codex-like events for:

- `scolded`
- `longtask`
- `asleep`

This is useful when websocket data is unavailable or for a fixed-time stage demo.

## Troubleshooting

- WebSocket stuck on reconnecting
  - confirm relay is running on `ws://localhost:8787`
  - confirm app-server port `8791` is free (or set `--app-server-port`)
  - click `Reconnect WS`
- Relay exits immediately with app-server error
  - confirm Codex CLI supports `codex app-server`
  - check relay output for `appserver.error`
  - this relay intentionally fails fast and does not fallback to `exec --json`
- App-server starts but no visible progress
  - verify prompt is passed in relay command
  - inspect timeline raw event payloads in UI inspector
  - run simulator pack to validate rendering path
- Events arrive but city does not react
  - inspect timeline and raw JSON in inspector
  - mapping is heuristic and can be tuned in `/public/mapping.js`
- Missing file paths in visuals
  - event may not contain a path and regex may not match
  - enable helper and `Use git diff` for repository ground truth
- Helper offline
  - start `npm run helper`
  - confirm port `8790` is free

## Files

- `/relay.mjs` Codex app-server relay (JSON-RPC client) to websocket
- `/server.mjs` static server for `/public` on `8788`
- `/helper.mjs` optional git diff helper on `8790`
- `/public/mapping.js` raw Codex event/notification to derived visual events
- `/public/app.js` runtime, city rendering, lanes, replay, simulator
- `/docs/HACKATHON.md` judge framing and eval angle
- `/docs/SOUL.md` design principles and theme guidance
- `/docs/OPENAI.md` Codex app-server integration strategy
