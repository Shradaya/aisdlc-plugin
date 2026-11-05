---
name: status-page
description: Open the live QA status page in the browser - every QA ticket with its past, current and upcoming lifecycle states, approvals, defects, every test run with its step screenshots and Playwright report, history and all its documents, plus environments and credentials (names only). Read-only local web server. Use when the QA engineer runs /aisdlc-qa:status-page.
argument-hint: [--port <n>] [--stop]
disable-model-invocation: true
---

# status-page

## Purpose
Start a read-only local web page that shows where every QA ticket stands, with the screenshots of every run, and refreshes itself every few seconds while Claude works. `/aisdlc-qa:status` stays the console overview (and the only place that can see whether Jira is connected in this session).

## Invocation conditions
`/aisdlc-qa:status-page [--port <n>] [--stop]`. `$ARGUMENTS` = those options. Default port 4318 (aisdlc-dev's page uses 4317).

## Inputs
Optional `--port <n>`; `--stop` to stop a page this session started.

## Prerequisites
Run from the QA workspace (or a subfolder); `config/workspace.yaml` has `"kind": "qa"`. Node 18+. No `npm install`: the server has no dependencies.

## Procedure
1. `--stop`: stop the background task that runs the server (from step 2 of an earlier call in this session) and report it stopped. If it was started elsewhere, tell the QA engineer to close that terminal or press Ctrl+C there. Stop here.
2. Start the server as a **background** command (Bash `run_in_background`), so it keeps running while the session continues: `node "${CLAUDE_PLUGIN_ROOT}/scripts/status/status-server.js" --port <n>`.
3. Read its first output line:
   - `Status page: http://localhost:<n>/ ...`: started.
   - `Status page already running: http://localhost:<n>/`: one is already serving this workspace; use it.
   - `Port <n> is in use ...`: retry once with `--port 0` (any free port) and use the URL it prints.
4. Give the QA engineer the URL, and for one ticket `http://localhost:<n>/#/task/<TICKET>`. Offer to open it in their browser (Windows `start "" <url>`, macOS `open <url>`, Linux `xdg-open <url>`); open it only if they say yes.
5. Say what it shows (below) and that `/aisdlc-qa:status-page --stop` stops it.

## What the page shows
- **Overview**: counts (active tickets, waiting on you, approvals and sign-offs pending, waiting on the developer, open defects, blocked or failed); every ticket with its title (from `jira.md`), state, progress through the lifecycle, last run (passed/failed, build, when), defects (open/fixed/waived), the suggested next step and whose turn it is (filters: active, waiting on you, all); blocking issues; environments (base URL, automation allowed, data, login mode, whether a session is saved) and blocked hosts; credential variables as set (environment or `.env`) or missing.
- **Ticket page** (`#/task/<TICKET>`):
  - the whole lifecycle, every state marked done (with when it was entered, and how many times after loops such as heal, re-run and re-verify), skipped, current, interrupted (failure state, with the reason and the state it left) or still ahead; the scenario approval and results sign-off marked as QA decisions;
  - the next step; details (environment, build, data confirmation, runs, defects);
  - approvals with approver, time, version and a warning when `scenarios.md` or `results.md` changed after approval;
  - defects: scenario, severity, status, expected vs actual, the run and build it was found in, the fix run or the waiver and its reason, the Jira comment;
  - **runs and screenshots**: one tab per run (newest first) with mode, environment, build and totals; per scenario its result, acceptance criteria, duration, the failed step and error, and every step screenshot in order (the failing step outlined). Click a screenshot to open it full width (scroll for full-page shots; Fit to screen, arrow keys for previous/next, Esc to close). Videos are shown when the run recorded them. "Open Playwright report" opens that run's HTML report (with traces);
  - every document in `tasks/<TICKET>/`, most recently updated first (Markdown rendered or as source); the evidence internals (report, artifacts, screenshots) are shown under Runs instead;
  - the audit history from `execution-log.jsonl`.

## Outputs
A URL. No files change.

## Failure behavior
Not in a QA workspace: the server prints why and exits 1; report it. The page shows "server not reachable" when the server stops; start it again.

## Safety restrictions
- Read-only: answers GET only, never writes a file, never runs a state, Playwright, git or Jira command.
- Local only: binds 127.0.0.1 and refuses any Host header other than localhost/127.0.0.1.
- Serves files only from inside `tasks/<TICKET>/` (no `..`, no symlink escape), never `.env*`, `.auth/` or key files. Credentials appear by name as set/missing, never a value.
- Screenshots show the test environment's synthetic data; the page stays on this machine.
- Claude does not read pages through the server; it keeps using the state CLI and the files directly.
