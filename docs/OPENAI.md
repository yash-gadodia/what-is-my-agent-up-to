# OpenAI and Codex Integration

## Why `codex exec --json`

`codex exec --json` gives line delimited JSON output that is machine friendly and streamable. This enables a thin relay that forwards events in real time to a browser over WebSocket without complex parsing dependencies.

## Relay Flow

1. Relay starts a WebSocket server on `ws://localhost:8787`.
2. Relay spawns:

```bash
codex exec --json <prompt>
```

with working directory set to the target repo.

3. Stdout is treated as JSONL.
4. Each line is parsed with `JSON.parse` in a try/catch.
5. Parsed objects are broadcast to all connected browser clients.
6. Stderr is also forwarded as:

```json
{ "type": "codex.stderr", "ts": 0, "text": "..." }
```

7. Relay lifecycle events are emitted:
- `relay.started`
- `codex.exit`

## JSONL Parsing Notes

- Parsing is best effort and non fatal.
- Malformed lines are ignored so the relay stays alive.
- Any trailing buffered line is parsed once on process exit.

## Event Mapping Strategy

`public/app.js` contains the event to visual mapping logic.

Primary hooks to adjust:
- `chooseDistrictFromPath(filePath)`
- `chooseDistrictFromEvent(evt, fallback)`
- `isToolCallEvent(evt, eventType)`
- `isErrorEvent(evt, eventType)`
- `isSuccessEvent(evt, eventType)`
- `FILE_REGEX` for file path extraction

Current behavior:
- Tool and turn started style events spawn vehicles from HQ.
- File paths map to district tiles and grow buildings by touch count.
- Error and failed signals create red beacon effects.
- Completed and passed signals create green pulse effects.
