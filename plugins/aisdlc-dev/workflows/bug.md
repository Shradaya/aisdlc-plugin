# Bug Workflow

Reference for `/aisdlc-dev:bug` (spec §18.2, §35). Procedure: `skills/bug/SKILL.md`. Uses the `bug` lifecycle in `${CLAUDE_PLUGIN_ROOT}/config/task-types.yaml`. No feature-sized specification by default.

## States

CREATED, TICKET_READY, UNDER_INVESTIGATION, ROOT_CAUSE_CONFIRMED, REPOSITORIES_IDENTIFIED, REPOSITORIES_PREPARED, IMPLEMENTING, VALIDATING, REVIEWING, COMMITTING, COMMITTED, PR_CREATED, CI_VALIDATING, COMPLETED. Failure states as in `workflows/feature.md`.

## Flow

Get ticket -> reproduce / understand symptom -> trace execution path -> form root-cause hypotheses -> validate root cause -> identify affected repositories -> prepare repositories -> implement minimal fix -> add regression test -> validate -> review -> commit.

## Required artifacts

`jira.md`, `impact-analysis.md`, `root-cause.md`, `validation.md`. `root-cause.md` must include a black-box "Expected vs Actual Behavior" section (observable behavior only) that the `test-writer` agent uses to write the regression test.

## Gates

- Source edits allowed from REPOSITORIES_PREPARED to COMMITTED (hook-enforced; no specification approval needed).
- A mini-plan (`implementation-plan.md`) with developer approval is required when the bug affects multiple repositories, APIs, databases, infrastructure or security-sensitive behavior (`${CLAUDE_PLUGIN_ROOT}/config/policies.yaml` `bug.require_plan_for_cross_repo`). The state engine does not enforce it for bugs; the workflow does.
- A bug MUST NOT be closed without regression coverage unless technically impossible and an explicit waiver is recorded in `validation.md`.
- Tests are written by `test-writer` without seeing the implementation; the implementer must not edit them. Reviewers see only requirement, code and tests.
- Commits `<ticket>: <summary>` on branch `<ticket>`; PR/CI per policy.
- Product-knowledge update is required if user-visible product behavior changed (spec §57); the bug lifecycle has no release or consolidation states, so record it as pending in `documentation.md`.
