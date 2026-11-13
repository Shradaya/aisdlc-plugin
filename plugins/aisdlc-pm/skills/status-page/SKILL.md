---
name: status-page
description: "Open the live PM status page in the browser - every PM ticket with its past, current and upcoming lifecycle states, the acceptance-criteria approval, the next step and whose turn it is, history, and all its documents (requirements.md, acceptance-criteria.md, jira.md). Read-only local web server; can also write a self-contained HTML snapshot, or one ticket's status as Markdown. Use when the PM runs /aisdlc-pm:status-page."
argument-hint: "[--port <n>] [--stop] | --export <file.html> [--with-docs] [--force] | --markdown <TICKET> [--out <file.md>]"
disable-model-invocation: true
---

# status-page

## Purpose
Start a read-only local web page that shows where every PM ticket stands and refreshes itself every few seconds while Claude works. `/aisdlc-pm:status` stays the console overview (and the only place that can see whether Jira is connected in this session).

## Invocation conditions
`/aisdlc-pm:status-page [--port <n>] [--stop]`, or `--export <file.html> [--with-docs] [--force]`, or `--markdown <TICKET> [--out <file.md>]`. `$ARGUMENTS` = those options. Default port 4319 (aisdlc-dev's page uses 4317, aisdlc-qa's 4318).

## Inputs
Optional `--port <n>`; `--stop` to stop a page this session started.

## Prerequisites
Run from the PM workspace (or a subfolder); `config/workspace.yaml` has `"kind": "pm"`. Node 18+. No `npm install`: the server has no dependencies.

## Procedure
0. `--export` or `--markdown`: no server. Ask the PM where the file should go if they did not say, then run it in the foreground and report what it prints:
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/status/status-server.js" --export <file.html> [--with-docs] [--force]` writes one self-contained HTML file: the same page with the overview and every ticket as of now, opened from disk or sent by email, with no server. The local workspace path and which credential variables are set are left out. Documents (requirements, acceptance criteria, Jira text) are left out unless `--with-docs`, which embeds the text ones (not images or binaries); say this when `--with-docs` is chosen, since the file then carries ticket content and the approver name. It refuses to overwrite a file without `--force`.
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/status/status-server.js" --markdown <TICKET> [--out <file.md>]` prints (or writes) one ticket's status as Markdown: state, next step, the acceptance-criteria approval with who and when, recent history. Show it to the PM; posting it anywhere (a Jira comment, a hand-off note) is a separate step they must ask for.
   Stop here.
1. `--stop`: stop the background task that runs the server (from step 2 of an earlier call in this session) and report it stopped. If it was started elsewhere, tell the PM to close that terminal or press Ctrl+C there. Stop here.
2. Start the server as a **background** command (Bash `run_in_background`), so it keeps running while the session continues: `node "${CLAUDE_PLUGIN_ROOT}/scripts/status/status-server.js" --port <n>`.
3. Read its first output line:
   - `Status page: http://localhost:<n>/ ...`: started.
   - `Status page already running: http://localhost:<n>/`: one is already serving this workspace; use it.
   - `Port <n> is in use ...`: retry once with `--port 0` (any free port) and use the URL it prints.
4. Give the PM the URL, and for one ticket `http://localhost:<n>/#/task/<TICKET>`. Offer to open it in their browser (Windows `start "" <url>`, macOS `open <url>`, Linux `xdg-open <url>`); open it only if they say yes.
5. Say what it shows (below) and that `/aisdlc-pm:status-page --stop` stops it.

## What the page shows
- **Overview**: counts (active tickets, waiting on you, pending approvals, blocked or failed, completed); every ticket with its title (from `jira.md`), type, state, progress through the PM lifecycle (CREATED -> REQUIREMENT_GATHERING -> ACCEPTANCE_CRITERIA_DEFINED -> HANDED_OFF_TO_DESIGN/DEV -> COMPLETED), the suggested next step and whose turn it is (filters: active, waiting on you, all); blocking issues; credential variables (`JIRA_EMAIL`, `JIRA_API_TOKEN`) as set/missing by name.
- **Ticket page** (`#/task/<TICKET>`): the whole lifecycle with every state marked done (with when it was entered, and how many times after a loop back via `/aisdlc-pm:refine`), skipped, current, interrupted (failure state, with the reason and the state it left) or still ahead, the acceptance-criteria gate marked; the next step; details (type, created/updated, ticket source, hand-off target); the acceptance-criteria approval with approver, time, version and a warning when `acceptance-criteria.md` changed after approval; the audit history from `execution-log.jsonl`; and every document in `tasks/<TICKET>/`, most recently updated first, Markdown rendered (or as source), other text shown as is, images inline.

## Outputs
A URL; no files change. With `--export` or `--markdown`, the one file named (or the Markdown on screen).

## Failure behavior
Not in a PM workspace: the server prints why and exits 1; report it. The page shows "server not reachable" when the server stops; start it again.

## Safety restrictions
- Read-only: the live server answers GET only, never writes a file, never runs a state or Jira command, and starts no subprocesses. `--export` and `--markdown` write only the one file they are given (refusing an existing file without `--force` for `--export`), run no server and change nothing else.
- Local only: binds 127.0.0.1 and refuses any Host header other than localhost/127.0.0.1.
- Serves documents only from inside `tasks/<TICKET>/` (no `..`, no symlink escape), never `.env*` or key files. Credentials appear by name as set/missing, never a value.
- A snapshot is a copy: it can be shared, and it does not update. Nothing in it reaches back to the workspace.
- Claude does not read pages through the server; it keeps using the state CLI and the files directly.
