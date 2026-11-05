# QA Workflow

Reference for `/aisdlc-qa:test`, `/aisdlc-qa:run`, `/aisdlc-qa:publish` and `/aisdlc-qa:commit`. Procedures live in `skills/<name>/SKILL.md`; this file is the lifecycle contract. The `qa` task type uses the `qa` lifecycle in `${CLAUDE_PLUGIN_ROOT}/config/task-types.yaml`.

## States (in order)

CREATED, TICKET_READY, ENVIRONMENT_READY, SCENARIOS_DRAFTED, AWAITING_SCENARIO_APPROVAL, SCENARIOS_APPROVED, TESTS_GENERATED, TESTS_EXECUTED, AWAITING_DEV_FIX, AWAITING_RESULTS_SIGNOFF, RESULTS_SIGNED_OFF, EVIDENCE_PUBLISHED, COMMITTED, COMPLETED.

Failure states (reachable from any state): BLOCKED, WAITING_FOR_INPUT, WAITING_FOR_APPROVAL, CONFLICTED, FAILED, CANCELLED, JIRA_CHANGED, SCENARIO_REVIEW_REQUIRED. All state changes go through `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition|approve|reject`.

Loops (the `skip` map): request changes (AWAITING_SCENARIO_APPROVAL → SCENARIOS_DRAFTED; also from any later test stage when a scenario is wrong), heal (TESTS_EXECUTED → TESTS_GENERATED), all passed (TESTS_EXECUTED → AWAITING_RESULTS_SIGNOFF), re-verify after the developer's fix (AWAITING_DEV_FIX → TESTS_EXECUTED), re-run before sign-off (AWAITING_RESULTS_SIGNOFF → TESTS_EXECUTED), publishing skipped (RESULTS_SIGNED_OFF → COMMITTED).

## Stage table

| # | Checkpoint | State on entry -> exit | Who | Skill / agent | Artifact |
|---|---|---|---|---|---|
| 1 | Ticket loaded | CREATED -> TICKET_READY | Claude | test, jira-ticket | `tasks/<T>/jira.md` (AC1..ACn, hashed) |
| 2 | Environment ready | TICKET_READY -> ENVIRONMENT_READY | Claude + QA confirms env, build, synthetic data | test, `env-check.js`, `run-tests.js --login-check` | `environment` in task state, `.auth/<env>.json` |
| 3 | Scenarios drafted | ENVIRONMENT_READY -> SCENARIOS_DRAFTED | Claude | playwright-test-planner (optional exploration), scenario-writer | `tasks/<T>/exploration.md`, `tasks/<T>/scenarios.md` |
| 4 | **Scenario approval** | -> AWAITING_SCENARIO_APPROVAL -> SCENARIOS_APPROVED | QA | test | `approvals.scenarios` (hash of `scenarios.md`) |
| 5 | Tests generated | SCENARIOS_APPROVED -> TESTS_GENERATED | Claude | playwright-test-generator, qa-test-reviewer | `tasks/<T>/spec.md`, `tests/<T>/**` on branch `<T>` |
| 6 | Tests executed (QA watches) | TESTS_GENERATED -> TESTS_EXECUTED | Claude runs, QA watches | run, `run-tests.js` | `tasks/<T>/evidence/run-<N>/`, `runs.<N>` |
| 7 | Failure triage | TESTS_EXECUTED | QA decides per failure | test, results-analyst, playwright-test-healer | `tasks/<T>/results.md` |
| 7a | **Defect reported on Jira** | TESTS_EXECUTED -> AWAITING_DEV_FIX | Claude drafts, QA approves the comment | test, `evidence-pack.js --defect`, `jira-attach.js defect` | `defects.D<k>` (open), Jira comment + screenshots |
| 7b | **Waiting for developer** | AWAITING_DEV_FIX | Developer | test / status, `jira-attach.js status` | developer replies, ticket status |
| 7c | Re-verify the fix | AWAITING_DEV_FIX -> TESTS_EXECUTED | QA starts, Claude runs | run, `jira-attach.js reply` | `defects.D<k>` fixed, follow-up comment |
| 8 | **Results sign-off** | -> AWAITING_RESULTS_SIGNOFF -> RESULTS_SIGNED_OFF | QA | test, results-analyst | `approvals.signoff` (hash of `results.md`) |
| 9 | Evidence published | RESULTS_SIGNED_OFF -> EVIDENCE_PUBLISHED | Claude, QA confirms | publish, `evidence-pack.js`, `jira-attach.js attach/comment` | Jira attachments + results comment |
| 10 | Tests committed | -> COMMITTED | QA confirms | commit | commit `<T>: <summary>` on branch `<T>` |
| 11 | Done | COMMITTED -> COMPLETED | QA (pushed, PR opened) | commit | regression suite |

## Gates

