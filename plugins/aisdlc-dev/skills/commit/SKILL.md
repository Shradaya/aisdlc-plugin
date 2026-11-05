---
name: commit
description: Create a compliant git commit "<ticket-number>: <changes summary>" on the task branch and record the hash in task state. Use only when the developer runs /aisdlc-dev:commit or confirms the commit stage of a workflow.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# commit

## Purpose
Single shared way to commit under the convention of spec §29, §48. Format is exactly `<ticket-number>: <changes summary>` with no body.

## Invocation conditions
Explicit `/aisdlc-dev:commit <ticket-number>`, or the workflow's COMMITTING stage after developer confirmation. Also used by product-knowledge-consolidation (workspace commits). `$ARGUMENTS` = `<ticket-number>`.

## Inputs
Active task, each affected repository's diff, `${CLAUDE_PLUGIN_ROOT}/config/policies.yaml` `commit.max_subject_length` (120).

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows an active task in IMPLEMENTING (code commits, at the commit step) or KNOWLEDGE_CONSOLIDATED (the consolidation and cleanup workspace commits).
- Validation complete and code review complete for code commits (`validation.md`, `code-review.md`).

## Procedure
For each repository to commit (use `git -C <path>`):
1. Identify the active task (this ticket).
2. Confirm the current branch equals the ticket: `git -C <path> rev-parse --abbrev-ref HEAD`. If not, stop; never switch branches here and never commit on `main`.
3. Inspect `git -C <path> status`.
4. Inspect the staged diff `git -C <path> diff --cached`.
5. Stage only task-related files by explicit path (`git -C <path> add <files>`); never `git add -A` or `.`. Exclude secrets, credentials, `.env`, key files, unrelated changes.
6. `git -C <path> diff --cached --check`; fix whitespace errors; re-inspect `git -C <path> diff --cached`.
7. Write a concise one-line summary from the actual diff. Validate: starts with `<TICKET>`, then exactly `: `, non-empty summary, one line, <= 120 characters, describes the real changes.
8. Commit with a single `-m`: `git -C <path> commit -m "<TICKET>: <summary>"`. No body, no extra `-m`, no `--amend`, no `--no-verify`.
9. Record the hash: `git -C <path> rev-parse HEAD`, then `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> commits.<repo> '"<hash>"'`. Append audit `commit-created` (repo, hash) to `tasks/<TICKET>/execution-log.jsonl`.
10. After all repositories are committed, the workflow runs `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> COMMITTED`.

Workspace (control-plane) commits, used by consolidation and finish, follow the same steps with `<path>` = the workspace root. The git hook requires the workspace's current branch to equal the ticket number; if it does not, stop and ask the developer how to proceed (the spec does not define a workspace branch policy).

## Outputs
One compliant commit per repository; `commits.<repo>` in task state; audit event.

## Failure behavior
Hook-blocked commit (invalid message, wrong branch, no active task): read the BLOCKED reason, fix the cause (message, branch checkout by the developer), do not bypass. Nothing staged or unrelated changes only: report and stop.

## Safety restrictions
Never commit secrets, never force or amend, never commit to `main`, never put a body in the message, never bypass hooks. Never edit `task.yaml` directly.
