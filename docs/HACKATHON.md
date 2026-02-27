# Hackathon Brief

## Problem Statement

Agentic coding tools are powerful but hard to observe in real time. Teams struggle to see where the agent is working, what changed, and whether a run is healthy without reading dense logs.

## Solution In 1 Sentence

Stream Codex CLI JSON events into a live pixel city that makes progress, failures, and code touchpoints visible in seconds.

## Demo Script (2 Minutes)

1. Show two terminals and browser side by side.
2. Start frontend server: `npm run dev`.
3. Start relay against OpenClaw with a concrete coding prompt.
4. Explain city layout: Frontend, Backend, Infra, Tests, plus HQ.
5. Trigger run and narrate live updates:
- vehicle movement when tools or turns start
- building growth when files are touched
- red beacon on failures
- green pulse on completion events
6. Close with why this helps teams trust and steer autonomous coding.

## Why Judges Should Care

- Improves observability for agentic coding workflows.
- Increases trust through transparent, real time activity mapping.
- Lightweight architecture that teams can adopt in under one hour.
- Clear path to replay, analytics, and team operations features.

## Stretch Goals

- Session recording and replay timeline.
- Side panel with semantic event filters.
- Multi agent lanes and branch comparison mode.
- CI integration for post run visualization links.
- Heatmap mode for long running sessions.
