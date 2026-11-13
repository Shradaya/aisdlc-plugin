---
name: status-page
description: "Open the live status page for the aisdlc workspace in the browser - every task with its past, current and upcoming lifecycle states, approvals, next step, history and all its documents, plus repositories, blocking issues and credentials (names only). Read-only local web server; can also write a self-contained snapshot of the page as one HTML file, or one ticket's status as Markdown. Use when the developer runs /aisdlc-dev:status-page."
argument-hint: "[--port <n>] [--stop] | --export <file.html> [--with-docs] [--force] | --markdown <TICKET> [--out <file.md>]"
disable-model-invocation: true
---

# status-page

## Purpose
Start a read-only local web page that shows where every ticket stands and refreshes itself every few seconds while Claude works. `/aisdlc-dev:status` stays the console overview (and the only place that can see whether Jira, Git hosting and CI are connected in this session).

## Invocation conditions
`/aisdlc-dev:status-page [--port <n>] [--stop]`, or `--export <file.html> [--with-docs] [--force]`, or `--markdown <TICKET> [--out <file.md>]`. `$ARGUMENTS` = those options. Default port 4317.

## Inputs
Optional `--port <n>`; `--stop` to stop a page this session started.

## Prerequisites
Run from the aisdlc workspace (or a subfolder). Node 18+. No `npm install`: the server has no dependencies.

## Procedure
0. `--export` or `--markdown`: no server. Ask the developer where the file should go if they did not say (never inside a registered repository), then run it in the foreground and report what it prints:
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/status/status-server.js" --export <file.html> [--with-docs] [--force]` writes one self-contained HTML file: the same page with the overview and every ticket as of now, opened from disk or sent by email, with no server. The local workspace path and which credential variables are set are left out. Documents (Jira text, specifications) are left out unless `--with-docs`, which embeds the text ones (not images or binaries); say this when `--with-docs` is chosen, since the file then carries ticket content and approver names. It refuses to overwrite a file without `--force`.
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/status/status-server.js" --markdown <TICKET> [--out <file.md>]` prints (or writes) one ticket's status as Markdown: state, next step, approvals with who and when, commits, pull requests, CI, release, recent history. Show it to the developer; posting it anywhere (a Jira comment, a PR) is a separate step they must ask for.
   Stop here.
1. `--stop`: stop the background task that runs the server (from step 2 of an earlier call in this session) and report it stopped. If it was started elsewhere, tell the developer to close that terminal or press Ctrl+C there. Stop here.
2. Start the server as a **background** command (Bash `run_in_background`), so it keeps running while the session continues: `node "${CLAUDE_PLUGIN_ROOT}/scripts/status/status-server.js" --port <n>`.
3. Read its first output line:
   - `Status page: http://localhost:<n>/ ...`: started.
   - `Status page already running: http://localhost:<n>/`: one is already serving this workspace; use it.
   - `Port <n> is in use ...`: retry once with `--port 0` (any free port) and use the URL it prints.
4. Give the developer the URL, and for one ticket `http://localhost:<n>/#/task/<TICKET>`. Offer to open it in their browser (Windows `start "" <url>`, macOS `open <url>`, Linux `xdg-open <url>`); open it only if they say yes.
5. Say what it shows (below) and that `/aisdlc-dev:status-page --stop` stops it.

## What the page shows
- **Overview**: counts (active, waiting on you, pending approvals, blocked or failed, completed); every task with its title (from `jira.md`), type, state, progress through its lifecycle, the suggested next step and whose turn it is (filters: active, waiting on you, all); blocking issues; repositories with knowledge freshness (analyzed commit compared with the local clone's HEAD), base-branch compliance and missing clones; credential variables as set/missing.
- **Ticket page** (`#/task/<TICKET>`): the whole lifecycle with every state marked done (with when it was entered, and how many times after loops), skipped, current, interrupted (failure state, with the reason and the state it left) or still ahead, approval gates marked; the next step; details (repositories, workflow sub-steps, commits, pull requests, CI, release, product-doc consolidation); approvals with approver, time, version and a warning when the pinned artifact changed after approval; the audit history from `execution-log.jsonl`; and every document in `tasks/<TICKET>/`, most recently updated first, Markdown rendered (or as source), other text shown as is, images inline.

## Outputs
A URL; no files change. With `--export` or `--markdown`, the one file named (or the Markdown on screen).

## Failure behavior
Not in a workspace: the server prints the standard message and exits 1; report it. The page shows "server not reachable" when the server stops; start it again.

## Safety restrictions
- Read-only: the live server answers GET only, never writes a file, never runs a state, git-write or Jira command. Its only subprocesses are `git rev-parse` in registered clones. `--export` and `--markdown` write only the one file they are given (refusing an existing file without `--force` for `--export`), run no server and change nothing else.
- Local only: binds 127.0.0.1 and refuses any Host header other than localhost/127.0.0.1.
- Serves documents only from inside `tasks/<TICKET>/` (no `..`, no symlink escape), never `.env*` or key files. Credentials appear by name as set/missing, never a value.
- A snapshot is a copy: it can be shared, and it does not update. Nothing in it reaches back to the workspace.
- Claude does not read pages through the server; it keeps using the state CLI and the files directly.
