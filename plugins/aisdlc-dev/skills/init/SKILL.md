---
name: init
description: "Set up an aisdlc workspace in a folder - the .claude/ config, web/ docs site, config/, repositories/, system/, tasks/ and logs/ where the plugin stores everything. Use only when the developer runs /aisdlc-dev:init."
argument-hint: "[target-folder] [--only claude|web|workspace] [--dry-run] [--force]"
disable-model-invocation: true
---

# init

## Purpose
Turn a folder into the single aisdlc workspace the plugin uses to store its knowledge and state across all repositories: registry, repository knowledge, system and product docs, tasks, audit logs and the docs site. Templates ship in `${CLAUDE_PLUGIN_ROOT}/templates`.

## Invocation conditions
Explicit `/aisdlc-dev:init [target-folder] [--only claude|web|workspace] [--dry-run] [--force]`. `$ARGUMENTS` = those options. The target defaults to the current folder.

## Procedure
1. Run a preview: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-init.js $ARGUMENTS --dry-run`.
2. Show what would be created, merged and skipped. If `--force` would overwrite files, confirm with AskUserQuestion first.
3. Run the same command without `--dry-run`.
4. After the repositories are registered (or `AISDLC_REPOS_ROOT` is set), offer to draft settings from them: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-detect.js --root <target>` prints the detected provider, org, base and environment branches, ticket key pattern, commit style and lint/test commands. Show it; only after the developer agrees, re-run with `--write` (updates `git.base_branch`, `git.commit_format`, `git_hosting.provider` and `pr_target_branches`; comments and other keys are kept). Lint/test commands are shown, never written.
5. Report the result and the next steps: copy `claude.env.example` to `claude.env` and set `AISDLC_REPOS_ROOT` (paths only), run `cd web && npm install && npm run dev` (Node 20+) for the docs site, then `/aisdlc-dev:add-repo <name> <path>` for each repository.

## What it creates (parts)
- `claude`: `.claude/settings.json`, `.claude/rules/*.md`.
- `web`: `web/**`, the VitePress docs site (no `node_modules`).
- `workspace`: `config/{repositories,integrations,workspace}.yaml` (the registry starts empty), `repositories/`, `system/{architecture,product,decisions,designs}/`, `system/repository-relationships.yaml`, `tasks/`, `logs/`, `CLAUDE.md`, `claude.env.example`, `.gitignore`.

Once `config/repositories.yaml` exists the folder is an aisdlc workspace: hooks and CLIs resolve it from the folder itself, any subfolder, or `AISDLC_ROOT`. All plugin output (repository knowledge, system and product docs, task state, audit logs, web) is stored there, and the repositories it works on stay wherever they are cloned (registered by path through `claude.env`).

## Behavior
- Existing files are never overwritten unless `--force`.
- `.claude/settings.json` is merged additively (permission entries and enabled plugins added, nothing removed); `.gitignore` gets missing lines appended.
- `.claude/settings.local.json`, `claude.env` and `node_modules` are never created.

## Failure behavior
Missing target folder or templates: the script exits with the reason and changes nothing.

## Safety restrictions
Writes only the files listed above under `<target>`. Never writes secrets, never touches `tasks/*/task.yaml` of an existing workspace, never runs `npm install` itself.
