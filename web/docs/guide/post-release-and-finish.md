# Post-release and finish

The `tasks/<ticket-number>/` folder holds **temporary** working artifacts: the Jira snapshot, requirements, specification, impact analysis, plan, validation and review notes. They are not the long-term product knowledge base. After the feature is in production, aisdlc converts what was actually delivered into durable documentation in `system/product/`, then deletes the temporary material.

That is the job of `/aisdlc:post-release`, and it is mandatory for feature tasks before they can reach `COMPLETED`.

```text
/aisdlc:post-release FEAT-1234
/aisdlc:finish FEAT-1234
```

## Documenting many tickets in one run

You do not have to run post-release one ticket at a time:

```text
/aisdlc:post-release *          # every eligible task
/aisdlc:post-release FEAT-*     # every eligible task whose ticket starts with FEAT-
```

aisdlc selects the eligible tasks (feature-lifecycle tasks that are merged and not yet cleaned up), shows you the list with the ones it skipped and why, and asks you to confirm before anything is deleted. It asks once for the production deployment record, which can cover several tickets shipped together, and processes the tickets in release order so each ticket's documentation builds on the previous one. Where several tickets change the same capability it plans the update together, so the last ticket does not overwrite the others.

Each ticket still gets its own consolidation commit, cleanup commit and audit trail, and every per-ticket gate applies exactly as for a single ticket. A ticket that is blocked (for example, release not verified) keeps its artifacts and the run continues with the rest; the final summary lists what was cleaned, what was blocked and why. Because commits must be made on a branch named after the ticket, aisdlc asks once whether to create a workspace branch per ticket, each starting from the previous one; you merge the result.

## Preconditions

All of these must be true before consolidation starts:

```text
MERGED = true
PRODUCTION_RELEASE = verified
CI = passed or explicitly accepted according to policy
IMPLEMENTATION = complete
VALIDATION = complete
TASK_STATE = RELEASED or KNOWLEDGE_CONSOLIDATION_PENDING
```

The release must be evidenced by a configured authoritative source: the deployment/CI-CD integration, a release-management integration, or, when none exists, a production deployment record you supply when asked. A release record contains at least the status, environment (`production`), a deployment or release reference, the release time and the evidence source.

If the release cannot be verified, the command stops in `RELEASE_PENDING` and **deletes nothing**:

```text
BLOCKED
Reason: Production release has not been verified.
Temporary feature artifacts retained.
```

## What post-release does

1. Loads task state and verifies the merge.
2. Verifies the production release.
3. Reads the temporary artifacts, the final Git diffs, the merged commits, the release evidence and the current `system/product/` documentation.
4. Identifies new, modified and removed capabilities, changed user workflows and changed business rules.
5. Updates `system/product/`: `feature-catalog.yaml`, `capabilities/`, `user-workflows/`, `business-rules/`, `glossary.md`, and `product-overview.md` when a major capability changed. You can browse the result under [System](/system/).
6. Runs a product-document consistency validation and documentation review.
7. Creates a dedicated **consolidation commit** (`FEAT-1234: Update product understanding for scheduled reports`) containing only durable product-knowledge changes.
8. Only then deletes the temporary artifacts and creates a separate **cleanup commit** (`FEAT-1234: Clean up temporary feature artifacts`).
9. Records both commit hashes and the completion in the retained task metadata.

It does not copy the specification into the product docs. The product docs describe **current, verified product behavior**, not the process that created it. Where the implementation differs from the specification, the discrepancy is recorded and the docs reflect what was actually released; unresolved material discrepancies block cleanup.

## What is deleted and what is kept

| Deleted after successful consolidation | Always retained |
|---|---|
| `jira.md`, `requirements.md`, `impact-analysis.md`, `knowledge-manifest.yaml`, `specification.md`, `implementation-plan.md`, `validation.md`, `code-review.md`, `documentation.md`, `repository-preparation.yaml`, `knowledge-consolidation.yaml`, `release.yaml` | `task.yaml`, `approvals.yaml`, `execution-log.jsonl` |

`task.yaml` keeps the release reference, the product-documentation commit hash, the completion timestamp and the cleanup status, so what happened can be established without the temporary specification.

Do not delete these files by hand to "save time". A hook blocks it, and bypassing the gate would lose the knowledge.

## Task states at the end

```text
RELEASED
  -> KNOWLEDGE_CONSOLIDATION_PENDING
  -> KNOWLEDGE_CONSOLIDATED
  -> TEMPORARY_ARTIFACTS_CLEANED
  -> COMPLETED
```

## Finish

`/aisdlc:finish <ticket-number>` is a **finalization** command, not a substitute for release or consolidation. For a feature it rejects completion unless the state is `TEMPORARY_ARTIFACTS_CLEANED`, and it never deletes temporary artifacts itself. That separation gives you a final verification point after cleanup.

```text
BLOCKED
Reason: Post-release knowledge consolidation is incomplete.
```

If you see that, run `/aisdlc:post-release <ticket-number>` first.

## If it is interrupted

Post-release is resumable like everything else: run `/aisdlc:resume FEAT-1234`. It will not delete anything until consolidation has been validated and committed.

## Bugs

Bugs do not go through post-release consolidation. A bug lifecycle ends at `COMPLETED` after CI. See [bug lifecycle](/guide/bug-lifecycle).
