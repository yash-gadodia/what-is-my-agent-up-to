# Agent Visualiser MVP

Minimal browser visualiser for live Codex CLI sessions. A small relay process runs `codex exec --json`, streams events over WebSocket, and a canvas app renders a pixel city where activity appears as moving vehicles, building growth, and warning/success effects.

## What this is

This project helps people observe agentic coding in real time:
- WebSocket relay for Codex JSONL events
- Static frontend with rectangle only pixel city visuals
- Event to district mapping that is explicit and easy to tune

## 1 Hour MVP Plan

1. Install dependencies.
2. Start static frontend server.
3. Start relay against a target repo and prompt.
4. Open browser and watch the city respond to live events.
5. Tune mapping rules in `public/app.js` for your repo structure.

## Quick Start

```bash
npm install
npm run dev
```

In a second terminal:

```bash
npm run relay -- --repo /ABS/PATH/TO/OpenClaw --prompt "Run tests and fix the first failure. Explain each step briefly."
```

Open:
- [http://localhost:8788](http://localhost:8788)

## Run Against OpenClaw

Example:

```bash
npm run relay -- --repo /Users/yash/Documents/Voltade/Code/OpenClaw --prompt "Run test suite, fix the first failing test, and stop after one fix."
```

Expected behavior:
- `tool_call` and turn start activity spawn vehicles from HQ
- file paths create and upgrade buildings
- failures create red beacon flashes
- successes create green pulses

## File Map

- `relay.mjs`: Runs Codex CLI and forwards JSON events over WebSocket.
- `server.mjs`: Minimal static server for `public/` at `http://localhost:8788`.
- `public/app.js`: World state, event heuristics, animation loop, and rendering.
- `docs/OPENAI.md`: Codex integration details.
- `docs/SOUL.md`: Design intent and constraints.
- `docs/HACKATHON.md`: Problem statement and judging pitch.

## Troubleshooting Checklist

- `codex` command not found: install Codex CLI and verify `codex --help` works.
- Browser shows `WS: disconnected`: ensure relay is running on port `8787`.
- Blank page: ensure `npm run dev` is active on port `8788`.
- No events arriving: verify relay repo path exists and prompt is passed.
- JSON parse warnings are normal: relay ignores malformed non JSON lines.

## Tomorrow Improvements

1. Add session recording and replay timeline controls.
2. Add event filters, speed controls, and district toggles.
3. Support richer event taxonomy from Codex JSON schema variants.
4. Add path overlays showing multi hop vehicle journeys.
5. Add deterministic replay fixtures for regression testing.
