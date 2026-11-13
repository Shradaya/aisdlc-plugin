---
name: bug
description: Bug workflow for a ticket - reproduce, confirm root cause, identify repositories, minimal fix with regression test, validate, review, commit, PR/CI. No feature-sized specification. Use only when the developer runs /aisdlc-dev:bug.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# bug

## Purpose
Fix a defect with a confirmed root cause and regression coverage (spec §18.2, §35). Lifecycle detail: `${CLAUDE_PLUGIN_ROOT}/workflows/bug.md`.

## Invocation conditions
Explicit `/aisdlc-dev:bug <ticket-number>`. `$ARGUMENTS` = `<ticket-number>`.

## Inputs
Ticket matching `^[A-Z][A-Z0-9]*-\d+$`; `${CLAUDE_PLUGIN_ROOT}/config/policies.yaml` (`bug.require_regression_test`, `bug.require_plan_for_cross_repo`).

## Prerequisites
Valid ticket; no existing task (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` fails) - otherwise direct to `/aisdlc-dev:resume`. Stage skills marked `disable-model-invocation` (repository-preparation, commit, create-pr) are performed by reading their `SKILL.md` after developer confirmation, as in the feature skill.

## Procedure
Append audit events to `tasks/<TICKET>/execution-log.jsonl` as stages complete.
1. Retrieve the ticket (jira-ticket phase 1, bug fields; fallback via questions, never guess). `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js init <TICKET> bug`; jira-ticket phase 2; `transition <TICKET> TICKET_READY`.
2. `transition <TICKET> UNDER_INVESTIGATION`. Reproduce or understand the symptom, trace the execution path (read-only), form root-cause hypotheses, and validate them with evidence. Ask the developer for missing facts.
3. Write `tasks/<TICKET>/root-cause.md`: symptom, trace, hypotheses and their validation, confirmed root cause with evidence, and a section `## Expected vs Actual Behavior (black-box)` that contains observable behavior only (no file or function names), used later for the regression test. `transition <TICKET> ROOT_CAUSE_CONFIRMED` only when validated.
4. Identify affected repositories: write `tasks/<TICKET>/impact-analysis.md` through the impact-analysis skill, confirm with the developer, record `repositories`. (The bug lifecycle has no separate REPOSITORIES_IDENTIFIED state; identification flows straight into preparation.) If two or more repositories are confirmed, or the fix changes a shared contract, run the cross-repo-trace skill now, before preparation: it may add repositories, and the source-edit hook blocks until it is done (`policies.yaml` `bug.require_trace_for_cross_repo`).
5. Repository preparation: run the repository-preparation skill (fetch, update main, branch `<TICKET>` from the latest `origin/main`); ends in REPOSITORIES_PREPARED. No feature-sized specification is required.
6. Mini-plan: required when the bug affects multiple repositories, APIs, databases, infrastructure or security-sensitive behavior (`bug.require_plan_for_cross_repo`). Write `implementation-plan.md` (short form of spec §25) and obtain the developer's approval: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js approve <TICKET> plan` only after an explicit choice. The CLI does not gate bug implementation on this approval; you must not proceed without it.
7. `transition <TICKET> IMPLEMENTING` (absorbs validation and review as sub-steps). First run the testing skill in `write` mode: `test-writer` writes the regression test from `jira.md` plus the black-box section of `root-cause.md` only (never the implementation). Then implement the minimal fix on branch `<TICKET>`. MUST NOT edit or delete the regression test.
   a. Validation sub-step: testing skill `run` mode; record in `validation.md`. A bug MUST NOT be closed without regression coverage unless technically impossible and an explicit waiver is recorded (`${CLAUDE_PLUGIN_ROOT}/config/policies.yaml`).
   b. Review sub-step: code-review skill; documentation skill for technical documentation impact. If user-visible product behavior changed, note it in `documentation.md` as a `pending` product-knowledge update (the bug lifecycle has no release/consolidation states).
8. Commit and PR: ask the developer to confirm, follow the commit skill, `transition <TICKET> COMMITTED`; then the create-pr skill (PRs into the configured target branches, `git_hosting.pr_target_branches`), which transitions to PR_CREATED; this state covers CI validation, and a later `/aisdlc-dev:create-pr <TICKET>` run tracks CI and records the merge.
9. When CI passes and the PR is merged, the developer runs `/aisdlc-dev:finish <TICKET>` and the task becomes COMPLETED.

## Outputs
`jira.md`, `impact-analysis.md`, `root-cause.md`, `validation.md` (plus `implementation-plan.md` for mini-plans, `code-review.md`, `documentation.md`); commits and PR(s).

## Failure behavior
Use `transition <TICKET> BLOCKED|WAITING_FOR_INPUT|CONFLICTED|FAILED|CI_FAILED --reason "..."` and stop. Root cause not provable: stay in UNDER_INVESTIGATION and ask; never fix an unconfirmed cause.

## Safety restrictions
Source edits are blocked by hook until REPOSITORIES_PREPARED. Same git, secret, production and `task.yaml` restrictions as the feature skill. Never call `approve` without an explicit developer choice.
