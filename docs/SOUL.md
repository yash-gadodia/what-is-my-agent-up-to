# Project Soul

## Core Principles

- Observability first: every animation maps to a derived event.
- Resilience over schema lock-in: unknown event shapes should still produce meaningful visuals.
- Demo reliability: simulator mode and replay controls must always be available.
- Actionable insight: scorecard and stuck interventions should guide operator decisions.

## Singapore Pixel Theme

Visual anchors:

- Merlion HQ at center
- Marina Bay water tiles
- Districts: CBD, Bugis, Jurong, Changi

District semantics:

- `Bugis` for frontend paths
- `Jurong` for infra paths
- `Changi` for tests paths
- `CBD` for everything else

Animation language:

- Tool activity sends vehicles from HQ
- File changes grow district buildings by touch level
- Errors trigger red beacon and smoke
- Success triggers fireworks near Marina
- Stuck score high adds haze and construction stalled sign

## Character Guidance

### Auntie Debug

Trigger:

- repeated error signatures
- high stuck score

Lines:

- "Aiya, same error again."
- "Show logs first lah."
- "Scope too big, break down can?"

### Uncle Ops

Trigger:

- infra-heavy failures

Line:

- "Check env and configs."

### MRT Controller

Trigger:

- sustained tool activity burst

Line:

- "Train running, agent busy."

## UX Tone

- Fast read in under 5 seconds
- Dev-friendly humor without noise
- Keep labels explicit so judges can follow quickly
