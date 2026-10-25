---
name: post-release
description: After production release, verify merge and release, run product-knowledge consolidation, and clean up temporary task artifacts. Mandatory for feature-lifecycle tasks before COMPLETED. Use only when the developer runs /aisdlc-dev:post-release.
argument-hint: <ticket-number | * | PREFIX-*>
disable-model-invocation: true
---

# post-release

## Purpose
The only supported path from released feature to durable product knowledge and artifact cleanup (spec §28A, §42). Accepts one ticket or a wildcard so every released ticket can be documented in a single run.

## Invocation conditions
Explicit `/aisdlc-dev:post-release <target>`. `$ARGUMENTS` = `<target>`, one of:
- `<ticket-number>` (for example `FEAT-1234`): that task only.
- `*`: every eligible task in `tasks/`.
- `<PREFIX>-*` (for example `FEAT-*`): every eligible task whose ticket id starts with that prefix. Only a trailing `*` after `-` is accepted; any other pattern is rejected.

An eligible task is on the feature lifecycle (feature, refactor, api-change, database-change, dependency-upgrade, documentation) and has status MERGED, RELEASE_PENDING, RELEASED or KNOWLEDGE_CONSOLIDATION_PENDING. Tasks already at TEMPORARY_ARTIFACTS_CLEANED or COMPLETED, bug and investigation tasks, and tasks not yet merged are never processed; in batch mode they are listed as skipped with the reason.

## Batch mode (`*` or `PREFIX-*`)
Run this section first; then run the Procedure below once per selected ticket.
B1. **Select.** List `tasks/*/task.yaml` ids, `get` each, and apply the eligibility rule. If nothing is eligible, report why for each task and stop. A literal ticket number never goes through batch selection.
B2. **Confirm.** The run deletes temporary artifacts for every selected ticket, so show a table (ticket, type, status, repositories, release evidence present yes/no) plus the skipped tasks with reasons, and ask with AskUserQuestion: proceed with all, choose a subset, or cancel. Do nothing until the developer answers.
B3. **Release evidence once.** Tickets that shipped in the same production deployment can share one record. If a release integration is configured, verify each ticket through it. Otherwise ask the developer for the production deployment record(s) (reference, released_at; environment must be production) and which selected tickets each covers. Anything without a verified record is treated as step 4's not-verified case for that ticket only.
B4. **Order.** Sort verified tickets by released_at, then by merge order, so each ticket's documentation builds on the previous one's.
B5. **Overlap check.** Before writing anything, read each ticket's specification and impact analysis and list which product capabilities each will touch. Where several tickets touch the same capability, pass that list to the consolidation run so the document is updated coherently rather than overwritten by the last ticket.
B6. **Workspace branch.** The commit hook requires the workspace branch to equal the ticket for every commit. Ask the developer once how to handle it: (a) create a local branch named `<ticket>` in the workspace repo for each ticket in turn, starting from the previous ticket's branch so documentation accumulates, and leave merging to the developer; or (b) stop at the first mismatch. Never switch or create branches without that answer.
B7. **Process sequentially.** Run the Procedure for each ticket in order. Each ticket gets its own consolidation commit, cleanup commit, state and audit trail, exactly as in single mode; nothing is shared except the prepared evidence. A ticket that fails or blocks stays at its current state with artifacts retained; continue with the remaining tickets, except stop the whole run on a commit-hook or branch problem (fix the cause, then re-run; finished tickets are skipped automatically).
B8. **Summary.** Print a table per ticket: result (cleaned, blocked, skipped), reason, consolidation commit, cleanup commit, and product documents changed. List capabilities documented by more than one ticket, tickets whose docs were written without a failed predecessor, and the workspace branch holding the result. Tell the developer to run `/aisdlc-dev:finish <TICKET>` per cleaned ticket (or `/aisdlc-dev:finish` for each in the list).

## Inputs
Task state, `release` evidence (integration or developer-supplied), all task artifacts, merged commits.

## Prerequisites (all must hold, spec §42.1)
- MERGED = true; PRODUCTION_RELEASE = verified; CI passed or explicitly accepted per policy; implementation and validation complete.
- State is MERGED, RELEASE_PENDING, RELEASED or KNOWLEDGE_CONSOLIDATION_PENDING.

## Procedure
(Single ticket, or one iteration of batch mode with `<TICKET>` being the ticket being processed; release evidence already gathered in B3 is reused in step 4.)
1. Load state: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`. If the type is on the bug or investigation lifecycle, stop: not applicable.
2. Verify merged: status is one of the states above and `pull_requests` merged (check the git-hosting integration, or confirm with the developer). Check `ci.status` is `passed` (or the developer explicitly accepts, recorded in `execution-log.jsonl`). Check `validation.md` shows completion. Failing any: print `BLOCKED` with the reason, change nothing.
3. If status is MERGED: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> RELEASE_PENDING`.
4. Verify production release. Evidence from the configured deployment/CI-CD or release-management integration; if none exists, ask the developer with AskUserQuestion for the production deployment record. Required: status released, environment production, reference, released_at, evidence_source (`integration` or `user-provided`).
   - Not verified: stay in RELEASE_PENDING and output exactly: `BLOCKED` / `Reason: Production release has not been verified.` / `Temporary feature artifacts retained.` Stop. Delete nothing.
   - Verified: write `tasks/<TICKET>/release.yaml`; `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> release '{"status":"released","environment":"production","reference":"<ref>","released_at":"<ts>","evidence_source":"<integration|user-provided>"}'`; `... transition <TICKET> RELEASED`; append audit `production-release-verified`.
5. `... transition <TICKET> KNOWLEDGE_CONSOLIDATION_PENDING` (if currently RELEASED); `... set <TICKET> workflow.product_knowledge_consolidation '"in-progress"'`.
6. Invoke the product-knowledge-consolidation skill for `<TICKET>`. It performs consolidation, validation, the consolidation commit, protected deletion, the cleanup commit, and ends with state TEMPORARY_ARTIFACTS_CLEANED.
7. Verify final state with `get`: state TEMPORARY_ARTIFACTS_CLEANED, `knowledge_consolidation.source_artifacts_deleted` true. Report both commit hashes and tell the developer to run `/aisdlc-dev:finish <TICKET>`. This command leaves the task at TEMPORARY_ARTIFACTS_CLEANED; COMPLETED is set by finish (spec §51, §60.N).

## Outputs
`release.yaml` (then deleted by consolidation), updated `system/product/`, consolidation and cleanup commits, task state at TEMPORARY_ARTIFACTS_CLEANED.

## Failure behavior
Any missing prerequisite: stop safely with no deletion. Consolidation failure or unresolved reconciliation: artifacts retained, state stays KNOWLEDGE_CONSOLIDATION_PENDING, explain what to resolve.

## Safety restrictions
Never delete artifacts yourself outside the consolidation skill's gated step. Never fabricate release evidence, and never apply one ticket's evidence to another ticket the developer did not name. Wildcards never widen the eligibility rules and never bypass any per-ticket gate; the hook still checks each ticket individually. Never edit `task.yaml` directly. The deletion hook blocks premature deletion; do not try to bypass it.
