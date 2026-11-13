---
name: ticket-new
description: Start a local PM task for a Jira key so the PM can begin drafting requirements. Use when the PM runs /aisdlc-pm:ticket-new.
argument-hint: <KEY> [--title "..."]
disable-model-invocation: true
---

# ticket-new

## Purpose
Create the local PM task for a Jira key so the PM can start drafting. The task record lives under `tasks/<KEY>/`; Jira remains the source of truth for the requirements and acceptance criteria once they are written there.

## Invocation conditions
Explicit `/aisdlc-pm:ticket-new <KEY> [--title "..."]`. `<KEY>` must match `^[A-Z][A-Z0-9]*-\d+$`.

## Procedure
1. Decide the title: from `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-pm.js issue <KEY>` (its summary) when Jira is configured, else ask the PM with AskUserQuestion.
2. Create the local task: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js init <KEY> pm`. If it already exists, report that and continue.
3. On success, offer `/aisdlc-pm:requirements <KEY>` to begin drafting. (`/aisdlc-pm:requirements` also runs `init` on its own, so `ticket-new` is an optional explicit entry point.)

## Safety restrictions
- Creates only the local task record; no approval and no state move beyond what `init` sets (CREATED).
- Jira is read-only here (summary lookup only); never print a credential value.
