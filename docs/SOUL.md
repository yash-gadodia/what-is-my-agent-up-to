# Project Soul

## What This Project Is

Agent Visualiser MVP is a live operational map for coding agents. It turns raw event streams into a city metaphor so humans can quickly understand where activity, risk, and progress are happening during a coding run.

## Design Principles

- Observability first: every visual element should correspond to an event.
- Trust through simplicity: clear heuristics, minimal hidden logic.
- Replay friendly architecture: event handling is deterministic where possible.
- Human tone: the interface should feel calm, legible, and grounded.
- City metaphor: districts represent areas of work, HQ is orchestration.

## MVP Non Goals

What we will not do in MVP:
- No A* routing or advanced pathfinding.
- No spritesheets or custom art assets.
- No camera panning, zoom, or world streaming.
- No framework migration or heavy build tooling.

The MVP intentionally stays rectangle based and static canvas so the team can ship quickly and iterate tomorrow.
