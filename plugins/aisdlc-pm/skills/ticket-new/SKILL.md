---
name: ticket-new
description: Create a ticket on the AISDLC server for a Jira key (PM or admin only), previewing the create first. Use when the PM runs /aisdlc-pm:ticket-new.
argument-hint: <KEY> [--title "..."] [--type feature|bug|investigation]
disable-model-invocation: true
---

# ticket-new

## Purpose
Create a ticket on the server for a Jira key so the PM can start drafting. Creating tickets needs the server role `pm` or `admin`.

## Invocation conditions
Explicit `/aisdlc-pm:ticket-new <KEY> [--title "..."] [--type feature|bug|investigation]`. `<KEY>` must match `^[A-Z][A-Z0-9]*-\d+$`. Type defaults to `feature` (this plugin targets feature tickets).

## Procedure
1. Decide the title: from `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-pm.js issue <KEY>` (its summary) when Jira is configured, else ask the PM with AskUserQuestion.
2. Preview the create: `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js push <KEY> --create --title "..." --type <type> --dry-run`. Show the result.
3. Confirm with AskUserQuestion, then run it without `--dry-run`.
4. If the server refuses because the role is not `pm`/`admin`, report the message verbatim with the fix: log in as a PM.
5. On success, offer `/aisdlc-pm:requirements <KEY>`.

## Safety restrictions
- The only server write is the `--create`; no approval, no phase move beyond what `--create` sets.
- Jira is read-only here (summary lookup only); never print a credential value.
