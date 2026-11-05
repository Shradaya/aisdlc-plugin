---
name: waiting
description: Show which tickets are waiting on the PM (current phase owned by the PM role) from the server. Use when the PM runs /aisdlc-pm:waiting.
argument-hint: [--all]
---

# waiting

## Purpose
List the tickets whose current server phase is owned by the caller's role, so the PM sees what is waiting on them.

## Procedure
1. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js tickets $ARGUMENTS` and print the result.
2. For the PM role the owned phases are `REQUIREMENT_GATHERING` and `ACCEPTANCE_CRITERIA_DEFINED`.
3. Propose the next skill per row: `/aisdlc-pm:requirements`, `/aisdlc-pm:acceptance-criteria`, `/aisdlc-pm:handoff` or `/aisdlc-pm:refine`.

## Notes
- Known limit of the existing client (not changed here): for the server role `admin` the default `*` waiting filter is always empty, so admins use `--all`.
