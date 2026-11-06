<script setup>
const groups = [
  { title: 'Understand', steps: [
    { name: 'CREATED', note: 'task directory created' },
    { name: 'TICKET_READY', note: 'Jira snapshot (or user-provided details) saved in jira.md' },
    { name: 'UNDERSTOOD', note: 'requirement, constraints and unknowns summarized' },
    { name: 'IMPACT_ANALYZED', note: 'domains and candidate repositories analyzed' },
    { name: 'REPOSITORIES_IDENTIFIED', note: 'affected repositories confirmed, each with a reason' },
  ]},
  { title: 'Prepare and specify', steps: [
    { name: 'REPOSITORIES_PREPARED', note: 'stash, checkout main, fast-forward pull, create branch <ticket-number>' },
    { name: 'SPEC_DRAFTED', note: 'specification.md written' },
    { name: 'AWAITING_SPEC_APPROVAL', gate: 'specification approval', note: 'no application source edits yet' },
    { name: 'SPEC_APPROVED', note: 'source edits become possible' },
    { name: 'PLAN_DRAFTED', note: 'implementation-plan.md written' },
    { name: 'AWAITING_PLAN_APPROVAL', gate: 'plan approval', note: 'required for major, cross-repository, database, API or security-sensitive changes' },
  ]},
  { title: 'Build and verify', steps: [
    { name: 'IMPLEMENTING', note: 'code changes on the ticket branch' },
    { name: 'VALIDATING', note: 'repository tests, then cross-repository validation' },
    { name: 'REVIEWING', note: 'AI review against specification, plan and actual diff' },
    { name: 'COMMITTING' },
    { name: 'COMMITTED', note: 'one compliant commit message per repository' },
  ]},
  { title: 'Deliver', steps: [
    { name: 'PR_CREATED' },
    { name: 'CI_VALIDATING', note: 'a CI failure moves the task to a failed CI state and records the failing checks' },
    { name: 'MERGE_READY' },
    { name: 'MERGED' },
    { name: 'RELEASE_PENDING', gate: 'verified production release', note: 'post-release stops here until the release is verified' },
    { name: 'RELEASED' },
  ]},
  { title: 'Consolidate and close', steps: [
    { name: 'KNOWLEDGE_CONSOLIDATION_PENDING' },
    { name: 'KNOWLEDGE_CONSOLIDATED', note: 'product docs updated, validated and committed' },
    { name: 'TEMPORARY_ARTIFACTS_CLEANED', note: 'temporary task artifacts deleted in a separate commit' },
    { name: 'COMPLETED', terminal: true },
  ]},
]
const failure = ['BLOCKED', 'WAITING_FOR_INPUT', 'WAITING_FOR_APPROVAL', 'CONFLICTED', 'FAILED', 'CANCELLED', 'CI_FAILED', 'JIRA_CHANGED', 'SPEC_REVIEW_REQUIRED']
</script>

# Feature lifecycle

Start a feature with:

```text
/aisdlc-dev:feature FEAT-1234
```

The feature command does everything up to and including the specification, then stops at the first human gate. The rest of the lifecycle is driven by the task state, which is stored in `tasks/FEAT-1234/task.yaml`.

## State diagram

<StateFlow :groups="groups" :failure="failure" />

Square markers are gates: the task cannot advance past them until a person acts or an external fact is verified. `PLAN_DRAFTED` may be skipped straight to `IMPLEMENTING` when the change is small enough that plan approval is not required.

::: details Plain-text diagram
```text
CREATED
  -> TICKET_READY
  -> UNDERSTOOD
  -> IMPACT_ANALYZED
  -> REPOSITORIES_IDENTIFIED
  -> REPOSITORIES_PREPARED
  -> SPEC_DRAFTED
  -> AWAITING_SPEC_APPROVAL
  -> SPEC_APPROVED
  -> PLAN_DRAFTED
  -> AWAITING_PLAN_APPROVAL   (required for major or cross-repo changes)
  -> IMPLEMENTING
  -> VALIDATING
  -> REVIEWING
  -> COMMITTING
  -> COMMITTED
  -> PR_CREATED
  -> CI_VALIDATING
  -> MERGE_READY
  -> MERGED
  -> RELEASE_PENDING
  -> RELEASED
  -> KNOWLEDGE_CONSOLIDATION_PENDING
  -> KNOWLEDGE_CONSOLIDATED
  -> TEMPORARY_ARTIFACTS_CLEANED
  -> COMPLETED
```
:::

## UI features and designs

