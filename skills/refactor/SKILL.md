---
name: refactor
description: Refactor workflow for a ticket - preserve documented behavior with characterization, consumer analysis, incremental plan and regression tests. Use only when the developer runs /aisdlc:refactor.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# refactor

## Purpose
Behavior-preserving change under the full specification gate (spec §37). Details: `${CLAUDE_PLUGIN_ROOT}/workflows/refactor.md`.

## Invocation conditions
Explicit `/aisdlc:refactor <ticket-number>`. `$ARGUMENTS` = `<ticket-number>`.

## Inputs / Prerequisites
Same as the feature skill. The state engine maps `refactor` to the feature lifecycle (`config/task-types.yaml`).

## Procedure
Read `${CLAUDE_PLUGIN_ROOT}/skills/feature/SKILL.md` and `${CLAUDE_PLUGIN_ROOT}/workflows/refactor.md`, then execute the feature procedure with `TASK_TYPE=refactor` (so `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js init <TICKET> refactor`), adding:
1. The specification MUST state that documented behavior is preserved, or exactly which behavior change the ticket authorizes.
2. Characterize existing behavior before changing code (characterization tests written by `test-writer` from the specification and documented behavior, not from the code under refactor).
3. Dependency/consumer analysis recorded in the impact analysis.
4. Incremental plan in `implementation-plan.md` with a validation checkpoint per step.
5. Regression tests; performance comparison where relevant, recorded in `validation.md`.

## Outputs
As the feature skill.

## Failure behavior
Any behavior difference detected by characterization tests is a blocking finding unless the specification authorizes it.

## Safety restrictions
All feature-skill restrictions apply (spec gate, branch and commit rules, `task.yaml` only via the CLI).
