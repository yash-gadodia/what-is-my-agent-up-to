# Codex JSON Integration Notes

## Current Input Contract

This project consumes Codex JSON events streamed over websocket:

- source: `relay.mjs`
- websocket: `ws://localhost:8787`
- relay command: `codex exec --json <prompt>`

No runtime-specific APIs are used.

## Relay Behavior

`relay.mjs`:

1. Spawns Codex CLI in target repo
2. Reads stdout as JSONL
3. Parses line by line with safe `JSON.parse`
4. Broadcasts parsed events to websocket clients
5. Forwards stderr and lifecycle events (`relay.started`, `codex.exit`)

## Frontend Mapping Strategy

Raw events can vary by taxonomy and nesting, so `/public/mapping.js` creates stable derived events:

- `step.started`
- `step.ended`
- `tool.activity`
- `file.changed`
- `error`
- `success`
- `note`

Key mapping choices:

- keeps original raw type string from `type/event/name/kind/status`
- heuristic tool activity when type includes `turn.started`, `tool`, `exec`, or `run`
- heuristic errors for `error`, `failed`, `exception`, `timeout`
- heuristic success for `completed`, `succeeded`, `passed`, `success`
- file path extraction from direct fields, arrays, and regex fallback

## Optional Ground Truth Diff

`helper.mjs` exposes local git diff APIs:

- `POST /api/setRepo { repoPath }`
- `GET /api/diff`

The UI can poll this helper around step boundaries to emit additional `file.changed` signals based on real repository diffs.

## Future Runtime Connectors

Planned expansion path:

- keep the same derived event contract
- add adapters for richer agent runtimes
- route adapters into the same visual pipeline

This keeps the dashboard stable while connectors evolve independently.
