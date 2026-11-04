# Comparison: `evoke-sdlc` vs this plugin

`evoke-sdlc` (at `/Users/leapfrog/Leapfrog/Projects/evoke-sdlc`) is Evoke's adoption of a separate, independent kit
called **ai-sdlc** (upstream `github.com/arjunbhandari3/ai-sdlc`), with Evoke's own `team/` layer on top (repo docs,
a PHI reviewer, Lambda test helpers, diagrams). It is not a fork of this plugin. It solves the same problem — Jira
ticket → spec → build → test → review → PR → promote — but as one unified `ship-ticket` skill with a single
resumable state file per ticket, rather than this plugin's multi-skill, state-machine-per-task-type design. It's
Python (stdlib only); this plugin is Node.

This file tracks which of its ideas are worth pulling into `aisdlc-plugin`, one per PR/branch. Status is updated as
each is done.

## Candidates

| # | Idea | Where in evoke-sdlc | Status |
|---|---|---|---|
| 1 | Scoped Atlassian API tokens (API gateway + cloud id, not just classic site-URL auth) | `scripts/jira.py:36,89-110` | done (PR pending) |
| 2 | Pre-ship merge-tree dry run per target branch, incl. static import-break detection | `scripts/check_targets.py` | not started |
| 3 | Single "ship list" as one approval unit covering every outward action for a ticket | `skills/ship-ticket/SKILL.md` (gates section) | not started |
| 4 | Promotion to multiple environment branches with per-env conflict isolation (`<ticket>-<env>` branch) | `skills/promote/SKILL.md` | not started |
| 5 | Post-release branch resync (back-merge `main` into every env branch, same conflict pattern) | `skills/team-sync-main/SKILL.md` | not started |
| 6 | Cross-repo trace agent, mandatory for a "touches 2+ repos / shared contract" ticket profile | `agents/service-tracer.md`, `skills/team-cross-service-change/SKILL.md` | not started |
| 7 | Data-sensitivity–driven security review (configurable `data.sensitivity`, checklist per sensitivity) | `agents/team-phi-reviewer.md`, `project.json: data.sensitivity` | not started |
| 8 | User-extensible "real systems" command confirmation list (reason shown before running) | `project.json: realSystems`, `hooks/guard_shell.py` | not started |
| 9 | Per-repo format/lint/test-on-save after every edit | `hooks/after_edit.py` | not started |
| 10 | Ticket dashboard (self-contained HTML, all tickets) and per-ticket status renderer | `scripts/tickets.py` | not started |
| 11 | Draft workspace-level config from repos already present (host/org/base/env branches, ticket pattern, commit style, lint/test commands) | `scripts/init_project.py` | not started |
| 12 | Version/changelog discipline enforced in CI for kit-behavior changes | `scripts/version_check.py`, `CHANGELOG.md` convention | not started |
| 13 | Gate approval via a tracker comment (`Approved: <gate>`), not just an in-session reply | `workflow.json` gates, `hooks/gates.py sync` | not started |

## Deliberately not pulling in

- The Python/stdlib-only architecture — would be a rewrite, not a feature.
- Evoke's `team/` layer (repo docs, PHI checklist specifics, Lambda test scripts) — Evoke-specific content.
- The single-skill `ship-ticket` orchestration model (one skill + state file vs. a state machine per task type) —
  a design-philosophy swap, not an incremental addition.

## Process

Each numbered idea gets its own branch off `aisdlc-plugin` and its own PR. Update the Status column here as each
moves from not started → in progress → done (PR #), in the same commit/PR that does the work.
