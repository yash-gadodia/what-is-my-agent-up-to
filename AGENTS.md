# Agent Instructions For This Repo

This file defines delivery priorities for contributors and coding agents working on WIMUT.

## Mission

Build and maintain a live observability dashboard for Codex runs that is understandable, reliable in demos, and useful for intervention decisions.

## Non-Negotiable Hackathon Rubric

Every change should improve at least one of these criteria without harming the others:

1. Clarity of idea
2. Technical execution
3. Completeness
4. Impact and insight
5. Use of Codex

## Submission Constraints

Submissions close at **6:00 PM local time**.

Required deliverables:

1. Public GitHub repo
2. 2 minute video
3. Optional demo link

## Implementation Priorities

1. Protect live demo reliability first
- Keep simulator and replay working.
- Prefer fail-fast errors over silent broken states.

2. Preserve traceability from Codex to UI
- Keep raw event visibility in the inspector.
- Maintain clear mapping from incoming events to derived signals.

3. Keep the product narrative obvious
- "What is happening now" must remain instantly legible.
- Scorecard + intervention text must stay actionable, not decorative.

4. Avoid architecture drift during hackathon window
- Prefer focused, reversible changes.
- Do not introduce large refactors unless they directly improve rubric outcomes.

## Definition of Done For Any Feature

- Works in live mode with Codex input.
- Works in fallback mode (simulator/replay).
- Does not reduce dashboard clarity.
- Demo script still fits within 2 minutes.

## Required Delivery Behavior

- Always relate implementation decisions back to the 5 judging criteria.
- Prefer work that improves demo certainty before work that expands scope.
- Keep documentation synchronized with runtime behavior after every major change.
- Treat broken live ingestion as priority-zero during hackathon window.
