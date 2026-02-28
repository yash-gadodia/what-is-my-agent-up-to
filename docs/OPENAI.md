# Codex App-Server Integration Notes

## Context

The product goal is operational clarity for live agent runs: quickly explain what the agent is doing, where effort is concentrated, and when intervention is needed.

The integration goal is to keep the visual pipeline stable while Codex runtime event schemas evolve.

## Integration Outcomes

This integration exists to keep runtime observability practical for developers:

1. Clarity: derived event contract keeps UI language stable and understandable.
2. Technical execution: live app-server protocol integration is visible and testable.
3. Completeness: single pipeline powers live, replay, and inspector views.
4. Insight: mapping enables stuck detection and intervention copy.
5. Traceability: runtime source is Codex app-server, not simulator-only events.

## Current Input Contract

This project consumes Codex app-server notifications streamed over websocket:

- source: `relay.mjs`
- websocket: `ws://localhost:8787`
- relay command: `codex app-server --listen ws://127.0.0.1:8791` (spawned by `relay.mjs`)

`relay.mjs` runs as a managed app-server client: it connects to app-server over local WS, issues JSON-RPC `initialize`, `thread/start`, and `turn/start`, then forwards notifications to the frontend WS.

## Relay Behavior

`relay.mjs`:

1. Spawns `codex app-server` in target repo
2. Connects to app-server websocket (`ws://127.0.0.1:<app-server-port>`)
3. Sends JSON-RPC startup requests (`initialize`, `thread/start`, `turn/start`)
4. Broadcasts app-server notifications (`{ jsonrpc, method, params }`) to UI websocket clients
5. Emits lifecycle events (`relay.started`, `appserver.connected`, `appserver.error`, `codex.exit`)
6. Uses `approvalPolicy: "never"` for non-interactive runs
7. Parses websocket payload variants (string, Buffer, ArrayBuffer, Buffer[]) through `relay-message.mjs` before JSON-RPC classification

This keeps demo control simple: one relay command launches a run and starts event streaming immediately.

## Frontend Mapping Strategy

Raw events can vary by method and payload shape, so `/public/mapping.js` creates stable derived events:

- `step.started`
- `step.ended`
- `tool.activity`
- `file.changed`
- `error`
- `success`
- `note`

Key mapping choices:

- keeps original raw type string from `method/type/event/name/kind/status`
- maps app-server methods like `turn/started`, `turn/completed`, `item/started`, `item/completed`, `turn/diff/updated`
- heuristic tool activity when type includes `turn.started`, `tool`, `exec`, or `run`
- heuristic errors for `error`, `failed`, `exception`, `timeout`
- heuristic success for `completed`, `succeeded`, `passed`, `success`
- file path extraction from direct fields, arrays, and regex fallback

The dashboard logic consumes derived events only, not raw protocol specifics, so the UI behavior stays understandable even when upstream event details shift.

## Fail-Fast Policy

- If app-server cannot start, connect, or respond to startup requests, relay exits non-zero.
- If app-server websocket closes before turn completion, relay exits non-zero.
- Unexpected server-initiated JSON-RPC requests are rejected with `Method not supported in non-interactive relay`.
- No automatic fallback to `codex exec --json`.

## Optional Ground Truth Diff

`helper.mjs` exposes local git diff APIs:

- `POST /api/setRepo { repoPath }`
- `GET /api/diff`

The UI can poll this helper around step boundaries to emit additional `file.changed` signals based on real repository diffs.

## Future Runtime Connectors

Planned expansion path:

- keep the same derived event contract
- add richer app-server request handling (approvals, tool calls) when needed
- optionally support dual-source mode (`app-server` + legacy JSON relay) behind a runtime toggle

## Local Verification

Use the built-in parser/classifier regression tests before live demos:

```bash
npm test
```
