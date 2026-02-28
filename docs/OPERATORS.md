# Operator Runbook

## Problem

Live coding-agent sessions are noisy. Teams can usually see output logs, but still struggle to answer quickly:

- what the agent is doing right now
- where effort is going
- whether progress is healthy or stuck

## Solution

WIMUT converts live Codex app-server notifications into a visual control tower with:

- run lanes and live status
- timeline + raw event inspector
- scorecard + stuck detection
- replay/simulator fallback paths

## Core Runtime Signals

The dashboard tracks:

- duration
- tool activity
- file changes
- error and success counts
- stuck score from repeated-failure and inactivity heuristics

## Technical One-Liner

`relay.mjs` runs `codex app-server` (`initialize -> thread/start -> turn/start`), streams notifications to `ws://localhost:8787`, and the frontend maps those events into stable operational signals.

## Local Operator Flow

1. Run verification first: `npm test`
2. Start UI: `npm run dev`
3. Start helper (optional): `npm run helper`
4. Start relay: `node relay.mjs --repo <path> --prompt "..."`
5. Open `http://localhost:8788`
6. Confirm websocket status is `connected`
7. Inspect a timeline event and compare raw payload vs derived meaning
8. Use scorecard + intervention text to decide whether to continue, redirect, or stop
9. Use the top-bar `Review Alerts` button to jump directly into intervention queue workflows

## Multi-Agent Stress Flow

For concurrent local testing:

1. Start swarm: `npm run swarm -- --repo <path> --count 4 --port 8899 --continuous true`
2. Open `http://localhost:8788/?ws=ws://localhost:8899`
3. Track lane-level differences in error rates, file activity, and stuck score
4. Swarm stream is cinematic by default: noisy deltas are filtered, non-critical events are paced, and file deltas are coalesced for readability
5. If cadence flags are omitted, swarm defaults are slower (`stagger=2400ms`, `restart-delay=10000ms`) for judge readability

### Optional: explicit agent names

To map agents directly to workflows in UI labels:

`npm run swarm -- --repo <path> --count 2 --agent-name "Planner" --agent-name "Verifier" --prompt "Plan workflow" --prompt "Verify workflow"`

Label precedence is:
1. Developer name (`--agent-name`)
2. Codex thread title
3. Workflow + short ID fallback

## Calm Judge Mode

When you need a deterministic fallback, use the in-UI calm simulation:

1. Click `Sim calm swarm`
2. Observe one primary active agent per cycle across 5 lanes
3. Use this view to explain phase progression and intervention logic clearly

This mode prioritizes clarity and completeness for judges while preserving visible Codex-style behavior.

For live judging, prefer swarm cinematic mode first; use calm simulation only if runtime conditions are unstable.

## Criteria Mapping

1. Clarity of idea
- Calm swarm keeps activity readable in under 5 seconds.

2. Technical execution
- Live relay/app-server path remains available; calm simulation is a fallback narrative path.

3. Completeness
- Lanes, timeline, scorecard, inspector, and replay remain demonstrable.

4. Impact and insight
- Stuck score/intervention remain visible without visual overload.

5. Use of Codex
- Prefer live mode when available; use calm simulation only when event density harms comprehension.

## Scope Guardrails

- Input source is Codex app-server notifications relayed to websocket
- Swarm websocket (`8899`) is cinematic/filtered by design; single relay (`8787`) remains raw
- Unknown event shapes should still produce understandable UI behavior
- Prefer fail-fast error states over silent degraded behavior

## Pixel Agent Legend

Map actors now encode status directly through character behavior:

- Active: walking/typing motion
- Waiting: idle pose with yellow thought bubble
- Blocked (system): red outline with shake
- Approval needed: clipboard badge above actor
- Loop detected: pacing left and right
- Done: faded pseudo-sit pose

Each actor also shows a floating progress timer (`⏳`) based on time since last progress signal (tool activity, file change, or success).

### Character Mapping

- Active (`active`): Character 1
- Waiting (`waiting`): Character 2
- Needs approval (`needs-human` / approval gate): Character 3
- Blocked and loop (`blocked`, `loop`): Character 4
- Failed (`failed`): Character 5
- Done (`done`): Character 6

## Crowding Behavior

To keep 15-20+ agents readable:

- Density mode shrinks actor footprint first
- If overflow still exists, one slot becomes a cluster with `+N`
- Cluster click/focus opens the representative run while preserving keyboard navigation

## Approval Street Overlay

- Approval Street is rendered as a dedicated road-themed overlay lane at the bottom of the map viewport.
- On compact-height screens, Approval Street automatically moves below the map viewport to preserve actor visibility and control readability at 100% zoom.
- The lane appears immediately and stays expanded when at least one run requires approval.
- The lane auto-hides entirely when approvals return to `0 pending`.
- The `Lorong Approval` title is a non-interactive visual sign (not a clickable toggle).
- Approval actions (`Approve next`, `Batch approve`, single-item approve) remain available in this lane mode.
