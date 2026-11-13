---
name: aisdlc-lifecycle-reference
description: Shared reference for the aisdlc lifecycle in Kiro - conventions, the state CLI, stage procedures (impact analysis, specification, testing, review, design-link), and the gate rules the entry skills rely on. Read this when running any aisdlc-dev or aisdlc-design workflow; not invoked directly by the user.
---

# aisdlc lifecycle reference (Kiro)

This is the shared reference for the aisdlc lifecycle skills ported to Kiro. The entry-point skills (`aisdlc-dev-feature`, `aisdlc-dev-bug`, `aisdlc-design-design`, etc.) orchestrate the lifecycle and defer to the procedures here.

## How this differs from the Claude Code plugin

In Claude Code these ran as plugins with **enforcing hooks** that hard-blocked disallowed actions. In Kiro they are **guidance skills**: there are no PreToolUse/PostToolUse gates. You must therefore follow the gate rules below by discipline. The one piece of enforcement that still holds is the **state engine** (`aisdlc-state.js`): it refuses illegal state transitions, refuses `IMPLEMENTING` without an approved specification, and refuses `COMMITTED` without an approved design. Lean on it as the backstop and never edit `task.yaml` by hand.

## Setup (once per machine)

The skills call the plugin's Node CLIs through the `AI_SDLC_PLUGIN_HOME` environment variable, which must point at the plugin repo root (the folder containing `plugins/aisdlc-dev` and `plugins/aisdlc-design`). Example (Windows): `setx AI_SDLC_PLUGIN_HOME "C:\Users\<you>\.claude\plugin"`. Verify with `echo %AI_SDLC_PLUGIN_HOME%` in a new shell.

Throughout these skills, CLI paths are written as `%AI_SDLC_PLUGIN_HOME%\plugins\<plugin>\scripts\...` (Windows). On macOS/Linux use `$AI_SDLC_PLUGIN_HOME/plugins/<plugin>/scripts/...`.

## State CLI

All task state changes go through the state engine. For dev tasks it lives at `%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev\scripts\state\aisdlc-state.js`; for design tasks at `%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-design\scripts\state\aisdlc-state.js`. Both share the same commands:

- `init <ticket> <type> [repo,repo]` — create a task.
- `get <ticket>` — print the task record (JSON).
- `next <ticket>` — print the suggested next step.
- `transition <ticket> <STATE> [--reason "..."]` — move to a state (refused if illegal).
- `approve <ticket> specification|plan|design` / `reject <ticket> <gate> <reason>` — record a human decision (hash-pinned for specification and design).
- `set <ticket> <dotted.path> <json>` — set a non-status field (status/approvals cannot be set this way).

Never write `tasks/<ticket>/task.yaml` by hand; only the CLI mutates it. Append audit lines to `tasks/<ticket>/execution-log.jsonl` as stages complete.

Run the CLI from inside the workspace, or set `AISDLC_ROOT` to the workspace folder for a single command.

## Gate rules (follow by discipline; the state CLI enforces the starred ones)

- * **Feature source edits** are only appropriate from `SPEC_APPROVED` to `COMMITTED`, and only while the approved specification hash still matches. Editing the spec after approval requires re-approval (`approve <ticket> specification` again).
- * **Implementation** (`transition <ticket> IMPLEMENTING`) requires an approved specification (bugs excepted). The CLI refuses otherwise.
- **Commits** must read `<ticket>: <summary>` (one line, no body) on branch `<ticket>`. Never commit on `main`. Never force-push or rewrite history.
- **Plan approval** is required for cross-repository, database, API, security-sensitive or high-risk changes before implementing; the workflow enforces this, not the CLI.
- **Design prototypes** are authored during drafting; * once a design is approved, `COMMITTED` is refused until the design is (re)approved, and a changed `design.md` requires re-approval.
- No secrets or real patient data in any artifact, snapshot, log, or task state — reference credentials by variable name only.
- Reviewers and black-box test authors see only the requirement, code, and tests — never the implementer's explanation.

## Stage procedures (feature / bug lifecycles)

The full stage procedures live in the plugin's own SKILL files under `%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev\skills\<stage>\SKILL.md`. When an entry skill reaches a stage, read that file and follow it. Key stages:

- **jira-ticket** — retrieve the ticket (Jira REST helper `scripts/jira/jira-fetch.js` if configured, else ask the developer; never guess). Writes `jira.md`, snapshots the hash.
- **impact-analysis** — identify domains and candidate repositories; write `impact-analysis.md`; confirm affected repositories with the developer.
- **repository-preparation** — stash, update `main`, create branch `<ticket>` per affected repository.
- **feature-specification** — the mandatory specification (29-section template) and the human approval checkpoint; hard gate before implementation.
- **design-link** (UI features) — read the authored design for `<DESIGN-TICKET>` from a registered design repository (`kind: design`), snapshot and hash it under `system/designs/<DESIGN-TICKET>/`, and pin it into the specification.
- **testing** — black-box tests written from the approved spec by the test author, then run; evidence to `validation.md`.
- **code-review** — independent review against spec, plan, and diff; security review where applicable.
- **commit / create-pr / post-release / finish** — commit on the ticket branch, open the PR, then release hand-off and knowledge consolidation.

Read the corresponding plugin SKILL.md for the authoritative detail of each stage rather than reproducing it here.
