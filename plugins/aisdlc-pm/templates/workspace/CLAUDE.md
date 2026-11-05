# PM workspace

This folder is an aisdlc **PM** (project-manager) workspace, managed by the `aisdlc-pm` plugin. A project manager drafts the requirements and acceptance criteria for a ticket here, pushes them to the AISDLC server, and optionally writes them into the Jira description.

## Navigation

- `tasks/<TICKET>/` — one folder per ticket: `requirements.md` and `acceptance-criteria.md` (the two files the PM authors and pushes), plus pulled context (`brief.md`, `design.md`, `specification.md`, `results.md`) and local-only state. State CLI: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js`. Never edit `task.yaml` by hand.
- `config/` — `workspace.yaml` (kind pm), `integrations.yaml` (Jira site URL, credential variable names, write switches). Never put secrets here.
- `logs/` — audit log.

## Lifecycle

`CREATED -> REQUIREMENT_GATHERING -> ACCEPTANCE_CRITERIA_DEFINED -> HANDED_OFF_TO_DESIGN -> HANDED_OFF_TO_DEV -> COMPLETED`. `/aisdlc-pm:requirements <TICKET>` and `/aisdlc-pm:acceptance-criteria <TICKET>` draft the two files; `/aisdlc-pm:push <TICKET>` sends them to the server; `/aisdlc-pm:handoff <TICKET> dev|design` routes the ticket. On the server, `ACCEPTANCE_CRITERIA_DEFINED` and the hand-off map onto `DESIGN_BRIEF` / `TICKET_READY`.

## Rules

- **This plugin never approves.** The single approval of the acceptance criteria is a human decision in the AISDLC web UI/API. There is no approve command here, and the hooks block any attempt to approve or reject from the workspace.
- The files the PM owns are `tasks/<TICKET>/requirements.md` and `tasks/<TICKET>/acceptance-criteria.md`; they are editable only between `REQUIREMENT_GATHERING` and `ACCEPTANCE_CRITERIA_DEFINED` (after hand-off a deliberate rework transition is required first).
- Jira is only ever written through `scripts/jira/jira-pm.js` (preview first, then an explicit confirmation); ad-hoc HTTP to Jira is blocked. No secrets, credentials, or real patient data in any file, log or state.
- Credentials live in environment variables only (`JIRA_EMAIL`, `JIRA_API_TOKEN`), never in a file in this workspace.
