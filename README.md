# Codex Agent Viz SG

Canvas dashboard for live Codex JSON events.

It listens to `ws://localhost:8787`, maps unknown or changing Codex event taxonomies into stable visual signals, and renders a Singapore-themed pixel city that shows activity, code touch points, failures, success, and stuck loops.

## What This Is

- Real-time visualiser for Codex JSON mode events
- Multi-run lanes with agent status: idle, working, error, done
- Replay, scrub, import, and export for demos
- Simulator pack for guaranteed stage flow

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
  - click `Reconnect WS`
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

- `/relay.mjs` Codex JSON relay to websocket
- `/server.mjs` static server for `/public` on `8788`
- `/helper.mjs` optional git diff helper on `8790`
- `/public/mapping.js` raw Codex event to derived visual events
- `/public/app.js` runtime, city rendering, lanes, replay, simulator
- `/docs/HACKATHON.md` judge framing and eval angle
- `/docs/SOUL.md` design principles and theme guidance
- `/docs/OPENAI.md` Codex JSON integration strategy
