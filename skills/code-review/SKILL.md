---
name: code-review
description: Independent review of the implementation against the approved specification, with parallel specialist reviewer agents, recorded in tasks/<ticket>/code-review.md. Reviewers see only requirement, code and tests.
argument-hint: <ticket-number>
---

# code-review

## Purpose
Compare approved specification, implementation plan and actual git diff (spec §38) with independence from the implementer.

## Invocation conditions
Task state REVIEWING (after validation complete). `$ARGUMENTS` = `<ticket-number>`.

## Inputs
Requirement (feature: `specification.md`; bug: `jira.md` + `root-cause.md`), the actual diff per repository (`git -C <path> diff main...<TICKET>`), the tests (including test-writer files), `validation.md` results, `implementation-plan.md` (used only by this skill's own plan check).

## Prerequisites
`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows REVIEWING; `validation.md` shows validation complete.

## Procedure
1. Assemble reviewer input per repository: requirement text, the diff, and the test files. Do NOT give reviewers implementer explanations: no commit narratives, PR descriptions, implementation summaries, chat history, or the implementer's reasoning.
2. Select reviewers: always `security-reviewer` (where applicable) and `test-reviewer`; `backend-reviewer` for backend/API repositories (also covers API compatibility), `frontend-reviewer` for UI repositories (when the specification has "Design references", the pinned design in `system/designs/<DESIGN-TICKET>/` counts as part of the requirement it receives, and its design-conformance checklist applies), `database-reviewer` for schema/migration/data changes, `documentation-reviewer` for documentation impact. For major changes run them in parallel. There is no dedicated architecture reviewer agent in the spec's agent list; architecture consistency is assessed by the backend/frontend/database reviewers and by you in step 4.
3. Collect findings (each with severity, location, requirement reference, evidence).
4. Do the plan check yourself: compare `implementation-plan.md` against the diff for deviations; and the specification against the diff for unimplemented or out-of-scope behavior.
5. Review dimensions: functional correctness; specification compliance; architecture consistency; code quality; security; performance; test completeness; migration correctness; compatibility; observability; documentation impact.
6. Write `tasks/<TICKET>/code-review.md`: per-dimension verdict, per-reviewer findings, plan-vs-diff deviations, blocking vs advisory, and overall result. Append audit `review-completed`; `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> workflow.review '"completed"'` only when there are no open blocking findings.
7. Blocking findings go back to implementation under normal rules (re-run testing `run` mode afterwards); then re-review.

## Outputs
`tasks/<TICKET>/code-review.md`.

## Failure behavior
Reviewer failure or missing input: report; do not mark review complete. Unresolvable disagreement: ask the developer; never dismiss a blocking security or correctness finding silently.

## Safety restrictions
Review is read-only for repositories. Reviewers have no write access to repositories; only this skill writes `code-review.md`. Never edit `task.yaml` directly.
