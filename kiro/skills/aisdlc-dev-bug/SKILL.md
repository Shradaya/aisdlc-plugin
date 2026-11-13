---
name: aisdlc-dev-bug
description: Bug workflow for a ticket - reproduce, confirm root cause, identify repositories, minimal fix with a regression test, validate, review, commit, PR/CI. No feature-sized specification. Use when the user wants to fix a bug under the aisdlc lifecycle in a dev workspace.
---

# aisdlc bug workflow (Kiro)

Fix a defect with a confirmed root cause and regression coverage. See `aisdlc-lifecycle-reference` for conventions, the `AI_SDLC_PLUGIN_HOME` setup, and the gate rules. Let `DEV=%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev` and `STATE=node %DEV%\scripts\state\aisdlc-state.js`.

The ticket must match `^[A-Z][A-Z0-9]*-\d+$`. Run inside a dev workspace. Stage detail lives in `%DEV%\skills\<stage>\SKILL.md`.

## Note on enforcement in Kiro
No hook blocks source edits. The state CLI enforces legal transitions. Follow the branch/commit and regression-test rules by discipline.

## Procedure
Append audit events to `tasks/<TICKET>/execution-log.jsonl`.
1. Retrieve the ticket (jira-ticket phase 1, bug fields; ask if Jira is unavailable, never guess). `%STATE% init <TICKET> bug`; jira-ticket phase 2; `%STATE% transition <TICKET> TICKET_READY`.
2. `%STATE% transition <TICKET> UNDER_INVESTIGATION`. Reproduce or understand the symptom, trace the execution path (read-only), form and validate root-cause hypotheses with evidence. Ask the developer for missing facts.
3. Write `tasks/<TICKET>/root-cause.md`: symptom, trace, hypotheses and validation, confirmed root cause with evidence, and a `## Expected vs Actual Behavior (black-box)` section with observable behavior only (no file or function names), used for the regression test. `%STATE% transition <TICKET> ROOT_CAUSE_CONFIRMED` only when validated.
4. Identify affected repositories (impact-analysis stage): write `impact-analysis.md`, confirm with the developer, record `repositories`. (No separate REPOSITORIES_IDENTIFIED state; identification flows into preparation.)
5. Repository preparation (`%DEV%\skills\repository-preparation\SKILL.md`): fetch, update main, branch `<TICKET>` from the latest `origin/main`; ends REPOSITORIES_PREPARED. No feature-sized specification.
6. Mini-plan: required when the bug spans multiple repositories, APIs, databases, infrastructure or security-sensitive behavior (`%DEV%\config\policies.yaml`). Write a short `implementation-plan.md` and get the developer's approval: `%STATE% approve <TICKET> plan` only after an explicit choice. Do not proceed without it when required.
7. `%STATE% transition <TICKET> IMPLEMENTING` (absorbs validation and review as sub-steps). First run the testing stage in `write` mode: the regression test is written from `jira.md` plus the black-box section of `root-cause.md` only (never the implementation). Then implement the minimal fix on branch `<TICKET>`. Do not edit or delete the regression test.
   a. Validation sub-step: testing stage `run` mode; record in `validation.md`. Do not close without regression coverage unless technically impossible and an explicit waiver is recorded.
   b. Review sub-step: code-review stage; documentation stage for technical-doc impact. Note any user-visible product-behavior change in `documentation.md` as pending.
8. Commit and PR: confirm with the developer, commit stage, `%STATE% transition <TICKET> COMMITTED`; then the create-pr stage (PRs into the configured target branches, `git_hosting.pr_target_branches`), which transitions to PR_CREATED; this state covers CI validation, and a later create-pr run tracks CI and records the merge.
9. When CI passes and the PR is merged, the developer finishes the task and it becomes COMPLETED.

## Outputs
`jira.md`, `impact-analysis.md`, `root-cause.md`, `validation.md` (plus `implementation-plan.md` for mini-plans, `code-review.md`, `documentation.md`); commits and PR(s).

## Failure behavior
`%STATE% transition <TICKET> BLOCKED|WAITING_FOR_INPUT|CONFLICTED|FAILED|CI_FAILED --reason "..."` and stop. Root cause not provable: stay in UNDER_INVESTIGATION and ask; never fix an unconfirmed cause.

## Safety restrictions
Source edits are appropriate only from REPOSITORIES_PREPARED onward. Same git/secret/production/`task.yaml` rules as the feature skill. Never call `approve` without an explicit developer choice.
