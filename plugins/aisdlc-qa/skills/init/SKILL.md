---
name: init
description: Set up an aisdlc QA workspace in a folder - the workspace itself (config/, tasks/, logs/, CLAUDE.md) and the Playwright test repository in the same folder (package.json, playwright.config.ts, tests/, fixtures/; one tests/<TICKET>/ folder and one committed tasks/<TICKET>/spec.md per ticket) - then, with the QA's consent, install Playwright and generate Playwright's planner/generator/healer agents. Use only when the QA engineer runs /aisdlc-qa:init.
argument-hint: [target-folder] [--only workspace|agents] [--from-dev [dev-workspace]] [--migrate-jira [--remove-mcp]] [--dry-run] [--force]
disable-model-invocation: true
---

# init

## Purpose
Turn a folder into an aisdlc **QA** workspace: the folder where a QA engineer turns Jira tickets into approved scenarios, watches the generated Playwright tests run, and commits them as the regression suite. Templates ship in `${CLAUDE_PLUGIN_ROOT}/templates`.

## Invocation conditions
Explicit `/aisdlc-qa:init [target-folder] [--only workspace|agents] [--dry-run] [--force]`. The target defaults to the current folder. `--only agents` skips the scaffold and only (re)generates the Playwright agents, which is needed after every Playwright upgrade.

## Procedure
1. Unless `--only agents`: preview with `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-qa-init.js $ARGUMENTS --dry-run`. Show what would be created, merged and skipped. If `--force` would overwrite files, confirm with AskUserQuestion first. Then run the same command without `--dry-run`.
   - Existing workspace still on the Jira MCP adapter (the script prints a `Jira:` line, or the session-start hook reported it):
     - Preview `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-qa-init.js <target> --migrate-jira --dry-run`. Show the `changes`, `warnings` and `ca_certificate`, confirm, then run it without `--dry-run`. It switches the adapter to `rest-api` and adds only missing Jira settings (`auth_scheme`, `acceptance_criteria_field`, the `write:issue:jira` scope note). It never changes values already set and never touches credentials.
     - Check with `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-attach.js check`. On a certificate error, set `NODE_EXTRA_CA_CERTS` to the reported `ca_certificate` path.
     - Only after the check passes, offer `... --migrate-jira --remove-mcp` (preview first). It removes only the Jira server from `.mcp.json`, after backing up the file to `.mcp.json.aisdlc-jira-backup`. `playwright-test` and any other server stay. Restart Claude Code afterwards.
2. Environments: add the first environment the way `${CLAUDE_PLUGIN_ROOT}/skills/add-env/SKILL.md` does (name, base URL, login method, synthetic data confirmed; `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/add-env.js <name> --base-url <url> --login <mode> ... --default --force`, since the template already has a placeholder `qa` entry).
   - Login form: ask for the **visible label text** of the username and password fields and the **text on the sign-in button** (for example `Email Address`, `Password`, `Sign In`). If the QA answers with IDs or selectors instead (`id=email`, `type=submit`), accept them as `--username-selector "#email"` / `--password-selector` / `--submit-selector "button[type=submit]"`; never store generated class names (MUI `css-…`, `Mui…-root`), which change between builds.
   - Production hosts: ask for them and add each with `--block-host`. `add-env.js` refuses an entry that would also block a configured environment; when production is the bare domain and QA a subdomain (`emc-portal.com` / `qa.emc-portal.com`), explain that a plain entry covers subdomains and use the exact form `--block-host "=emc-portal.com"`. Never write a config that refuses the default environment.
   - More environments later: `/aisdlc-qa:add-env`. Never write credentials anywhere.
   - Optional, Jira from aisdlc-dev: if the QA has an aisdlc-dev workspace (or asks to "pull the settings from aisdlc-dev"), run `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-qa-init.js <target> --from-dev [<dev-workspace>] --dry-run`. It finds a dev workspace next to or above the target (or uses the one named), and plans to copy its Jira connection settings (`jira.base_url`, `auth_scheme`, `acceptance_criteria_field`, credential variable names) into ours where ours are unset. No MCP server is copied: Jira is reached over REST. If the dev workspace still has an old `atlassian` MCP entry with a corporate CA mount, it reports that certificate as `ca_certificate`: tell the QA to set `NODE_EXTRA_CA_CERTS` to it. Show the plan, confirm, run it without `--dry-run`. It never reads or copies `claude.env` or `.env`; it reports only whether `JIRA_EMAIL` / `JIRA_API_TOKEN` are set.
