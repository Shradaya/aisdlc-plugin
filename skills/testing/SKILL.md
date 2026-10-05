---
name: testing
description: Derive the test matrix, have the test-writer agent write black-box tests from the approved specification only, run repository and cross-repository tests, and record validation evidence in tasks/<ticket>/validation.md.
argument-hint: <ticket-number> write|run
---

# testing

## Purpose
Establish and execute validation (spec §14.2, §14.3, §26) with tests that are independent of the implementation.

## Invocation conditions
Mode `write`: once the task is IMPLEMENTING, before implementation starts (feature lifecycle: spec approved; bug: repositories prepared). Mode `run`: task is VALIDATING (or incrementally during IMPLEMENTING). `$ARGUMENTS` = `<ticket-number> [write|run]`.

## Inputs
Approved `specification.md` (bug: `jira.md` plus the black-box section of `root-cause.md`), `jira.md` acceptance criteria, `repositories/<repo>/testing.md` and `interfaces.md` for each affected repository, `impact-analysis.md` (changed interfaces, data changes, regression surfaces).

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows IMPLEMENTING (write) or IMPLEMENTING/VALIDATING (run); for features `approvals.specification.status` is `approved`.
- Task repositories are on branch `<TICKET>`.
- Testing profile exists for each repository; otherwise stop and recommend `/aisdlc:refresh-repo`.

## Procedure
### Derive the matrix (both modes; create or update `validation.md`)
1. Derive tests from: Jira acceptance criteria, specification, affected repositories' testing profiles (layers, commands, test-data strategy, decision rules), changed interfaces, database/data changes, known regression surfaces.
2. In `tasks/<TICKET>/validation.md` record the matrix: acceptance criterion -> layer (unit, integration, contract, API, component, end-to-end, data-quality, migration, performance, security, smoke) -> repository -> test location -> command -> status -> evidence. Include required static checks and migration checks from `config/testing-policy.yaml`. When the specification pins a UI design ("Design references"), add a row per pinned screen: layer `manual design conformance` (a visual layer does not exist in the testing profiles), evidence = side-by-side screenshots of the implemented screen and the pinned snapshot per state, supplied by the developer; if no UI test layer exists, record the waiver with reason. Do not invent screenshots.

### Mode write - black-box tests
3. Launch the `test-writer` subagent once per affected repository. Give it ONLY: the approved specification text (bug: `jira.md` and the black-box expected/actual excerpt), that repository's `testing.md` and `interfaces.md`, the test directories and conventions from `testing.md`, and the matrix rows to cover. Do NOT give it implementation code, diffs, plans, codebase maps or implementer explanations; it must not read implementation.
4. It writes tests under the repository's test directories on branch `<TICKET>` (source-edit gate applies). Test files, `describe`/`it` names and comments MUST NOT contain the ticket number, branch name or acceptance-criterion IDs (no `*.el5580.spec.js`, no `EL-1234`, no `AC4:`); add the tests to the existing spec file of the module under test (for example OTP controller cases go in `mfa.v2.controller.spec.js`) as a new `describe` block that reuses its stubs; create a new spec file only when the module has no spec yet, named after the module following the repository's naming (for example `userStatus.v2.util.spec.js`), never after the ticket. The ticket-to-test mapping lives only in `validation.md`. Record every test file it created in `validation.md` under `## Test-writer files`. These files are locked: the implementer MUST NOT edit, delete, skip or weaken them.
4a. Before the test-writer runs, record the baseline: run each target spec file that already exists (`testing.md` command) and note its passing count. After it finishes, the orchestrator runs the same files and the sibling specs in their folders and checks: passing = baseline + new tests, 0 failing, existing tests unchanged in behavior (review the diff of the shared setup); then runs prettier and eslint on the changed spec files and fixes formatting only. A failure in an existing test that the test-writer's setup change caused goes back to the test-writer (send it the failure output, never the implementation).
5. Append audit `test-started` events as appropriate.

### Mode run
6. Run, per repository, the commands from its `testing.md` for every mandatory layer, then required static checks and migration checks, using the shell. Capture pass/fail and relevant output (no secrets).
7. Run cross-repository validation (contract/integration across affected repositories, consumer validation for API changes, migration and rollback verification for database changes) per `workflows/*.md` for the task type.
8. Failing tests: pass only the failure output (test name, assertion, stack) to whoever implements fixes. Do not send test source to the implementer. If a test is judged wrong, escalate to the developer; the fix is a spec change with reapproval, then test-writer rewrites it.
9. Update `validation.md` with results and evidence per acceptance criterion. Append audit `test-completed`.
10. Completion check (spec §14.3): all mandatory layers pass; all required static checks pass; all required migration checks pass; every acceptance criterion has explicit evidence; known failures resolved or covered by an approved waiver recorded in `validation.md`. Bugs additionally require a passing regression test or a recorded waiver. Only if all hold may the caller `transition <TICKET> REVIEWING`.
11. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> workflow.validation '"completed"'` when complete.

## Outputs
`tasks/<TICKET>/validation.md`; test files in affected repositories (written only by `test-writer`); audit events.

## Failure behavior
Missing prerequisites or unmet completion criteria: report what is missing; do not move to REVIEWING. Persistent failures: `transition <TICKET> BLOCKED --reason "..."` or ask for a waiver (record it, never invent one).

## Safety restrictions
- Test-writer sees the spec only, never the implementation.
- Never disable, skip or delete tests merely to make validation pass.
- Never run tests against production systems or with production credentials.
- Never edit `task.yaml` directly.
