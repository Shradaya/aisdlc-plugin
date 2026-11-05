---
name: waiting
description: List the tickets on the AISDLC server that are waiting on the developer (the current phase is owned by the dev role), with the phase and what to do next. Use when the developer runs /aisdlc-dev:waiting or asks what is waiting on them, what to work on next, or whether QA has finished.
argument-hint: [--all]
---

# waiting

## Purpose
Answer "what is waiting on me?" from the server, so a developer does not need the web UI to find the next ticket after QA, design or the PM handed something over.

## Procedure
1. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js tickets $ARGUMENTS`. Without `--all` it lists tickets whose current phase is owned by the dev role; with `--all` every ticket the user can see, waiting ones marked `*`.
2. For each waiting ticket give the next action by phase:
   - TICKET_READY: `/aisdlc-dev:pull <T>` then `/aisdlc-dev:feature <T>` (or `bug` / `investigate`).
   - UNDERSTOOD..PR_CREATED: continue with `/aisdlc-dev:resume <T>`.
   - AWAITING_DEV_FIX or QA_REGRESSION (failed): `/aisdlc-dev:fix-defect <T>`.
   - QA_PASSED: open and merge the PR(s) into `lf-uat`, then `/aisdlc-dev:release <T> uat`.
   - REGRESSION_PASSED: production release (outside this plugin), then `/aisdlc-dev:release <T> prod`.
   - PROD_RELEASE: `/aisdlc-dev:post-release <T>`.
   - KNOWLEDGE_CONSOLIDATED: `/aisdlc-dev:finish <T>`.
3. Tickets with a failure status (BLOCKED, WAITING_FOR_INPUT, ...) show the phase they resume at; open the ticket with `/aisdlc-dev:pull <T>` and read `tasks/<T>/server-ticket.json`.

This skill only reads. It never moves a ticket or approves a gate.
