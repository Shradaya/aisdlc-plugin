# aisdlc skills for Kiro

A guidance port of the aisdlc Claude Code plugins for use in **Kiro**. Kiro doesn't consume Claude Code plugins or marketplaces, so this directory provides the lifecycle as **Kiro skills** (workspace-level `.kiro/skills/`) backed by the same Node CLIs and the design preview app, which run unchanged.

## What ports and what doesn't

| Piece | In Kiro |
|---|---|
| Node CLIs (`aisdlc-state.js`, init, graph, validation, design-config) | Run unchanged via `node` |
| Design preview app (Vite) | Runs unchanged (`cd preview && npm run dev`) |
| Lifecycle procedures (skills) | Ported here as Kiro skills |
| State engine enforcement (legal transitions, approval gates) | **Kept** — the CLI still refuses illegal transitions, unapproved IMPLEMENTING, and unapproved COMMITTED |
| PreToolUse gate hook (hard blocks) | **Ported** — installed as a Kiro `PreToolUse` hook that blocks disallowed tool calls (exit-2), verified against Kiro's hook contract |
| `marketplace.json` / `/plugin` install | Not used; Kiro installs skills from `.kiro/skills/` and the gate hook from `.kiro/hooks/` |

The installer drops a `PreToolUse` gate hook into the workspace's `.kiro/hooks/` (dev gate for `--set dev`, design gate for `--set design`, both for `--set all`). It hard-blocks: source edits before spec approval (and after COMMITTED, and when the approved spec hash no longer matches), prototype edits before the design brief / unapproved-after-approval, wrong commit format or branch, force-push, history rewrite, and secret printing/extraction. Pass `--no-hooks` for guidance-only (scope b). The state CLI remains the backstop regardless.

The gate hook keys off Kiro's tool names (`fs_write`, `str_replace`, `fs_append`, `execute_pwsh`) and reads the plugin core via `AI_SDLC_PLUGIN_HOME`; the hook's command is written with the resolved absolute path to its policy script, so it does not depend on env-var expansion at hook-run time.

## Setup

1. Set `AI_SDLC_PLUGIN_HOME` to this repo's root (the folder containing `plugins/aisdlc-dev` and `plugins/aisdlc-design`), so the skills can find the CLIs:
   - Windows: `setx AI_SDLC_PLUGIN_HOME "C:\Users\<you>\.claude\plugin"` (opens in new shells)
   - macOS/Linux: `export AI_SDLC_PLUGIN_HOME=~/.claude/plugin` in your shell profile
2. Install the skills (and the gate hook) into the workspace where you'll run the lifecycle:
   ```
   node kiro/install-kiro-skills.js <target-workspace> --set dev      # developer workspace
   node kiro/install-kiro-skills.js <target-workspace> --set design   # designer workspace
   node kiro/install-kiro-skills.js <target-workspace> --set all      # both
   ```
   Add `--dry-run` to preview, `--force` to overwrite existing files, `--no-hooks` to install skills only (no enforced gate).
3. Reload Kiro so it picks up the new workspace skills (`.kiro/skills/`) and the gate hook (`.kiro/hooks/`).

## Skills

Design (`--set design`): `aisdlc-design-init`, `aisdlc-design-design`, `aisdlc-design-commit`.
Dev (`--set dev`): `aisdlc-dev-init`, `aisdlc-dev-feature`, `aisdlc-dev-bug`, `aisdlc-dev-investigate`, `aisdlc-dev-status`, `aisdlc-dev-resume`, `aisdlc-dev-add-repo`, `aisdlc-dev-pr-review`.
Shared: `aisdlc-lifecycle-reference` (conventions, state CLI, stage procedures, gate rules) — installed with every set; the entry skills defer to it.

These are **entry-point** skills (the lifecycle commands a person invokes). The detailed per-stage procedures (impact-analysis, feature-specification, testing, code-review, design-link, commit, pull-request, post-release, finish) are read on demand from the plugin's own SKILL files under `%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev\skills\<stage>\SKILL.md`, so they stay in one place.

## Updating

Edit the skills here, then re-run the installer with `--force` into each workspace. The skills reference the plugin CLIs by `AI_SDLC_PLUGIN_HOME`, so updates to the Node engine take effect without re-copying skills.
