# Hackathon Brief

## Problem

Agent coding sessions are hard to observe live. Teams see long logs but cannot quickly answer:

- what the agent is doing now
- where effort is going
- whether it is stuck in loops

## Solution

Codex Agent Viz SG converts streaming Codex JSON events into a Singapore-themed pixel city with run lanes, timeline inspection, and stuck detection.

## Why It Matters

- Improves trust in agent runs by showing behavior instead of only logs
- Helps teams intervene earlier when loops or repeated failures appear
- Makes demos legible for technical and non-technical judges

## Evaluation Angle

The dashboard reports measurable run signals:

- duration
- tool activity count
- file changed count
- error count
- success count
- stuck score from loop heuristics

This gives a lightweight eval lens without requiring runtime-specific integrations.

## Two Minute Demo Flow

1. Start `npm run dev` and open `http://localhost:8788`.
2. Start relay against a repo with `node relay.mjs --repo <path> --prompt "..."`.
3. Show run lanes and live websocket status.
4. Trigger activity and point at district mapping and animations.
5. Open a timeline item and inspect raw plus derived meaning.
6. Show stuck score and suggested intervention copy.
7. Use replay slider and `2x` speed.
8. Trigger simulator pack for `scolded`, `longtask`, `asleep`.

## Scope Guardrails

- No OpenClaw runtime process integration in this build
- Input source is Codex JSON events from `ws://localhost:8787`
- Mapping is resilient to unknown event types
