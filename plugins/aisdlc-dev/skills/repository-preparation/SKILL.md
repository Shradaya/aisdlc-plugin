---
name: repository-preparation
description: Deterministically prepare each affected repository - verify, stash local changes, update main fast-forward only, create the branch named exactly the ticket number. Use only after the affected repository list is confirmed.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# repository-preparation

## Purpose
Put every affected repository on a fresh branch `<ticket-number>` based on updated `main` (spec §22).

## Invocation conditions
Only after the developer confirmed the affected repositories (task state REPOSITORIES_IDENTIFIED). Run by the feature/bug workflow after that confirmation, or via `/aisdlc-dev:repository-preparation <ticket-number>`.

## Inputs
`tasks/<TICKET>/task.yaml` `repositories`; `config/repositories.yaml` (paths).

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows status REPOSITORIES_IDENTIFIED and a non-empty `repositories` list.
- Every listed repository is registered with `base_branch: main`.

## Procedure
For each repository (use `git -C <path>` everywhere), append audit `repo-preparation-started`, then:
1. Verify the path exists.
2. Verify it is a Git repository (`git -C <path> rev-parse --git-dir`).
3. Verify no merge/rebase/cherry-pick is in progress (MERGE_HEAD, CHERRY_PICK_HEAD, rebase-merge/rebase-apply under the git dir). If any exists: stop, set the task `CONFLICTED`.
4. Inspect state: `git -C <path> status --porcelain=v1 -b`; record current branch and clean/dirty.
5. If dirty: `git -C <path> stash push --include-untracked -m "aisdlc: <TICKET> pre-task stash"`; locate its reference in `git stash list` and record it. Ignored files are not stashed. Never pop the stash.
6. If the branch `<TICKET>` already exists locally (`git rev-parse --verify --quiet refs/heads/<TICKET>`) or remotely (`git ls-remote --exit-code --heads origin <TICKET>`): do not overwrite, reset, delete or recreate it. A task record exists in this flow, so resume only after verifying repository and branch identity against `repository-preparation.yaml` if present; otherwise stop and request explicit human action.
7. `git -C <path> checkout main`.
8. `git -C <path> fetch origin --prune`.
9. `git -C <path> pull --ff-only origin main`. If fast-forward is impossible: stop for this repository, never merge or rebase `main`; set the task `CONFLICTED` (`... transition <TICKET> CONFLICTED --reason "main diverged in <repo>"`).
10. `git -C <path> checkout -b <TICKET>`; the branch name has no prefix, suffix, user name, date or slug.
11. Verify the branch tip equals updated `main` (`git -C <path> rev-parse HEAD main`).
12. Record per-repository results in `tasks/<TICKET>/repository-preparation.yaml` (JSON-compatible; shape of spec §22.2: `before.branch/status`, `stash.created/reference/message`, `branch.base/created/commit`). Append audit `repo-prepared` with repo and branch.
After all repositories succeed: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> workflow.repository_preparation '"completed"'` then `... transition <TICKET> REPOSITORIES_PREPARED`.

## Outputs
Task branches in each repository; `tasks/<TICKET>/repository-preparation.yaml`; audit events.

## Failure behavior
Stop at the first failing repository; keep the record of repositories already prepared; do not continue to later ones silently. Report exactly what state each repository is in. Use the matching failure state (`CONFLICTED`, `BLOCKED`) with a reason.

## Safety restrictions
- No force operations, no `reset --hard`, no `clean`, no auto-merge/rebase of `main`, no stash pop, no branch deletion.
- Only repositories listed in the task. Never edit `task.yaml` directly.
