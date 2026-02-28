# Hackathon Brief

## Problem

Agent coding sessions are hard to observe live. Teams see long logs but cannot quickly answer:

- what the agent is doing now
- where effort is going
- whether it is stuck in loops

## Solution

WIMUT converts streaming Codex app-server notifications into a Singapore-themed pixel city with run lanes, timeline inspection, and stuck detection.

## Why It Matters

- Improves trust in agent runs by showing behavior instead of only logs
- Helps teams intervene earlier when loops or repeated failures appear
- Makes demos legible for technical and non-technical judges

## Official Judging Criteria

1. Clarity of idea
2. Technical execution
3. Completeness
4. Impact and insight
5. Use of Codex

## Submission Requirements

Submissions close at **6:00 PM local time**.

Required deliverables:

1. Public GitHub repo
2. 2 minute video
3. Optional demo link

## Evaluation Angle

The dashboard reports measurable run signals:

- duration
- tool activity count
- file changed count
- error count
- success count
- stuck score from loop heuristics

This gives a lightweight eval lens without requiring runtime-specific integrations.

## Technical One-Liner

`relay.mjs` drives `codex app-server` (initialize -> thread/start -> turn/start), forwards notifications to `ws://localhost:8787`, and the frontend maps those events into stable operational signals.

## Criteria To Feature Mapping

1. Clarity of idea
- Story panel + caption bar explain current state in plain language.

2. Technical execution
- `relay.mjs` app-server integration + live WS stream + inspector raw payload.

3. Completeness
- Run lanes, timeline, scorecard, replay, simulator, optional git-diff helper.

4. Impact and insight
- Stuck score, intervention suggestion, and district-level activity narrative.

5. Use of Codex
- Live app-server notifications displayed and inspectable during demo.

## Two Minute Demo Flow

1. Start `npm run dev` and open `http://localhost:8788`.
2. Start relay against a repo with `node relay.mjs --repo <path> --prompt "..."`.
3. State the idea clearly in one line: "We make agent runs observable and intervenable."
4. Show run lanes and live websocket status (technical execution + Codex usage).
5. Trigger activity and point at district mapping and animations (clarity + impact).
6. Open a timeline item and inspect raw plus derived meaning (completeness).
7. Show stuck score and suggested intervention copy (insight).
8. Use replay slider and `2x` speed for deterministic proof (completeness).
9. Trigger simulator pack for `scolded`, `longtask`, `asleep` fallback reliability.

## Scope Guardrails

- No OpenClaw runtime process integration in this build
- Input source is Codex app-server notifications relayed to `ws://localhost:8787`
- Mapping is resilient to unknown event types

## Pre-Submission Gate

1. Public repo link works without authentication.
2. Video length is <=2 minutes and includes live Codex run evidence.
3. Optional demo link, if provided, is reachable.
