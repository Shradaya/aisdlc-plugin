# Being blocked

Hooks are the enforcement layer: skills decide what should happen, hooks make the critical rules hard to bypass. When a hook refuses an action, Claude shows a message in this shape and the action does **not** happen:

```text
BLOCKED
Reason: <what rule was hit>
```

A BLOCKED message is not an error to work around. It tells you which gate is closed and what to do to open it. Never try to bypass it by editing `task.yaml` by hand, deleting files, or disabling hooks.

The messages below are the ones the aisdlc hooks and state script produce. The first group are the scenarios the acceptance suite checks.

## Gate and workflow messages

### Source edit before the specification is approved

```text
BLOCKED
Reason: Feature specification has not been approved.
```

**Do:** review `tasks/<ticket-number>/specification.md` and run `/aisdlc-dev:approve <ticket-number> specification`, or request changes. See [approval gates](/guide/approvals). The same text appears when `IMPLEMENTING` is requested without an approved specification.

### Wrong branch

```text
BLOCKED
Reason: Active aisdlc task requires branch FEAT-1234 (current: main).
```

**Do:** switch to the branch named exactly like the ticket (`git checkout FEAT-1234`). If the branch does not exist, the task has not reached repository preparation; `/aisdlc-dev:resume FEAT-1234` will do that safely. Do not commit on `main`.

### Post-release before production release is verified

```text
BLOCKED
Reason: Production release has not been verified.
Temporary feature artifacts retained.
```

**Do:** nothing is lost. The task stays in `RELEASE_PENDING`. Verify the release (through the deployment integration, or by providing a release record when asked) and run `/aisdlc-dev:post-release <ticket-number>` again. See [post-release](/guide/post-release-and-finish).

### Finish before consolidation is complete

```text
BLOCKED
Reason: Post-release knowledge consolidation is incomplete.
```

**Do:** run `/aisdlc-dev:post-release <ticket-number>` first, and only then `/aisdlc-dev:finish <ticket-number>`. A feature can be finished only from `TEMPORARY_ARTIFACTS_CLEANED`.

### Deleting a temporary artifact too early

```text
BLOCKED
Reason: Temporary artifacts of FEAT-1234 may be deleted only after validated product-knowledge consolidation.
```

**Do:** do not delete `specification.md`, `jira.md` and the other temporary artifacts yourself. `/aisdlc-dev:post-release` deletes them after the product documentation is updated, validated and committed. Deletion is allowed only when the task is `KNOWLEDGE_CONSOLIDATED`, the consolidation commit exists, validation passed and there are no unresolved reconciliation issues.

### Specification changed after approval

```text
BLOCKED
Reason: Specification for FEAT-1234 changed after approval; reapproval required.
```

**Do:** review the new version of the specification and approve it again.

### Wrong state for source edits

```text
BLOCKED
Reason: Task FEAT-1234 is in AWAITING_SPEC_APPROVAL; source edits are not allowed in this state.
```

**Do:** read the state named in the message and look it up in the [state tables](/guide/feature-lifecycle). Usually you need to approve a gate or finish an earlier step. Source edits are allowed only between the approval point (`SPEC_APPROVED` for features, `REPOSITORIES_PREPARED` for bugs) and `COMMITTED`.

### Repository not part of any active task

```text
BLOCKED
Reason: No active aisdlc task lists repository 'backend'.
```

**Do:** start a task whose impact analysis includes that repository, or add it to the active task through the workflow. Source repositories are never edited outside a task.

### Read-only task types

```text
BLOCKED
Reason: investigation tasks are read-only.
```

**Do:** investigations do not modify source. Open a feature, bug or refactor task for the change.

## Git and commit messages

### No active task

```text
BLOCKED
Reason: No active aisdlc task; commits are not allowed.
```

**Do:** start or resume a task first.

### Invalid commit message

```text
BLOCKED
Reason: Commit message must match '<ticket-number>: <changes summary>' for an active task (FEAT-1234).
```

**Do:** use exactly that format, for example `git commit -m "FEAT-1234: Add scheduled report generation"`. A message such as `add scheduled reports` is rejected.

### Multi-line message

```text
BLOCKED
Reason: Commit must have exactly one single-line -m message and no body.
```

**Do:** one `-m`, one line.

### Disabled Git operations

```text
BLOCKED
Reason: Force push is disabled.
BLOCKED
Reason: Deleting main is disabled.
BLOCKED
Reason: Destructive reset on main is disabled.
BLOCKED
Reason: History rewrite is disabled.
```

**Do:** these are never allowed by aisdlc. If a branch has diverged, resolve it deliberately yourself outside the workflow, then `/aisdlc-dev:resume`.

## Protected paths and secrets

```text
BLOCKED
Reason: task.yaml may only be changed through scripts/state/aisdlc-state.js.
BLOCKED
Reason: .git is protected.
BLOCKED
Reason: Protected path.
BLOCKED
Reason: Credential/secret extraction is disabled.
```

**Do:** state changes go through the workflow commands (`approve`, `reject`, `resume` and the task commands). Paths such as `credentials/`, `secrets/`, `.git/` and private key files are protected. Secrets must never be placed in task artifacts, committed, echoed in audit logs or copied into Jira comments.

## State script messages

The state script prints the same information on one line, for example:

```text
BLOCKED: illegal transition IMPLEMENTING -> COMPLETED
BLOCKED: task state is locked by another session
```

**Do:** for an illegal transition, run `/aisdlc-dev:status` and `/aisdlc-dev:resume <ticket-number>` to see the next valid step. For a lock, wait for or end the other session working on that task. Only one session may change a task at a time.

## Workflow states that stop the work

Some blocks are persistent states rather than a one-off message:

| State | Meaning | What to do |
|---|---|---|
| `WAITING_FOR_INPUT` | aisdlc needs an answer from you. | Answer the pending question. |
| `WAITING_FOR_APPROVAL` | A gate needs a decision. | [Approve or reject](/guide/approvals). |
| `CONFLICTED` | Repository state differs from what the task recorded, or `main` could not fast-forward. | Resolve it yourself, then [resume](/guide/resume). aisdlc stops rather than guessing. |
| `CI_FAILED` | CI failed; failing checks are recorded. | Fix and push, then resume. |
| `JIRA_CHANGED` / `SPEC_REVIEW_REQUIRED` | The ticket changed after approval. | Review the specification and [reapprove](/guide/approvals). |
| `BLOCKED` / `FAILED` | A precondition failed or a step errored. | Read the recorded reason and fix it, then resume. |
| `CANCELLED` | The task was abandoned. | Start a new task if work is still needed. |

## When the branch already exists

If branch `FEAT-1234` already exists locally or remotely and there is no active task record for it, aisdlc stops instead of overwriting it. It never resets, deletes or recreates an existing branch. Decide what to do with the branch yourself, then continue.

## Quick checklist when you are blocked

1. Read the `Reason:` line literally.
2. Run `/aisdlc-dev:status` to see the task state and anything pending.
3. Match the state against the [feature](/guide/feature-lifecycle) or [bug](/guide/bug-lifecycle) lifecycle.
4. Do the thing the gate is waiting for, then `/aisdlc-dev:resume <ticket-number>`.
