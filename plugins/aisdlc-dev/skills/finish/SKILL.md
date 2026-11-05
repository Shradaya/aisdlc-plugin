---
name: finish
description: Final completion gate - verify a task is fully done and mark it COMPLETED. For feature-lifecycle tasks it rejects completion unless state is KNOWLEDGE_CONSOLIDATED. Use only when the developer runs /aisdlc-dev:finish.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# finish

## Purpose
Finalization verification point (spec §51, §57, §58). It is not a substitute for release or product-knowledge consolidation and MUST NOT delete temporary artifacts (deletion belongs to `/aisdlc-dev:post-release`).

## Invocation conditions
Explicit `/aisdlc-dev:finish <ticket-number>`. `$ARGUMENTS` = `<ticket-number>`.

## Inputs
Task state and retained task files.

## Prerequisites
Task exists. By lifecycle:
- Feature lifecycle (feature, refactor, api-change, database-change, dependency-upgrade, documentation): status MUST be KNOWLEDGE_CONSOLIDATED (with `source_artifacts_deleted == true`).
- Bug: status PR_CREATED (last state before COMPLETED; CI validation is part of PR_CREATED).
- Investigation: status UNDER_INVESTIGATION with findings recorded.

## Procedure
1. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`.
2. Feature lifecycle: if status is not KNOWLEDGE_CONSOLIDATED (with `source_artifacts_deleted == true`), print `BLOCKED` / `Reason: Post-release knowledge consolidation is incomplete.` and stop (tell the developer to run `/aisdlc-dev:post-release <TICKET>`).
3. Verify retained metadata: `release.reference`, `knowledge_consolidation.consolidation_commit`, `knowledge_consolidation.cleanup_commit`, `knowledge_consolidation.validated == true`, `knowledge_consolidation.source_artifacts_deleted == true`, `knowledge_consolidation.completed_at`; `tasks/<TICKET>/execution-log.jsonl` exists; temporary artifacts are absent. Any gap: BLOCKED with the specific reason.
4. Walk the Definition of Done (spec §57; feature or bug checklist) against recorded evidence; for items that cannot be evidenced (for example merge/release where required) ask the developer rather than assume.
5. If retained metadata (`task.yaml`, `execution-log.jsonl`) has uncommitted changes in the workspace (`git status --porcelain -- tasks/<TICKET>`), ask the developer whether to commit it now; if yes use the commit skill workspace-mode with message `<TICKET>: Record cleanup commit` BEFORE the next step (the commit hook rejects commits once a task is COMPLETED).
6. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> COMPLETED`. Append audit `task-completed`. Tell the developer that the final status change in `task.yaml` is a working-tree change.

## Outputs
Task state COMPLETED.

## Failure behavior
Unmet gate: print BLOCKED with reason and the command to run next; change nothing.

## Safety restrictions
Never delete task artifacts. Never edit `task.yaml` directly. Never complete a feature task that has not been consolidated.
