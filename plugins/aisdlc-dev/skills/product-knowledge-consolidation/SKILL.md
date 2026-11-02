---
name: product-knowledge-consolidation
description: Transform a released feature's temporary task knowledge into durable product documentation in system/product/, validate it, commit it, then delete the temporary task artifacts in a separate cleanup commit. Only after production release is verified.
argument-hint: <ticket-number>
---

# product-knowledge-consolidation

## Purpose
Convert temporary feature artifacts into current product understanding (spec §29A, §42). The feature specification MUST NOT be archived or copied verbatim as a substitute.

## Invocation conditions
Invoked by `/aisdlc-dev:post-release` after release verification. Refuse to run otherwise. `$ARGUMENTS` = `<ticket-number>`.

## Inputs
Task state; `specification.md`, `requirements.md`, `impact-analysis.md`, `implementation-plan.md`, `validation.md`, `documentation.md`; final diffs and merged commits for all affected repositories (`commits.<repo>` in state); release evidence; current `system/product/`. Authority order: released implementation (what was delivered) > approved specification (intended behavior) > Jira (original request and acceptance criteria).

## Prerequisites
`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows `release.status == released` and state RELEASED. Otherwise stop with `BLOCKED`, no changes.

## Procedure
Append audit `knowledge-consolidation-started`.
1. Load state and verify release (above). Load temporary artifacts. If the task has a `design` record, also load `system/designs/<DESIGN-TICKET>/design.md` and the pinned snapshot: durable UI behavior goes into `system/product/` like any other behavior. `system/designs/<DESIGN-TICKET>/` may be shared by other feature tickets and is not a temporary artifact: never delete it in step 11/12. Update this ticket's `children.yaml` entry (status `released`). When no feature ticket listed in `children.yaml` is still open, ask the developer whether to mark the design `deprecated`; never delete or deprecate it automatically.
2. Launch the `product-knowledge-analyst` subagent with the artifacts, final diffs/commits, release evidence and current `system/product/` docs. It identifies affected product capabilities; new, modified and removed/deprecated capabilities; changed user workflows; changed business rules; and compares intended behavior with the released implementation.
3. Record reconciliation in `tasks/<TICKET>/knowledge-consolidation.yaml`: each material difference classified as `implemented-as-specified`, `implemented-with-approved-change`, `implemented-differently-and-requires-clarification`, or `not-released`. Set `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> knowledge_consolidation.unresolved_reconciliation <N>`. If N > 0: ask the developer (AskUserQuestion) to clarify; unresolved items BLOCK deletion and completion - stop and keep everything.
4. Update durable docs in `system/product/` (current behavior only): `feature-catalog.yaml` (new/changed entries: id, name, status, introduced_by, capabilities, product_document, user_workflows); `capabilities/*.md`; `user-workflows/*.md`; `business-rules/*.md`; `glossary.md` for new terms; `product-overview.md` when a major capability changed. Existing capability: update the existing document, never duplicate; correct or remove statements that are no longer true (check changed behavior, constraints, inputs/outputs, workflow steps, eligibility/business rules, removed behavior, renamed concepts). Only verified released behavior is documented.
5. Quality rules: describe current behavior; omit ticket-specific implementation history unless needed; omit repository/file-level details unless intentionally product knowledge; no duplication of detailed architecture docs (link to it); no stale or contradicted statements; stable capability names; traceability to the ticket only through structured metadata (`introduced_by`); understandable without the temporary specification.
6. Consistency validation: every catalog `product_document` and `user_workflows` path exists; no document contradicts another or the released behavior; no ticket-process language; glossary covers new terms.
7. Launch `documentation-reviewer` on the updated product docs plus evidence of released behavior (requirement, final diff, tests); fix findings.
8. Validation-before-deletion checklist (all must be true): production release verified; product capability updates identified; new/changed docs written; feature catalog updated; consistency check passed; no unresolved reconciliation; documentation review passed; durable commit created; commit hash recorded.
9. Consolidation commit (control-plane repo), only `system/product/` changes, using the commit skill workspace-mode (`${CLAUDE_PLUGIN_ROOT}/skills/commit/SKILL.md`): `<TICKET>: Update product understanding for <feature>`. Append audit `consolidation-commit-created`.
10. Record state: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> knowledge_consolidation '{"status":"in-progress","product_documents_changed":["system/product/..."],"consolidation_commit":"<hash>","validated":true,"unresolved_reconciliation":0,"source_artifacts_deleted":false}'` (include existing keys you want preserved). Append `product-knowledge-updated` and `product-knowledge-validation-completed`. Then `... transition <TICKET> KNOWLEDGE_CONSOLIDATED` — the deletion gate in step 11 requires the task to be in KNOWLEDGE_CONSOLIDATED with `consolidation_commit` set, `validated: true` and no unresolved reconciliation, so this transition must happen before deletion. (KNOWLEDGE_CONSOLIDATED now also covers artifact cleanup; there is no separate cleaned state.)
11. Delete temporary artifacts (the hook allows this only now that the task is KNOWLEDGE_CONSOLIDATED). Delete each existing file by explicit path, using `git rm` if tracked else `rm`: `tasks/<TICKET>/{jira.md,requirements.md,impact-analysis.md,knowledge-manifest.yaml,specification.md,implementation-plan.md,validation.md,code-review.md,documentation.md,repository-preparation.yaml,knowledge-consolidation.yaml,release.yaml}`. NEVER delete `task.yaml`, `approvals.yaml`, `execution-log.jsonl`. Never delete the task directory. Verify each deleted file is absent and the retained files exist. Append `temporary-artifacts-deleted`.
12. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> knowledge_consolidation.source_artifacts_deleted true`, `... set <TICKET> knowledge_consolidation.status '"completed"'`, `... set <TICKET> knowledge_consolidation.completed_at '"<ts>"'`, `... set <TICKET> workflow.temporary_artifact_cleanup '"completed"'`. (The task stays in KNOWLEDGE_CONSOLIDATED; `/aisdlc-dev:finish` moves it to COMPLETED.)
13. Cleanup commit as a separate Git transaction (commit skill workspace-mode): stage the deletions and the retained metadata (`task.yaml`, `execution-log.jsonl`, `approvals.yaml` if present); message `<TICKET>: Clean up temporary feature artifacts`. Never mix this with the consolidation commit.
14. Record `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> knowledge_consolidation.cleanup_commit '"<hash>"'` (this one-field metadata update remains uncommitted for `/aisdlc-dev:finish` to commit). Retained `task.yaml` then contains release reference, product documentation commit, completion timestamp and cleanup status.

## Outputs
Updated `system/product/`; consolidation commit; deleted temporary artifacts; cleanup commit; state KNOWLEDGE_CONSOLIDATED with both hashes and `source_artifacts_deleted: true`.

## Failure behavior
Any gate failing (release, validation, review, commit, reconciliation): stop, delete nothing, keep state at RELEASED (before the KNOWLEDGE_CONSOLIDATED transition) and report. If the commit hook blocks (for example the workspace branch differs from the ticket), do not bypass; ask the developer.

## Safety restrictions
- Never delete anything before steps 1-10 pass. Never delete protected artifacts via any route other than step 11.
- Never copy the specification verbatim into product docs. Never mark knowledge `human-confirmed` without human approval.
- Never edit `task.yaml` directly; never include secrets in product docs.
