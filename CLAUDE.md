# aisdlc workspace

Control plane for the AI-SDLC (spec: `aisdlc.markdown`). Claude Code plugin `aisdlc`; commands are `/aisdlc:<skill>`. This repo holds knowledge about code repositories, not their source.

Lifecycle: Understand, Analyze, Specify, Approve, Plan, Implement, Validate, Review, Commit, PR, CI, Merge, Release, Consolidate Product Knowledge, Clean Up Temporary Artifacts, Complete.

## Prerequisite
- Load `claude.env` values if available

## Navigation

- `skills/<name>/SKILL.md` procedures (commands in spec §51); `agents/` subagents; `workflows/` lifecycle references per task type.
- `config/` registry (`repositories.yaml`), `task-types.yaml`, policies, schemas. `repositories/<repo>/` repository knowledge. `system/` architecture, decisions and durable product knowledge (`system/product/`) and UI designs shared by a parent ticket's children (`system/designs/<PARENT>/`, `/aisdlc:ui-design`).
- `tasks/<ticket>/` task state and temporary artifacts. State CLI: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js`. Hooks in `hooks/` enforce the gates.
- Detailed rules: `.claude/rules/{workspace,safety,git,task-gates}.md`.

## Invariants (never optional)

1. A task must have a ticket number.
2. A feature must have an approved specification before implementation.
3. The affected repository list must exist before source changes.
4. Managed repositories start from updated `main`.
5. The task branch equals the ticket number exactly.
6. Commits are `<ticket-number>: <changes summary>`; invalid messages are blocked.
7. Never guess missing critical ticket information; ask.
8. Repository knowledge identifies its source commit.
9. Investigation tasks stay read-only unless promoted.
10. Production writes are disabled by default.
11. Workflow state is persisted via the state CLI only; never edit `task.yaml` directly.
12. Workflow conflicts stop execution; do not guess through them.
13. Audit records never contain secrets.
14. A feature is not COMPLETED until released behavior is consolidated into `system/product/`.
15. Temporary feature artifacts are deleted only after validated consolidation and its commit, by the consolidation workflow.
