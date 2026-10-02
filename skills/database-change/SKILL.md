---
name: database-change
description: Database change workflow for a ticket - schema impact, consumers, migration strategy, backward compatibility, migration and rollback verification. Use only when the developer runs /aisdlc:database-change.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# database-change

## Purpose
Safe schema and data changes under the specification and plan gates (spec §34). Details: `${CLAUDE_PLUGIN_ROOT}/workflows/database-change.md`.

## Invocation conditions
Explicit `/aisdlc:database-change <ticket-number>`. `$ARGUMENTS` = `<ticket-number>`.

## Inputs / Prerequisites
Same as the feature skill. `database-change` maps to the feature lifecycle.

## Procedure
Read `${CLAUDE_PLUGIN_ROOT}/skills/feature/SKILL.md` and `${CLAUDE_PLUGIN_ROOT}/workflows/database-change.md`, then execute the feature procedure with `TASK_TYPE=database-change` (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js init <TICKET> database-change`), adding:
1. Schema impact and consumer analysis in `impact-analysis.md` (all consumers of the affected data).
2. The specification (sections 15, 19, 24) and plan MUST explicitly document: migration ordering; lock/availability impact; backward compatibility; rollback strategy; data transformation risks.
3. Plan approval is required (`policies.yaml` `feature.require_plan_for_database_change`): `approve <TICKET> plan` only after an explicit developer choice.
4. Implement migration first, then application changes; run migration tests and rollback verification; record in `validation.md`.
5. `database-reviewer` is a mandatory reviewer in the code-review skill.

## Outputs
As the feature skill.

## Failure behavior
Missing migration/rollback details: ask; do not invent. Failed migration or rollback verification blocks VALIDATING.

## Safety restrictions
Never write to production databases; never run migrations against production; all feature-skill restrictions apply.
