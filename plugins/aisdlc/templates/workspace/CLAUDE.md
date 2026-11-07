# aisdlc shared repository

One repository for every role. Everyone pulls, works on their part, pushes, and hands off.

## Layout

- `tasks/<TICKET>/`: the ticket's documents (PM requirements and acceptance criteria, dev specification and plan, QA scenarios and results), each role's state in `task.<role>.yaml`, `handoffs/` (hand-off and return events, the shared record) and `changes.md` (open change requests; generated locally from the events, not committed).
- `designs/<TICKET>/`: the synced design pages (`/aisdlc-design:sync`).
- `system/`, `repositories/`, `config/`: dev knowledge, registered code repositories, workspace and flow configuration.
- Local only, never committed: QA `tests/` and Playwright files, `.env`, `claude.env`, `.aisdlc/`, logs.

## Flow

PM drafts requirements and acceptance criteria, then hands off to Design and/or Dev. Design syncs `designs/<TICKET>/`. Dev builds from `tasks/<TICKET>/` and the design. QA tests after merge. Any role can return a ticket with a reason; the receiver sees it in `changes.md` and resolves it with their next hand-off.

## Commands

- `/aisdlc:pull`: get the latest and see what is waiting for your role.
- `/aisdlc:push`: pulls first, then commits your workflow files as `<TICKET>: <summary>` and pushes the branch you are on after you confirm it (the team's branch, for example `S10`, made by hand; never `main`). A merge conflict is yours to resolve; aisdlc never resolves or aborts it.
- `/aisdlc:handoff <TICKET> <role>`: you are done; the next role starts.
- `/aisdlc:return <TICKET> <role> <reason>`: ask the previous role for changes.
- `/aisdlc:status-page`: the flow of every ticket, PM to QA.

Your own role's commands (`/aisdlc-pm:...`, `/aisdlc-design:...`, `/aisdlc-dev:...`, `/aisdlc-qa:...`) do the actual work.

## Shared-repo conventions for the role plugins

- Each role's task state and audit log carry the role: `tasks/<TICKET>/task.<role>.yaml` and `execution-log.<role>.jsonl`. Wherever a role skill says `task.yaml` or `execution-log.jsonl`, it means these files.
- The PM owns `jira.md`, `requirements.md` and `acceptance-criteria.md` of a ticket. Dev and QA read them (after `/aisdlc:pull`) instead of fetching Jira again, and never overwrite them. Jira stays an optional sync done by the PM.
- Design lives in `designs/<TICKET>/`; dev reads it from this repo.
- Role init skills are replaced by `/aisdlc:init`; role commit and push steps by `/aisdlc:push` (QA tests are never committed).

## Rules

- Documents are short and precise: terse bullets, no filler.
- Hand-offs and change requests are recorded only through `/aisdlc:handoff` and `/aisdlc:return`.
- Approvals (`approve`, `reject`) are asked of the person by the hook; never run them on your own initiative.
- Audit lines only through `aisdlc-state.js audit <TICKET> <event> '<json>'`; execution logs and `task.<role>.yaml` are hash-chained and sealed, so never edit them by hand.
- Never force-push; never commit secrets, env files or QA tests.