When an affected repository is a UI repository (`"ui": true` in `config/repositories.yaml`), `/aisdlc-dev:feature` runs `/aisdlc-dev:design-link` after the specification is drafted and before approval. The designer has synced the prototype to the design repository (`designs/prototype/`) and pushed the ticket's branch; aisdlc reads that ticket's pages (read-only) from the registered design repository and records them in `system/designs/<TICKET>/` as numbered versions, with the source commit. You confirm the recorded pages against the design. The feature specification pins one version in section 11 ("Design references"), and the plan, implementation and review follow the design. Approving the specification approves the pinned design, and changing the pin later requires reapproval. The recorded designs are not deleted by cleanup. UI behavior and each design page and state are verified with Playwright against the local dev server (mocked backend, synthetic data); the screenshots are reviewed against the design and recorded in `validation.md`.

## What to do next

At every step aisdlc tells you what comes next and whose turn it is. After each state change you see a line such as:

```text
Next (You): Approve with /aisdlc-dev:approve FEAT-1234 specification, ask for changes, or /aisdlc-dev:reject FEAT-1234 specification <reason>. Source edits stay blocked until approved.
Next (Claude): Draft the implementation plan.
```

`Next (You)` means the task is waiting for you (a review, an approval, a merge, a release). `Next (Claude)` means Claude continues on its own. You can ask for the suggestion for the current state at any time, and `/aisdlc-dev:status` shows it for every active task. After a failure (`BLOCKED`, `CONFLICTED`, `CI_FAILED` and so on) the hint says how to recover and when to run `/aisdlc-dev:resume`.

## What you do and what aisdlc does

| Step | Who | Result |
|---|---|---|
| Run `/aisdlc-dev:feature FEAT-1234` | You | Ticket is fetched (or [you are asked for details](/guide/jira-unavailable)); snapshot saved to `tasks/FEAT-1234/jira.md`. |
| Understand and impact analysis | aisdlc | Summary of what, why, acceptance criteria, constraints and unknowns. Directly affected, indirectly affected, and reviewed-but-excluded repositories, each with a reason. Unknowns that materially affect design must be resolved before the specification. |
| Repository preparation | aisdlc | For each affected repository: verify path and Git repo, no merge or rebase in progress, stash local changes (including untracked files, message `aisdlc: FEAT-1234 pre-task stash`, never auto-popped), checkout `main`, `git fetch origin --prune`, `git pull --ff-only origin main`, create branch `FEAT-1234`. Recorded in `repository-preparation.yaml`. |
| Specification | aisdlc | `tasks/FEAT-1234/specification.md`, the full structured feature specification. |
| **Specification approval** | **You** | See [approval gates](/guide/approvals). Implementation is blocked until approved. |
| Implementation plan | aisdlc | Per-repository changes, cross-repo sequencing, migration ordering, validation and rollback checkpoints. |
| **Plan approval** | **You**, when required | Required for cross-repository, database, API, security-sensitive or high-risk changes. |
| Implement, test, review | aisdlc | Repository tests, integration and contract tests, cross-repo validation, then review agents. |
| Commit | aisdlc | `FEAT-1234: <changes summary>` on branch `FEAT-1234`. |
| PR, CI, merge | aisdlc, per configured policy | Pull request(s) from the generated description; CI is validated; merge follows policy. Reviewer comments are handled with `/aisdlc-dev:pr-comments` (fixes go back through IMPLEMENTING and are committed and pushed only after you confirm). |
| Release | You / your release process | Production release must be verified (see [post-release](/guide/post-release-and-finish)). |
| `/aisdlc-dev:post-release FEAT-1234` | You | Product knowledge consolidated, temporary artifacts removed. |
| `/aisdlc-dev:finish FEAT-1234` | You | Final verification. |

## What source edits are allowed in each state

The state is authoritative for permissions, and a hook enforces it.

| State | Source edits in repositories | Git commit | Pull request | Spec edits |
|---|---|---|---|---|
| `UNDERSTOOD` | No | No | No | Yes |
| `IMPACT_ANALYZED` | No | No | No | Yes |
| `AWAITING_SPEC_APPROVAL` | **No** | No | No | Yes |
| `SPEC_APPROVED` | Yes | No | No | Yes, with versioning |
| `IMPLEMENTING` | Yes | Yes, after the commit gate | No | No, without re-approval |
| `VALIDATING` | Yes, for fixes | Yes | No | No |
| `COMMITTED` | No, except follow-up fixes | Yes | Yes | No |

The rule to remember: **before `SPEC_APPROVED`, aisdlc may change task artifacts but must not change application source files in any registered repository.**

## Temporary versus durable

Everything in `tasks/FEAT-1234/` except the retained metadata is temporary working material. After release, [post-release](/guide/post-release-and-finish) turns what was actually delivered into durable product knowledge under `system/product/` and deletes the temporary artifacts. The retained files are `task.yaml`, `approvals.yaml` and `execution-log.jsonl`.

## Other task types

Refactors, database changes, API changes, dependency upgrades and documentation tasks use this same state machine. `/aisdlc-dev:investigate` is read-only and has a short lifecycle (`CREATED`, `TICKET_READY`, `UNDER_INVESTIGATION`, `COMPLETED`). Bugs have their own, see [bug lifecycle](/guide/bug-lifecycle).
