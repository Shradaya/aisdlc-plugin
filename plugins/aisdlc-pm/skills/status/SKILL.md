---
name: status
description: Read-only overview of the PM workspace - every active PM ticket with its state, next step, and whether the acceptance criteria are drafted and approved; plus which credentials are set (by name only) and whether Jira is connected this session. Use only when the PM runs /aisdlc-pm:status.
argument-hint: [ticket-number]
disable-model-invocation: true
---

# status

## Purpose
Answer "where is each ticket, and what do I do next?" without changing anything.

## Invocation conditions
Explicit `/aisdlc-pm:status [<TICKET>]`. With a ticket, report only that one in more detail (its full lifecycle position, the acceptance-criteria approval, recent history).

## Inputs
`tasks/*/task.yaml` (through the state CLI), `config/integrations.yaml`, Jira (read-only).

## Procedure
1. For each task folder under `tasks/` (or just `<TICKET>`): `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <T>` and `... next <T>`. Skip COMPLETED and CANCELLED unless a ticket was named.
2. Per ticket show: state and its position in the PM lifecycle, the `Next (...)` line and whose turn it is, which of `requirements.md` / `acceptance-criteria.md` exist under `tasks/<T>/`, and the acceptance-criteria gate (pending / approved with who and when / rejected with the reason). Flag when `acceptance-criteria.md` changed after approval (the hand-off is then blocked until it is re-approved with `/aisdlc-pm:approve <T> acceptance_criteria`).
3. Jira connection: `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-pm.js check` (`connected`, naming its route; `not-configured` on exit 2, else `disconnected` with its `error`/`hint`). Credentials by name only: report `JIRA_EMAIL` and `JIRA_API_TOKEN` as `set (environment)` or `missing` (never values). Jira write switches come from `config/integrations.yaml` (`update_description`, the AC field); report them as on/off.
4. End with one line: for a live view in the browser (each ticket's lifecycle, the acceptance-criteria approval, and all its documents), run `/aisdlc-pm:status-page`.

## Outputs
A report in the conversation only.

## Failure behavior
A corrupt or unreadable task file: list it as a warning and continue with the rest. Jira unreachable: say so; the rest of the report still stands.

## Safety restrictions
Strictly read-only: no transitions, no `set`, no approvals (this plugin never approves), no Jira writes. Never print credential values.
