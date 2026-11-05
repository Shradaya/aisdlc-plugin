---
name: testing
description: Derive the test matrix, have the test-writer agent write black-box tests from the approved specification only, run repository and cross-repository tests, and record validation evidence in tasks/<ticket>/validation.md.
argument-hint: <ticket-number> write|run
---

# testing

## Purpose
Establish and execute validation (spec §14.2, §14.3, §26) with tests that are independent of the implementation.

## Invocation conditions
Mode `write`: once the task is IMPLEMENTING, before implementation starts (feature lifecycle: spec approved; bug: repositories prepared). Mode `run`: the validation sub-step of IMPLEMENTING (run incrementally and as the validation gate before the review sub-step). `$ARGUMENTS` = `<ticket-number> [write|run]`.

## Inputs
Approved `specification.md` (bug: `jira.md` plus the black-box section of `root-cause.md`), `jira.md` acceptance criteria, `repositories/<repo>/testing.md` and `interfaces.md` for each affected repository, `impact-analysis.md` (changed interfaces, data changes, regression surfaces).

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows IMPLEMENTING (both modes); for features `approvals.specification.status` is `approved`.
- Task repositories are on branch `<TICKET>`.
- Testing profile exists for each repository; otherwise stop and recommend `/aisdlc-dev:refresh-repo`.

## Procedure
### Derive the matrix (both modes; create or update `validation.md`)
1. Derive tests from: Jira acceptance criteria, specification, affected repositories' testing profiles (layers, commands, test-data strategy, decision rules), changed interfaces, database/data changes, known regression surfaces.
2. In `tasks/<TICKET>/validation.md` record the matrix: acceptance criterion -> layer (unit, integration, contract, API, component, end-to-end, data-quality, migration, performance, security, smoke) -> repository -> test location -> command -> status -> evidence. Include required static checks and migration checks from `${CLAUDE_PLUGIN_ROOT}/config/testing-policy.yaml`. For a UI repository (`"ui": true`), verify UI behavior with Playwright (`${CLAUDE_PLUGIN_ROOT}/config/testing-policy.yaml` `ui`): layer `end-to-end`, one or more rows per acceptance criterion that describes user-visible behavior, and, when the specification pins a UI design ("Design references"), one row per pinned screen and state (default, loading, empty, error, disabled, responsive widths) with evidence = Playwright result plus the screenshot path. If the repository has no Playwright setup yet, the specification (section 22) and the plan must say that adding it is part of the change; do not mark the layer as waived merely because it is missing.

### Mode write - black-box tests
3. Launch the `test-writer` subagent once per affected repository. Give it ONLY: the approved specification text (bug: `jira.md` and the black-box expected/actual excerpt), that repository's `testing.md` and `interfaces.md`, the test directories and conventions from `testing.md`, and the matrix rows to cover. Do NOT give it implementation code, diffs, plans, codebase maps or implementer explanations; it must not read implementation.
4. It writes tests under the repository's test directories on branch `<TICKET>` (source-edit gate applies). Test files, `describe`/`it` names and comments MUST NOT contain the ticket number, branch name or acceptance-criterion IDs (no `*.el5580.spec.js`, no `EL-1234`, no `AC4:`); add the tests to the existing spec file of the module under test (for example OTP controller cases go in `mfa.v2.controller.spec.js`) as a new `describe` block that reuses its stubs; create a new spec file only when the module has no spec yet, named after the module following the repository's naming (for example `userStatus.v2.util.spec.js`), never after the ticket. The ticket-to-test mapping lives only in `validation.md`. Record every test file it created in `validation.md` under `## Test-writer files`. These files are locked: the implementer MUST NOT edit, delete, skip or weaken them.
4b. UI repositories: the test-writer writes Playwright specs from the specification only, including the "Design references" transcription (labels, states, messages), so it locates elements by role, label and visible text, never by implementation selectors, and names tests by behavior. Backend calls are mocked with Playwright routes or fixtures per `testing.md`. If the repository has no Playwright config, the implementer adds it (`@playwright/test` dev dependency, `playwright.config` with a `webServer` entry, an npm script) as an item the approved specification and plan list; the test-writer only writes the spec files. The test-writer does not run tests.
4a. Before the test-writer runs, record the baseline: run each target spec file that already exists (`testing.md` command) and note its passing count. After it finishes, the orchestrator runs the same files and the sibling specs in their folders and checks: passing = baseline + new tests, 0 failing, existing tests unchanged in behavior (review the diff of the shared setup); then runs prettier and eslint on the changed spec files and fixes formatting only. A failure in an existing test that the test-writer's setup change caused goes back to the test-writer (send it the failure output, never the implementation).
5. Append audit `test-started` events as appropriate.

### Mode run
6. Run, per repository, the commands from its `testing.md` for every mandatory layer, then required static checks and migration checks, using the shell. Capture pass/fail and relevant output (no secrets).
6a. UI repositories: run the Playwright command from `testing.md` against the local dev server (browsers installed once with `npx playwright install chromium`, which downloads from the network: tell the developer before running it). Run it with `UI_EVIDENCE_DIR=<absolute path of tasks/<TICKET>/validation-evidence/ui>` set. The suite takes a screenshot of every pinned screen and state into `$UI_EVIDENCE_DIR/<screen-id>-<state>.png` (a temporary task artifact: cleaned up with the task; synthetic data only, never real patient data). Then view each screenshot and compare it with the pinned `system/designs/<DESIGN-TICKET>/design.md` and `versions/v<N>/snapshot.md`: record per screen and state `matches` or `deviates (what)` in `validation.md`. This is a reviewed comparison against a described design, not a pixel diff; ask the developer to confirm any deviation or ambiguity. Never run Playwright against production.
7. Run cross-repository validation (contract/integration across affected repositories, consumer validation for API changes, migration and rollback verification for database changes) per `workflows/*.md` for the task type.
8. Failing tests: pass only the failure output (test name, assertion, stack) to whoever implements fixes. Do not send test source to the implementer. If a test is judged wrong, escalate to the developer; the fix is a spec change with reapproval, then test-writer rewrites it.
9. Update `validation.md` with results and evidence per acceptance criterion. Append audit `test-completed`.
10. Completion check (spec §14.3): all mandatory layers pass; all required static checks pass; all required migration checks pass; every acceptance criterion has explicit evidence; known failures resolved or covered by an approved waiver recorded in `validation.md`. Bugs additionally require a passing regression test or a recorded waiver. Only if all hold may the caller proceed to the review sub-step (the task stays in IMPLEMENTING; there is no separate VALIDATING/REVIEWING state).
11. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> workflow.validation '"completed"'` when complete.

## Outputs
`tasks/<TICKET>/validation.md`; test files in affected repositories (written only by `test-writer`); audit events.

## Failure behavior
Missing prerequisites or unmet completion criteria: report what is missing; do not proceed to the review sub-step. Persistent failures: `transition <TICKET> BLOCKED --reason "..."` or ask for a waiver (record it, never invent one).

## Safety restrictions
- Test-writer sees the spec only, never the implementation.
- Never disable, skip or delete tests merely to make validation pass.
- Never run tests against production systems or with production credentials.
- Never edit `task.yaml` directly.
