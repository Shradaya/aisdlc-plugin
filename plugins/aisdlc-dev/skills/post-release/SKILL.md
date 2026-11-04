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

An eligible task is on the feature lifecycle (feature, refactor, api-change, database-change, dependency-upgrade, documentation) and has status MERGED or RELEASED. (In the shortened lifecycle a merge to the UAT branch is the release — there is no RELEASE_PENDING, and KNOWLEDGE_CONSOLIDATED now also covers artifact cleanup.) Tasks already at KNOWLEDGE_CONSOLIDATED or COMPLETED, bug and investigation tasks, and tasks not yet merged are never processed; in batch mode they are listed as skipped with the reason.

## Batch mode (`*` or `PREFIX-*`)
Run this section first; then run the Procedure below once per selected ticket.
B1. **Select.** List `tasks/*/task.yaml` ids, `get` each, and apply the eligibility rule. If nothing is eligible, report why for each task and stop. A literal ticket number never goes through batch selection.
B2. **Confirm.** The run deletes temporary artifacts for every selected ticket, so show a table (ticket, type, status, repositories, release evidence present yes/no) plus the skipped tasks with reasons, and ask with AskUserQuestion: proceed with all, choose a subset, or cancel. Do nothing until the developer answers.
B3. **Release evidence once.** Release = the merge to the UAT branch. Tickets merged together to UAT share one record (the UAT branch merge reference and timestamp). Confirm each selected ticket's PR is merged to the UAT branch (via the git-hosting integration or the developer). A ticket whose PR is not merged to UAT is treated as not-released for that ticket only.
B4. **Order.** Sort verified tickets by released_at, then by merge order, so each ticket's documentation builds on the previous one's.
B5. **Overlap check.** Before writing anything, read each ticket's specification and impact analysis and list which product capabilities each will touch. Where several tickets touch the same capability, pass that list to the consolidation run so the document is updated coherently rather than overwritten by the last ticket.
B6. **Workspace branch.** The commit hook requires the workspace branch to equal the ticket for every commit. Ask the developer once how to handle it: (a) create a local branch named `<ticket>` in the workspace repo for each ticket in turn, starting from the previous ticket's branch so documentation accumulates, and leave merging to the developer; or (b) stop at the first mismatch. Never switch or create branches without that answer.
B7. **Process sequentially.** Run the Procedure for each ticket in order. Each ticket gets its own consolidation commit, cleanup commit, state and audit trail, exactly as in single mode; nothing is shared except the prepared evidence. A ticket that fails or blocks stays at its current state with artifacts retained; continue with the remaining tickets, except stop the whole run on a commit-hook or branch problem (fix the cause, then re-run; finished tickets are skipped automatically).
B8. **Summary.** Print a table per ticket: result (cleaned, blocked, skipped), reason, consolidation commit, cleanup commit, and product documents changed. List capabilities documented by more than one ticket, tickets whose docs were written without a failed predecessor, and the workspace branch holding the result. Tell the developer to run `/aisdlc-dev:finish <TICKET>` per cleaned ticket (or `/aisdlc-dev:finish` for each in the list).

## Inputs
Task state, `release` evidence (integration or developer-supplied), all task artifacts, merged commits.

## Prerequisites (all must hold)
- The PR is merged to the UAT branch (this is the release); CI passed or explicitly accepted per policy; implementation and validation complete.
- State is MERGED or RELEASED.

## Procedure
(Single ticket, or one iteration of batch mode with `<TICKET>` being the ticket being processed; release evidence already gathered in B3 is reused in step 4.)
1. Load state: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`. If the type is on the bug or investigation lifecycle, stop: not applicable.
2. Verify released: status is MERGED or RELEASED and the PR is merged to the UAT branch (check the git-hosting integration, or confirm with the developer). Check `ci.status` is `passed` (or the developer explicitly accepts, recorded in `execution-log.jsonl`). Check `validation.md` shows completion. Failing any: print `BLOCKED` with the reason, change nothing.
3. Record the release and move to RELEASED (if currently MERGED): write `tasks/<TICKET>/release.yaml` and `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> release '{"status":"released","environment":"uat","reference":"<uat-merge-ref>","released_at":"<ts>","evidence_source":"<integration|user-provided>"}'`; then `... transition <TICKET> RELEASED`; append audit `release-recorded`. (A UAT merge is the release; there is no separate production-verification gate.)
4. Invoke the product-knowledge-consolidation skill for `<TICKET>`. It performs consolidation, validation, the consolidation commit, protected artifact deletion, the cleanup commit, and ends with state KNOWLEDGE_CONSOLIDATED (which now also covers artifact cleanup; `set <TICKET> workflow.product_knowledge_consolidation '"in-progress"'` first).
5. Verify final state with `get`: state KNOWLEDGE_CONSOLIDATED, `knowledge_consolidation.source_artifacts_deleted` true. Report both commit hashes and tell the developer to run `/aisdlc-dev:finish <TICKET>` to reach COMPLETED.

## Outputs
`release.yaml` (then deleted by consolidation), updated `system/product/`, consolidation and cleanup commits, task state at KNOWLEDGE_CONSOLIDATED.

## Failure behavior
Any missing prerequisite: stop safely with no deletion. Consolidation failure or unresolved reconciliation: artifacts retained, state stays RELEASED, explain what to resolve.

## Safety restrictions
Never delete artifacts yourself outside the consolidation skill's gated step. Never fabricate release evidence, and never apply one ticket's evidence to another ticket the developer did not name. Wildcards never widen the eligibility rules and never bypass any per-ticket gate; the hook still checks each ticket individually. Never edit `task.yaml` directly. The deletion hook blocks premature deletion; do not try to bypass it.
