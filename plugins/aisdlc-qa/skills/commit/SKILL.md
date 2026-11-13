---
name: commit
description: "Commit a signed-off QA ticket's Playwright tests (tests/{TICKET}/) and its approved scenarios (tasks/{TICKET}/spec.md) to the QA test repository on branch {TICKET}, with the commit message '{TICKET}: {summary}', then guide the push and pull request that add them to the regression suite. Use only when the QA engineer runs /aisdlc-qa:commit."
argument-hint: "<ticket-number>"
disable-model-invocation: true
---

# commit

## Purpose
Turn a ticket's verified tests into permanent regression tests: commit them on branch `<TICKET>` in the QA workspace (which is itself the Playwright test repository). The hook enforces that the results are signed off, the branch is `<TICKET>`, and the message is `<TICKET>: <summary>`.

## Invocation conditions
Explicit `/aisdlc-qa:commit <TICKET>`. The task is at EVIDENCE_PUBLISHED, or at RESULTS_SIGNED_OFF when publishing was skipped (`jira.publish` = `"skipped"`), or at COMMITTED to mark it complete. Run inside the QA workspace.

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows `approvals.signoff.status` = `approved`. If not, stop and point to `/aisdlc-qa:test <TICKET>`.
- The QA workspace is a git repository with a `main` branch.

## Procedure
1. Confirm the state and approvals via `get`. At COMMITTED: ask whether the branch is pushed and the pull request opened; if yes, `transition <TICKET> COMPLETED` and stop.
2. Branch: `git rev-parse --abbrev-ref HEAD` must be `<TICKET>`. If on `main`, `git checkout <TICKET>` (or `git checkout -b <TICKET>` if the tests were written on `main`, carrying the uncommitted changes over). Never commit on `main` (the hook blocks it).
3. Stage only this ticket's files, by explicit path: `git add tests/<TICKET> tasks/<TICKET>/spec.md`. The folder is the selector: a file in `tests/<TICKET>/` whose tags or `// spec:` header name another ticket is a finding to fix first, not something to commit. If `git add` reports `tasks/<TICKET>/spec.md` as ignored, the workspace's `.gitignore` lacks the spec exception: say so, add it with `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-qa-init.js <workspace> --migrate-layout` (it appends the exception) or use `git add -f tasks/<TICKET>/spec.md` this once. Never stage anything else from `tasks/`. If `fixtures/`, `playwright.config.ts` or `config/` changed for this ticket, list them and ask whether to include them. Never stage the rest of `tasks/`, `logs/`, `.auth/`, `claude.env`, `.mcp.json` or `node_modules`.
4. Show the staged files and the proposed summary, and ask with AskUserQuestion to confirm. On confirmation commit with exactly one single-line message: `git commit -m "<TICKET>: <summary>"` (summary describes the tests added, at most 120 characters). The hook rejects any other format, a body, the wrong branch, or results that are not signed off.
5. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> COMMITTED`. Append audit `tests-committed` (branch, commit sha, files).
6. Tell the QA to push and open a pull request into `main` so the tests join the regression suite: `git push -u origin <TICKET>` (the QA's action; never force-push). Afterwards `/aisdlc-qa:commit <TICKET>` again marks the task COMPLETED.

## Outputs
A commit on branch `<TICKET>` with `tests/<TICKET>/` and `tasks/<TICKET>/spec.md`; state COMMITTED (or COMPLETED).

## Failure behavior
Not signed off, wrong branch, or unrelated changes mixed in: stop and report. A dirty or conflicted working tree that cannot be separated: `transition <TICKET> CONFLICTED --reason "<why>"` and let the QA resolve it by hand. Never force-push, never rewrite history.

## Safety restrictions
- Commit message is exactly `<TICKET>: <summary>`, one line, no body, on branch `<TICKET>`.
- Stage only the ticket's tests and spec; never commit credentials, saved sessions (`.auth/`), evidence or patient data.
- Never edit `task.yaml` directly; never push with `--force`.
