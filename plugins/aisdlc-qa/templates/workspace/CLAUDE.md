# QA workspace

This folder is an aisdlc **QA** workspace, managed by the `aisdlc-qa` plugin. It is also the team's Playwright test repository. For each Jira ticket, a QA engineer approves the test scenarios, watches the generated tests run in a real browser, reports defects on the ticket and waits for the fix, signs off the results, and commits the tests into the regression suite.

## Navigation

- `config/` — `workspace.yaml` (`"kind": "qa"`), `environments.yaml` (QA/UAT base URLs, login, `blocked_hosts`), `integrations.yaml` (Jira site URL and write switches), `repositories.yaml` (workspace marker). Plugin defaults (`task-types.yaml`, `qa-policy.yaml`) ship in `${CLAUDE_PLUGIN_ROOT}/config/`; a same-named file here overrides them.
- `tests/<feature-area>/*.spec.ts` — Playwright tests, tagged `@<TICKET>`, `@<TICKET>-S<n>`, `@<TICKET>-AC<n>`. `tests/auth.setup.ts` signs in once; `tests/seed.spec.ts` is the starting page for the Playwright agents.
- `specs/<TICKET>.md` — the approved scenarios for a ticket, committed next to its tests.
- `fixtures/qa.ts` — `test`, `expect` and `qaStep` (one screenshot per step, plus any tab the step opened). `fixtures/env.ts` — target environment, production guard and `credential()`. `fixtures/pdf.ts` — `openedPdf` / `pdfText`: check a document opened in a new tab by its content.
- `checks/<slug>.spec.ts` — ad-hoc checks without a ticket (`/aisdlc-qa:check`; gitignored). Their proof: `test-results/<slug>/run-<yyyymmdd-hhmmss>/` (`screenshots/`, `trace.zip`, `report/`, `result.json`). Playwright's own output is `test-results/.playwright/`.
- `.claude/agents/playwright-test-{planner,generator,healer}.md` — Playwright's own test agents (`/aisdlc-qa:init --only agents` regenerates them after upgrading Playwright).
- `tasks/<TICKET>/` — task state and temporary artifacts: `jira.md`, `scenarios.md`, `results.md`, `evidence/run-<N>/` (HTML report, traces, step screenshots; video only with `--video`). State CLI: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js`. Never edit `task.yaml` by hand.
- `logs/` — audit log.

## Lifecycle

`/aisdlc-qa:test <TICKET>` drives: ticket → environment → scenarios → **your scenario approval** (hash-pinned) → tests generated → run (you watch) → failure triage → defect comment on Jira and **wait for the developer's fix** → re-verify → **your results sign-off** (hash-pinned) → `/aisdlc-qa:publish` (evidence to Jira) → `/aisdlc-qa:commit` (tests into the regression suite). `/aisdlc-qa:run <TICKET>` re-runs at any test stage; `/aisdlc-qa:status` shows where every ticket stands; `/aisdlc-qa:add-env <name> <base-url>` adds a test environment (or `--block-host <host>` / `"=<host>"` a production host); `/aisdlc-qa:check "<what>"` runs a quick check without a ticket.

## Invariants (never optional)

1. A QA task has a ticket number; never guess missing ticket details, ask. Ad-hoc checks without one stay under `checks/` and `test-results/`, never in Jira or the regression suite.
2. Test the app black-box: never read its source code.
3. Expected results come from the ticket's acceptance criteria, never from what the app currently does.
4. Tests are written only for approved, unchanged scenarios (hook-enforced); `checks/` is the only test folder writable without a ticket.
5. Tests never run against production, and use synthetic data only.
6. Credentials (`QA_USERNAME`, `QA_PASSWORD`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) are environment variables; `QA_USERNAME` / `QA_PASSWORD` may instead be in `.env` in the workspace (gitignored; Claude has no access: the hook and `.claude/settings.json` deny it). Never `claude.env` or any other file. `JIRA_*` stay environment-only (the Jira MCP server reads them from there). `scripts/qa/cred-check.js` reports set/missing, never values. Never printed, logged, committed or put in evidence; `.auth/` and `.env` are never read, printed or committed.
7. Per-step screenshots are the proof; video only when asked for (`--video`). A document opened in a new tab is checked by its content, not its tab title.
8. Nothing is posted to Jira without the QA's explicit choice; final evidence only after sign-off.
9. A healed test never has a loosened assertion or a changed expected value; that needs a scenario change and reapproval.
10. Sign-off needs every defect fixed or explicitly waived with a reason.
11. Workflow state changes only through the state CLI; commits are `<TICKET>: <summary>` on branch `<TICKET>`.
12. Run Playwright through the plugin's `run-tests.js`, `run-check.js` or `pw.js`, and judge runs by exit code and the JSON report, not by stderr.
