---
name: documentation
description: Evaluate and update technical documentation impact for a task and record it in tasks/{ticket}/documentation.md; also the entry point for documentation-type tasks (/aisdlc-dev:documentation).
argument-hint: <ticket-number>
disable-model-invocation: true
---

# documentation

## Purpose
Make documentation impact explicit (spec §41). Technical documentation may be updated during normal implementation; product-understanding documentation is finalized only by post-release consolidation (spec §42) and MUST NOT be edited here.

## Invocation conditions
1. Stage mode: an existing task is at REVIEWING (before commit) - invoked by the feature/bug workflows after reading this file.
2. Entry mode: `/aisdlc-dev:documentation <ticket-number>` for a ticket with no task yet: run the feature skill (`${CLAUDE_PLUGIN_ROOT}/skills/feature/SKILL.md`) with `TASK_TYPE=documentation`, plus `${CLAUDE_PLUGIN_ROOT}/workflows/documentation.md`.
`$ARGUMENTS` = `<ticket-number>`.

## Inputs
Specification (or bug artifacts), impact analysis, actual diffs, validation results, `repositories/<repo>/` knowledge, `system/` technical docs.

## Prerequisites
Stage mode: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows REVIEWING (or later for follow-up); source-edit gate is respected for in-repository documentation changes.

## Procedure
1. For each category decide and record exactly one of `updated`, `not required`, `pending` with a reason: API behavior; Database schema; Architecture; Data flow; Business behavior; Operational behavior; Deployment configuration; Troubleshooting guidance; Repository conventions.
2. Optionally have `documentation-reviewer` assess documentation impact from requirement, diff and tests only.
3. Apply technical documentation updates: in-repository docs on branch `<TICKET>` (committed later through the commit skill); workspace technical knowledge (`repositories/<repo>/`, `system/architecture/`, `system/data-flows/`, `system/integrations/`, `system/repository-relationships.yaml`) via the refresh-repo procedure after the resulting commit is known (spec §49).
4. If a spec §43 ADR trigger applies, run the adr skill.
5. Business-behavior changes: mark the category `pending` for post-release product-knowledge consolidation; do not touch `system/product/`.
6. Write `tasks/<TICKET>/documentation.md` with the nine categories, changes made (file paths), ADRs, and pending items. Append audit `documentation-updated`; `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> workflow.documentation '"completed"'`.

## Outputs
`tasks/<TICKET>/documentation.md`; updated technical docs; optional ADRs.

## Failure behavior
Cannot determine a category: mark `pending` with the question and ask the developer; do not claim `not required` without a reason.

## Safety restrictions
Never edit `system/product/` here. Never edit `task.yaml` directly. Repository edits obey the implementation gate.
