# aisdlc workspace

Control plane for the AI-SDLC (spec: `aisdlc.markdown`). Claude Code plugin `aisdlc`; commands are `/aisdlc-dev:<skill>`. This repo holds knowledge about code repositories, not their source.

Lifecycle: Understand, Analyze, Specify, Approve, Plan, Implement, Validate, Review, Commit, PR, CI, Merge, Release, Consolidate Product Knowledge, Clean Up Temporary Artifacts, Complete.

## Prerequisite
- Load `claude.env` values if available

## Navigation

- The plugin is installed from `~/.claude/plugin` (`${CLAUDE_PLUGIN_ROOT}`; the `aisdlc-plugin` branch of this repository, checked out as a worktree there; marketplace `aisdlc-marketplace`; see its README), not stored here: `skills/<name>/SKILL.md` procedures (commands in spec §51); `agents/` subagents; `workflows/` lifecycle references per task type. Run Claude Code from this workspace folder so the hooks and CLIs find it.
- `config/` workspace config: registry (`repositories.yaml`), `integrations.yaml`, `workspace.yaml`. Generic config (`task-types.yaml`, `policies.yaml`, `testing-policy.yaml`, `schemas/`) ships in the plugin at `${CLAUDE_PLUGIN_ROOT}/config/`; a same-named file in `config/` here overrides it. `repositories/<repo>/` repository knowledge. `system/` architecture, decisions and durable product knowledge (`system/product/`) and UI designs shared by a parent ticket's children (`system/designs/<PARENT>/`, `/aisdlc-dev:design-link`).
- `tasks/<ticket>/` task state and temporary artifacts. State CLI: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js`. Hooks in the plugin's `hooks/` enforce the gates.
- Cross-repo relationships: query the graph CLI, do not read `system/repository-relationships.yaml` whole. `node ${CLAUDE_PLUGIN_ROOT}/scripts/graph/aisdlc-graph.js <impact|neighbors> <repo> [--depth N] [--registered] [--min-status human-confirmed]`; `validate` after editing relationships or the registry. The YAML stays the source of truth (edit it, never generated output); read it directly only for an edge's full description or evidence.
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
