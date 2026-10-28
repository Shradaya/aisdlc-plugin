# aisdlc-qa

The QA side of the AI-SDLC lifecycle for Claude Code. For each Jira ticket, the plugin:

1. drafts test scenarios from the ticket's acceptance criteria, for the QA engineer to approve;
2. generates Playwright tests from the approved scenarios;
3. runs them in a browser the QA watches, with a screenshot of every step;
4. reports app defects on the ticket and waits for the developer's fix;
5. re-verifies the fix;
6. attaches the signed-off evidence to Jira;
7. commits the tests into a regression suite.

Commands are `/aisdlc-qa:<skill>`. The plugin works in an aisdlc **QA workspace**. That folder is also the team's Playwright test repository.

## Install

Add the marketplace once per machine:

```
/plugin marketplace add ~/.claude/plugin
```

Then install the plugin. Pick one of these scopes:

```
/plugin install aisdlc-qa@aisdlc-marketplace                               # all your projects (user scope)
claude plugin install aisdlc-qa@aisdlc-marketplace --scope project         # only this workspace, shared through .claude/settings.json
claude plugin install aisdlc-qa@aisdlc-marketplace --scope local           # only this workspace, only you
```

Run the `--scope project` and `--scope local` forms from inside the workspace folder. Afterwards, restart Claude Code in the workspace so the hooks, MCP servers and Playwright agents load.

The QA hooks act only in a folder whose `config/workspace.yaml` has `"kind": "qa"`, even when the plugin is installed for all projects. The dev and design hooks stay out of a QA workspace too.

## Set up a workspace

1. **Scaffold.** Run `/aisdlc-qa:init [folder]`. It creates the workspace and the Playwright test project in the same folder:
   - `config/{workspace,repositories,environments,integrations}.yaml`
   - `package.json` (with `@playwright/test` pinned)
   - `playwright.config.ts`
   - `fixtures/{env,qa,pdf}.ts` and `tests/{auth.setup,seed.spec}.ts`
   - `tasks/`, `logs/`, `CLAUDE.md` (each ticket later adds `tests/<TICKET>/` and `tasks/<TICKET>/spec.md`)
   - `.claude/settings.json`: enables the plugin for this project and denies reading `.env` and `.auth/` (merged into an existing file, never replacing it)

   Then, with your consent, it installs Playwright and Chromium (about 150 MB) and generates Playwright's own test agents (`init-agents --loop=claude`). The init script keeps your existing `.mcp.json` entries when it does this.
2. **Environments.** `init` adds the first environment. Add more with `/aisdlc-qa:add-env <name> <base-url>`.
   - **Login form:** give the visible label text of the fields and the sign-in button text (for example `Email Address`, `Password`, `Sign In`). They are matched exactly, so a "toggle password visibility" button isn't mistaken for the password field. IDs or selectors (`#email`, `button[type=submit]`) also work and win over labels; generated class names are refused. After the first login, set the suggested `success_url`; without it, a login that only shows an error message can still pass.
   - **Production hosts:** add each with `/aisdlc-qa:add-env --block-host <host>`. A plain host also blocks its subdomains. If production is the bare domain and QA a subdomain (`emc-portal.com` vs `qa.emc-portal.com`), use the exact form `--block-host "=emc-portal.com"`. An entry that would block a configured environment is refused.
   - **Jira settings from aisdlc-dev:** if you already have an aisdlc-dev workspace, `init` can reuse its `atlassian` MCP server (including the corporate certificate mount) and Jira site URL. It never copies `claude.env` or `.env`.
3. **Credentials.** Set them the same way as for `aisdlc-dev`, as environment variables:

   ```powershell
   $env:QA_USERNAME    = "qa.bot@example.com"     # test account on the QA environment (login form)
   $env:QA_PASSWORD    = "<test account password>"
   $env:JIRA_EMAIL     = "you@company.com"
   $env:JIRA_API_TOKEN = "<Jira API token>"
   ```

   To keep them across sessions, set them as user environment variables. `QA_USERNAME` / `QA_PASSWORD` may instead go in `.env` in the workspace, which is gitignored and which Claude can't read. `JIRA_*` must be environment variables, because the Jira MCP server reads them from there. Never put credentials in `claude.env` or any other file. `node <plugin>/scripts/qa/cred-check.js` shows which are set, never their values.
4. **Jira.**
   - Set `jira.base_url` in `config/integrations.yaml`.
   - Add the `atlassian` server from `.mcp.json.example` to `.mcp.json`, next to `playwright-test`. Don't replace the file. Behind Cloudflare WARP or Zscaler, point its CA mount at the corporate certificate (WARP: `C:/ProgramData/Cloudflare/installed_cert.pem`). `init --from-dev` does all of this for you if you have an aisdlc-dev workspace.
   - To let the plugin post defect and results comments and upload evidence, set `jira.write.add_comment` and `jira.write.add_attachment` to `true`, and give the token the write scopes listed in that file. Both are off by default.
