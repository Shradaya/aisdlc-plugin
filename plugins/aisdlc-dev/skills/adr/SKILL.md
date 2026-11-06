---
name: adr
description: Propose or write an Architecture Decision Record (system/decisions/ADR-XXXX-{slug}.md) when a task changes service boundaries, data ownership, integration patterns, technology, events, storage, security architecture, API compatibility or deployment model.
argument-hint: <ticket-number> <decision-title>
---

# adr

## Purpose
Preserve long-term architecture rationale (spec §43).

## Invocation conditions
A task introduces or materially changes: service boundaries; data ownership; integration patterns; major technology choices; event-driven patterns; storage strategy; security architecture; API compatibility strategy; deployment model. Invoked by the specification, review, or documentation stages, or by the developer.

## Inputs
Ticket, specification/impact analysis excerpts about the decision, existing `system/decisions/` ADRs.

## Prerequisites
An active task for the ticket (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`).

## Procedure
1. Check existing ADRs for the same decision; supersede rather than duplicate.
2. Choose the next number `XXXX` (4 digits, sequential after the highest existing) and a short kebab-case slug.
3. Write `system/decisions/ADR-XXXX-<slug>.md` with sections: Context, Problem, Decision, Alternatives, Consequences, Status. Add the originating ticket as metadata.
4. Status is `Proposed` unless the developer explicitly approves it (then `Accepted`); never mark Accepted on your own.
5. Reference the ADR in the specification or `documentation.md`. Architecture changes without an ADR must be recorded in the specification.

## Outputs
`system/decisions/ADR-XXXX-<slug>.md`.

## Failure behavior
Missing decision details: ask the developer; do not invent alternatives or consequences.

## Safety restrictions
Writes only under `system/decisions/` and task artifacts. Never edit `task.yaml` directly.
