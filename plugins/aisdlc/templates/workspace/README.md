# aisdlc workspace

One shared repository for every role: PM, design, dev and QA. Created with `/aisdlc:init`.

- `tasks/<TICKET>/`: requirements, acceptance criteria, specification, plan, scenarios, results, per-role state and hand-offs.
- `designs/<TICKET>/`: the design pages for a ticket.
- `system/`, `repositories/`: durable knowledge about the code repositories registered in `config/repositories.yaml`.
- `web/`: read-only docs site for that knowledge (`cd web && npm install && npm run dev`, Node 20+).
- Local only, never committed: `.aisdlc/role`, `claude.env`, `.env`, QA tests and Playwright files.

## Start

1. Clone this repository, open Claude Code in it, run `/aisdlc:init --role <pm|design|dev|qa>`, then restart Claude Code.
2. `cp claude.env.example claude.env` and set `AISDLC_REPOS_ROOT` (dev).
3. `/aisdlc:pull`, then `/aisdlc:status-page`.

Hand off and return work with `/aisdlc:handoff` and `/aisdlc:return`; share with `/aisdlc:push`. See `CLAUDE.md` for the rules.