5. Run `/aisdlc-qa:status` to check everything.

## Commands

| Command | What it does |
|---|---|
| `/aisdlc-qa:test <TICKET> [--env <name>]` | The main flow (checkpoints 1–8 below). Resumes from wherever the ticket is and stops at every QA decision. `--env` picks the environment from `config/environments.yaml`. |
| `/aisdlc-qa:run <TICKET> [--watch\|--ui\|--headless] [--build <id>] [--only S1,S3] [--video]` | Run the ticket's tests:<br>• `--watch` (default): a visible, slowed-down browser.<br>• `--ui`: Playwright UI mode.<br>• `--headless`: no window.<br>• `--video`: also record video (off by default; the per-step screenshots are the proof).<br>Each run gets a new evidence folder. Use it for the first run, after a test fix, and to re-verify a developer's fix. |
| `/aisdlc-qa:publish <TICKET>` | After sign-off, attach the report, screenshots and a results comment to Jira |
| `/aisdlc-qa:commit <TICKET>` | Commit `tests/<TICKET>/` and `tasks/<TICKET>/spec.md` on branch `<TICKET>`, ready for the regression suite |
| `/aisdlc-qa:check "<what to check>" [--env <name>] [--video]` | A quick check without a ticket. It explores the app black-box (never its source), writes `checks/<slug>.spec.ts` and runs it while you watch. The proof stays local in `test-results/<slug>/run-<yyyymmdd-hhmmss>/`. No Jira, no gates, never production. Promote it later with `/aisdlc-qa:test <TICKET>`. |
| `/aisdlc-qa:status [TICKET]` | Read-only overview, including developer replies on tickets that are waiting for a fix |
| `/aisdlc-qa:add-env <name> <url>` · `--block-host <host>` or `=<host>` | Add or change a test environment, or block a production host |
| `/aisdlc-qa:init [--only workspace\|agents]` | Scaffold the workspace. `--from-dev [path]` reuses the Jira settings of an aisdlc-dev workspace. `--only agents` regenerates Playwright's agents after a Playwright upgrade. |

## Checkpoints

The lifecycle contract is [`workflows/qa.md`](workflows/qa.md).

| # | Checkpoint | Who |
|---|---|---|
| 1 | Ticket loaded, acceptance criteria numbered AC1..ACn | Claude |
| 2 | Environment confirmed (never production), build recorded, login checked | Claude + QA |
| 3 | Scenarios drafted from the acceptance criteria, optionally after exploring the app in a visible browser | Claude |
| 4 | **Scenario approval**, pinned to the scenarios' hash | QA |
| 5 | Tests generated live in the browser by Playwright's generator, then reviewed against the scenarios | Claude |
| 6 | Tests run while the QA watches; every step screenshotted | Claude runs, QA watches |
| 7 | Failure triage, decided per failure: test issue (healed without loosening assertions), environment (re-run), or app defect | QA |
| 7a | **Defect comment on the Jira ticket**, with steps, expected vs actual and the screenshot | Claude drafts, QA approves |
| 7b | **Waiting for the developer's fix** (state AWAITING_DEV_FIX) | Developer |
| 7c | Re-verify on the new build, then post "verified fixed" | QA starts, Claude runs |
| 8 | **Results sign-off**, only with no open defect (a waiver needs a reason) | QA |
| 9 | Evidence published to Jira | Claude, QA confirms |
| 10 | Tests committed for the regression suite | QA confirms |

## What is enforced

| Rule | Enforced by |
|---|---|
| Expected results come only from the ticket's acceptance criteria, never from what the app currently does | Skills and agents |
| Tests are written only for approved, unchanged scenarios (Write/Edit, shell writes, and the Playwright generator's and planner's write tools). `checks/` is the only test folder writable without a ticket. | Hook |
| Never against production: `allow_automation`, `blocked_hosts` (`host` covers subdomains, `=host` is exact) and production-looking hosts | `run-tests.js`, `run-check.js`, `pw.js`, the hook and `playwright.config.ts` |
| Login runs in its own step outside the evidence, so credentials never appear in traces, screenshots or reports | `run-tests.js`, `run-check.js` and the setup project |
| `.env` (credentials) and `.auth/` (saved sessions) are never read, printed or committed. Checking a file exists, such as `Test-Path .env`, is allowed. | Hook and `.claude/settings.json` |
| A document opened in a new tab is checked by its content (`openedPdf`), never by the PDF tab's title | Skills and `qa-test-reviewer` |
| Jira writes only through `jira-attach.js`: defect comments after a run, evidence after sign-off, and nothing without the QA's choice; ad-hoc HTTP to Jira is blocked | Hook and skills |
| Sign-off is refused while any defect is open | State engine |
| Commits are `<TICKET>: <summary>` on branch `<TICKET>`, only once results are signed off | Hook |