3. Git: if the folder is not a git repository, offer `git init -b main` and a first commit of the scaffold (`git add -A` then `git commit -m "Set up QA workspace"`; the first commit of a new repository is the only commit allowed without a ticket).
4. Install (ask first, AskUserQuestion: `Install now (Recommended)` / `I will do it later`; it downloads npm packages and a Chromium build of about 150 MB). In the target folder:
   - `npm install`
   - `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/pw.js install chromium`
   - Playwright agents: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-qa-init.js <target> --mcp-backup`, then `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/pw.js init-agents --loop=claude`, then `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-qa-init.js <target> --mcp-merge` (init-agents rewrites `.mcp.json`; the merge puts any servers that were there back next to `playwright-test`). Check that `.claude/agents/playwright-test-{planner,generator,healer}.md` exist.
   - Playwright is always run through `pw.js` (or `run-tests.js` / `run-check.js`), which drop `NO_COLOR` so Windows PowerShell 5.1 does not turn a colour warning into a failure. Judge each step by its exit code, not by stderr.
5. Older workspace (it has `specs/<TICKET>.md` or tests in `tests/<feature-area>/`): offer to move it to the per-ticket layout with `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-qa-init.js <workspace> --migrate-layout [--dry-run] [--force]`. Show the `--dry-run` result first: it moves each `specs/<T>.md` to `tasks/<T>/spec.md` (never overwriting one without `--force`), and each test that names exactly one ticket to `tests/<T>/` (rewriting its `// spec:` header). A helper moves only with all its importers. It lists everything it leaves (several tickets, no ticket, nested folders, shared helpers), never moves `auth.setup.ts` or `seed.spec.ts`, never touches the git index, and appends the `tasks/*/spec.md` `.gitignore` exception. The QA reviews and commits the move.
6. First login: if the environment uses a login form, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/pw.js test --project setup --reporter line` once the credentials are set. When it passes without a `success_url`, it prints the path the app landed on: offer to set it (`add-env.js <name> --success-url "**/<path>" --force`).
7. Report the result and the next steps:
   - Credentials: `QA_USERNAME` / `QA_PASSWORD` as environment variables, or in `.env` in the workspace (gitignored; Claude has no access, the hook and `.claude/settings.json` deny it); never `claude.env` or any other file. `JIRA_EMAIL` / `JIRA_API_TOKEN` as environment variables only (`jira-attach.js` reads them from the environment). `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/cred-check.js` shows set/missing.
   - Jira (unless step 2 reused the dev settings): set `jira.base_url` in `config/integrations.yaml`. Jira is reached over its REST API by `scripts/jira/jira-attach.js`, so no Jira MCP server is needed; `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-attach.js check` confirms the connection. Behind a TLS-inspecting proxy, set `NODE_EXTRA_CA_CERTS` to the corporate root certificate (Cloudflare WARP: `C:/ProgramData/Cloudflare/installed_cert.pem`; Zscaler: your exported root CA). Turn on `jira.write.add_comment` / `add_attachment` when the token has the write scopes, and set `jira.write.status_transitions` only to exact transition names.
   - Restart Claude Code in this folder so the hooks, the Playwright MCP server and the Playwright agents load; approve the project MCP server when asked.
   - Then `/aisdlc-qa:test <TICKET>`, or `/aisdlc-qa:check "<what to check>"` for a quick check without a ticket.

## What it creates
- Workspace: `config/{workspace,repositories,environments,integrations}.yaml`, `tasks/`, `logs/`, `CLAUDE.md`, `claude.env.example`, `.gitignore`.
- Test repository: `package.json` (pinned `@playwright/test`), `playwright.config.ts`, `fixtures/{env,qa}.ts`, `tests/{auth.setup,seed.spec}.ts`. Each ticket later adds `tests/<TICKET>/` (its tests and optional `helpers.ts`) and `tasks/<TICKET>/spec.md` (its approved scenarios, the only committed file of `tasks/<TICKET>/`, via the `.gitignore` exception).
- After install: `node_modules/`, `.claude/agents/playwright-test-*.md`, `.mcp.json` with `playwright-test`.

## Behavior
- Existing files are never overwritten unless `--force`; `.gitignore` gets missing lines appended; nothing is removed.
- `claude.env`, `.mcp.json` and `node_modules` are never created by the scaffold itself.

## Failure behavior
Missing target folder or templates: the script exits with the reason and changes nothing. A failed `npm install` or browser download: show the error (often a proxy or certificate issue) and stop; nothing else depends on it until tests run.

## Safety restrictions
Writes only the files listed above under `<target>`. Never writes secrets. Installs nothing without the QA's consent.