- **Scenario approval** is explicit QA approval (`approve <T> scenarios`), pinned to the sha256 of `tasks/<T>/scenarios.md`. The state engine refuses SCENARIOS_APPROVED, TESTS_GENERATED, TESTS_EXECUTED, RESULTS_SIGNED_OFF and COMMITTED without it, or when `scenarios.md` changed since. The hook blocks writes to `tests/<T>/**` and `tasks/<T>/spec.md` outside SCENARIOS_APPROVED..COMMITTED or with a changed `scenarios.md` (Write/Edit, shell writes, and the Playwright generator's MCP write tool).
- **Expected results** come from the ticket's acceptance criteria only. Exploration makes steps concrete; a difference between ticket and app is a suspected defect, never a new expectation. A healed test never loosens an assertion or changes an expected value; that is a scenario change and needs reapproval.
- **Defects** are recorded in task state (`defects.D<k>`: scenario, severity, status open/fixed/waived, Jira comment). The engine refuses AWAITING_RESULTS_SIGNOFF and RESULTS_SIGNED_OFF while any defect is open. Fixed needs a passing re-run confirmed by the QA; waived needs the QA's explicit choice and a reason.
- **Results sign-off** is explicit QA approval (`approve <T> signoff`), pinned to the sha256 of `tasks/<T>/results.md`. The engine refuses EVIDENCE_PUBLISHED and COMMITTED without it.
- **Jira writes** go only through `scripts/jira/jira-attach.js`, only when switched on in `config/integrations.yaml`, and only after the QA chooses to post. The hook allows `defect` in TESTS_EXECUTED / AWAITING_DEV_FIX, `reply` from TESTS_EXECUTED to AWAITING_RESULTS_SIGNOFF, and `attach` / `comment` only after sign-off; ad-hoc HTTP to Jira is blocked. Ticket status changes only to explicitly configured transitions.
- **Environments**: tests never run against production. `config/environments.yaml` must allow automation for the environment, and its host must match neither `blocked_hosts` nor the policy's production patterns; enforced by `run-tests.js`, the hook and `playwright.config.ts`. Data is synthetic.
- **Credentials** (`QA_USERNAME`, `QA_PASSWORD`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) are environment variables; `QA_USERNAME` / `QA_PASSWORD` may instead be in `.env` in the workspace (gitignored; Claude has no access: the hook and `.claude/settings.json` deny it). Never `claude.env` or any other file. `JIRA_*` stay environment-only (`jira-attach.js` reads them from there). `scripts/qa/cred-check.js` reports set/missing, never values. The login runs in its own step outside the evidence, so it never appears in traces, screenshots or reports; `.auth/` and `.env` are never read, printed or committed. Login fields are matched by exact label (or by the configured selectors), and a `success_url` is suggested after the first login.
- **Production hosts**: a `blocked_hosts` entry `example.com` covers its subdomains; `=example.com` blocks only that exact host (production on the bare domain, QA on a subdomain). `add-env.js` refuses an entry that would block a configured environment.
- **Ad-hoc checks** (`/aisdlc-qa:check`, no ticket) sit outside this lifecycle: black-box only, no state, no Jira, no gate; specs go under `checks/` (the only test folder writable without an approved ticket) and proof to `test-results/<check>/run-<yyyymmdd-hhmmss>/`. A check becomes regression tests only through `/aisdlc-qa:test <TICKET>`.
- **Playwright** runs through `run-tests.js`, `run-check.js` or `pw.js`, which apply the production guard and drop `NO_COLOR` (Windows PowerShell 5.1 turns its warning into an error). Runs are judged by exit code and the JSON report, never by stderr.
- **Commits** must be `<T>: <summary>` (one line, no body) on branch `<T>`, for a task whose scenarios and results are approved; commit on `main`, force-push and history rewrite are blocked. The first commit of a new QA repository is the only exception.
- **Ticket drift**: before generating tests and before publishing, the ticket is re-fetched; a material change moves the task to JIRA_CHANGED → SCENARIO_REVIEW_REQUIRED and the scenarios need reapproval.

## Layout

Everything about one ticket lives together. `tests/<T>/` holds its tests (`s<n>-<scenario-slug>.spec.ts`, header `// spec: tasks/<T>/spec.md`) and, if needed, `tests/<T>/helpers.ts`; the folder names the ticket, and the hook blocks a file in it whose tags name another ticket. Helpers two or more tickets need go in `fixtures/`. `tasks/<T>/spec.md` is an exact copy of the approved `scenarios.md`, refreshed at every re-approval, and the only file of `tasks/<T>/` that is committed (a `.gitignore` exception). `npx playwright test tests/<T>` runs one ticket; `npx playwright test` runs the regression suite. Older workspaces (`specs/<T>.md`, `tests/<feature-area>/`) move over with `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-qa-init.js <workspace> --migrate-layout [--dry-run] [--force]`; until then their old files can be read and run, but new writes go only to the per-ticket paths.

## Evidence

Per-step screenshots are the proof; video is recorded only on request (`--video`). Each run writes `tasks/<T>/evidence/run-<N>/`: `report/` (Playwright HTML report: every step with its screenshot, trace viewer), `artifacts/` (traces, error context; videos only with `--video`), `screenshots/<T>-S<n>/<nn>-<step>.png` (one per step; the failing one ends in `-FAILED`; tabs opened or changed by the step, such as a PDF, as `<nn>-<step>-tab<k>.png`), `results.json`, `summary.json`, `run.json`. `tasks/` is not committed: the Jira ticket keeps the long-term copy (`publish`), and the committed tests can reproduce any run (`npx playwright test --grep @<T>`). Playwright's own output goes to `test-results/.playwright/` (emptied on every run), so ad-hoc check proof elsewhere in `test-results/` survives.

Documents opened in a new tab are checked by content: `fixtures/pdf.ts` (`openedPdf`) captures the PDF response and extracts its text, so a test catches the wrong document opening; the PDF viewer tab's title is never asserted.