## Where things live

- **Tests:** one folder per ticket, `tests/<TICKET>/s<n>-<scenario>.spec.ts`. They import `test`, `expect` and `qaStep` from `fixtures/qa.ts` and are tagged `@<TICKET>`, `@<TICKET>-S<n>` and `@<TICKET>-AC<n>`. Run one ticket with `npx playwright test tests/<TICKET>`; `npx playwright test` runs the whole regression suite. The hook blocks a file in `tests/<TICKET>/` whose tags name another ticket.
- **Helpers:** a ticket's own shared locators and actions go in `tests/<TICKET>/helpers.ts`. Helpers that two or more tickets need move to `fixtures/`.
- **Scenarios:** `tasks/<TICKET>/spec.md`, an exact copy of the approved `scenarios.md`. It's the one file of `tasks/<TICKET>/` that is committed (a `.gitignore` exception), next to the ticket's tests.
- **Task files:** the rest of `tasks/<TICKET>/` (`jira.md`, `scenarios.md`, `results.md`, the evidence) is temporary and not committed; Jira keeps the long-term copy.
- **Older workspaces** with `specs/<TICKET>.md` or `tests/<feature-area>/` folders: `node <plugin>/scripts/init/aisdlc-qa-init.js <workspace> --migrate-layout --dry-run` shows the moves to the per-ticket layout. Run it again without `--dry-run`, then commit the move.
- **Evidence for each run:** `tasks/<TICKET>/evidence/run-<N>/` contains the HTML report, traces and `screenshots/<TICKET>-S<n>/<nn>-<step>.png`. The failing step's screenshot ends in `-FAILED`, and tabs a step opened (a PDF, a popup) are saved as `<nn>-<step>-tab<k>.png`. Video is recorded only with `--video`.
- **Checks:** `checks/<slug>.spec.ts` (gitignored). Their proof is in `test-results/<slug>/run-<yyyymmdd-hhmmss>/`: `screenshots/`, `trace.zip`, `report/` and `result.json`. Playwright's own output goes to `test-results/.playwright/`, which it empties on every run, so earlier proof survives.

## Agents

- **This plugin's agents:**
  - `scenario-writer`: works from the ticket only.
  - `qa-test-reviewer`: read-only; flags weakened assertions.
  - `results-analyst`: proposes a classification and severity for each failure.
- **Playwright's own agents**, generated into the workspace: `playwright-test-planner`, `playwright-test-generator` and `playwright-test-healer`.

## Helpers

Each helper prints one JSON line. Exit codes are `0` ok, `1` refused or error, `2` not set up or credentials missing.

| Script | Purpose |
|---|---|
| `scripts/qa/run-tests.js` | Sign in, run the ticket's tests, write the evidence folder, summarize the results |
| `scripts/qa/run-check.js` | Sign in, run one `checks/` spec, write its proof folder and `result.json` |
| `scripts/qa/pw.js` | Run any Playwright command (`show-report`, `install`, `init-agents`, `codegen`, …) with the production guard and without `NO_COLOR`, which Windows PowerShell 5.1 otherwise turns into a failure. Judge it by its exit code. |
| `scripts/qa/cred-check.js` | Report whether `QA_USERNAME`, `QA_PASSWORD`, `JIRA_EMAIL` and `JIRA_API_TOKEN` are set (environment, or `.env` for `QA_*`), never their values |
| `scripts/qa/env-check.js` | Resolve an environment and apply the production guard; `--probe` checks it is reachable |
| `scripts/qa/add-env.js` | Add or change environments (labels or selectors for the login) and blocked hosts (refuses a block that would hit a configured environment) |
| `scripts/qa/summarize-results.js` · `evidence-pack.js` | Run summary; Jira upload packs (zips and per-scenario screenshots) |
| `scripts/jira/jira-attach.js` | Jira: `status`, `defect`, `reply`, `attach`, `comment` (REST v2, wiki markup). Uploads are de-duplicated per ticket. `--dry-run` needs no credentials. |

## Checks

```
node scripts/validation/test-gates-qa.js
```

## Working with the other plugins

The developer (`aisdlc-dev`) delivers the ticket to the QA environment. QA defects reach the developer as comments on the Jira ticket, and the QA task waits until the fix is deployed.
