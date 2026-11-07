---
name: status-page
description: Open the status page that shows every ticket's flow across roles (PM, Design, Dev, QA), hand-offs and open change requests. Read-only, localhost only. Use when the person runs /aisdlc:status-page or asks where a ticket is.
argument-hint: "[--port N] [--export file.html] [--json [TICKET]]"
---

# status-page

## Procedure
1. For a quick answer in the terminal, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/status/status-server.js --json [TICKET]` and summarise it in a few lines: per role, its status (waiting, active, done, changes requested, not needed) and its current step.
2. To open the page, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/status/status-server.js --port 4320` in the background and give the person `http://127.0.0.1:4320`. It refreshes every five seconds and is read-only. If the port is busy, use the next one.
3. For a file to share, run it with `--export <file>.html`: a self-contained snapshot of the page.
4. Run `/aisdlc:pull` first if the person wants the latest from the other roles.

## What it shows
Per ticket, in order: PM (requirement gathering, acceptance criteria, hand off), Design (created, hand off), Dev (understand, specification, plan, implement, pull request, merged), QA (scenarios, tests, results, sign-off). Each role is waiting, active, done, changes requested (with the open asks) or not needed. History lists every hand-off and return.

## Safety restrictions
Read-only: GET only, bound to 127.0.0.1, no file contents served beyond the derived flow.
