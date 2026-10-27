# aisdlc plugins

Two Claude Code plugins for the AI-SDLC lifecycle, published from one marketplace (`aisdlc-marketplace`):

- **aisdlc-dev** — the developer side: `/aisdlc-dev:<skill>` commands, subagents, workflows, and hooks that enforce the lifecycle gates (ticket required, approved specification before implementation, commit format, no secrets in audit records), from ticket through specification, implementation, review, commit, PR and release hand-off.
- **aisdlc-design** — the designer side: `/aisdlc-design:<skill>` commands and hooks for authoring UI/UX prototypes under a design ticket, previewing them in a local web app, and committing them to a design repository for developers to consume.

A designer installs only `aisdlc-design` and never sees the developer commands; a developer installs only `aisdlc-dev`. The two share a core (state engine, workspace/path resolution, config loaders) kept once in `packages/aisdlc-core/` and vendored into each plugin.

## Layout

| Path | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace manifest listing both plugins |
| `packages/aisdlc-core/` | Canonical shared core (vendored into each plugin by `scripts/sync-core.js`) |
| `scripts/sync-core.js` | Vendor the shared core into each plugin; `--check` for CI |
| `plugins/aisdlc-dev/` | Developer plugin: `skills/`, `agents/`, `hooks/`, `workflows/`, `scripts/`, `config/`, `templates/` |
| `plugins/aisdlc-design/` | Designer plugin: `skills/`, `agents/`, `hooks/`, `workflows/`, `scripts/`, `config/`, `templates/` (workspace + `preview/` app) |

Each plugin carries only the JS it needs; the vendored core under `plugins/<plugin>/scripts/{lib,state}/` is a copy of `packages/aisdlc-core/` (a hosted-marketplace install copies only the plugin's own subtree, so the core cannot be referenced across directories).

## Requirements

- Claude Code, and Node.js (hooks and CLIs run with `node`). The design preview app needs Node 20+.
- Developer: an aisdlc **dev** workspace — a folder with `config/repositories.yaml`, `tasks/`, `repositories/`, `system/`. Credentials as environment variables only (never in files): `JIRA_EMAIL`, `JIRA_API_TOKEN`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN`.
- Designer: an aisdlc **design** workspace — a folder with `config/repositories.yaml`, `designs/`, `design-system/`, `tasks/`, `preview/`. Optionally a Claude Design design system identifier in `claude.env` (`AISDLC_DESIGN_SYSTEM`, identifier only).

## Install

Add the marketplace once, then install the plugin for your role (choose user scope when asked):

```
/plugin marketplace add ~/.claude/plugin
/plugin install aisdlc-dev@aisdlc-marketplace       # developers
/plugin install aisdlc-design@aisdlc-marketplace    # designers
```

Restart Claude Code in your workspace so the hooks load.

- Developer: start Claude Code in the dev workspace. `/aisdlc-dev:init` scaffolds one if needed; `/aisdlc-dev:status` lists repositories and active tasks.
- Designer: start Claude Code in the design workspace. `/aisdlc-design:init` scaffolds one (including the `preview/` app).

Do not also start Claude Code with `--plugin-dir` for this folder; the plugin would load twice.

## The design → development handoff

1. Designer: `/aisdlc-design:design <DESIGN-TICKET>` authors a prototype under `designs/<DESIGN-TICKET>/` (HTML/CSS, or Claude Design then export), previews it by ticket number (`cd preview && npm install && npm run dev`), approves it, and `/aisdlc-design:commit <DESIGN-TICKET>` commits and pushes it to the design repository.
2. Developer: `/aisdlc-dev:add-repo <name> <path> --kind design` registers that design repository (read-only source).
3. Developer: during `/aisdlc-dev:feature <TICKET>` on a UI repository, the `design-link` step reads `designs/<DESIGN-TICKET>/` from the design repo, records a versioned hashed snapshot under `system/designs/<DESIGN-TICKET>/`, and pins it in the feature specification. Approving the specification covers the pinned design version.

## Update

After pulling or editing plugin files, refresh Claude Code's installed copies and restart:

```
/plugin marketplace update aisdlc-marketplace
```

If you edited `packages/aisdlc-core/`, run `node scripts/sync-core.js` first to re-vendor the core into both plugins (CI should run `node scripts/sync-core.js --check`).

## Checks

```bash
node plugins/aisdlc-dev/scripts/validation/test-gates.js
node plugins/aisdlc-dev/scripts/validation/test-repo-paths.js
node plugins/aisdlc-dev/scripts/validation/cred-check.js      # run from a dev workspace
node plugins/aisdlc-design/scripts/validation/test-gates-design.js
node scripts/sync-core.js --check
claude plugin validate .
```

### Bitbucket PR helper

`plugins/aisdlc-dev/scripts/git-hosting/bitbucket-pr.js` is the Bitbucket Cloud PR helper used by the `create-pr`, `pull-request` and `pr-review` skills. It reads `BITBUCKET_EMAIL` / `BITBUCKET_API_TOKEN` from the environment only (values are never printed), writes exactly one JSON line to stdout, and exits `0` on success, `1` on error, `2` when a credential is missing. Commands:

```
node .../bitbucket-pr.js status  <repo-path> <pr-id>
node .../bitbucket-pr.js comment <repo-path> <pr-id> <file|-> <line> <text-file>
node .../bitbucket-pr.js create  <repo-path> <source> <dest> <title> <description-file> [--draft]
```

Smoke test (no network, no credentials needed): with both credential variables unset it prints the missing-credentials JSON and exits `2`.

```bash
node plugins/aisdlc-dev/scripts/git-hosting/bitbucket-pr.js status x 1   # exit 2 when creds unset
```

Note: the helper tears down Node's global fetch connection before returning so the process exits promptly with the correct code on Windows; it deliberately avoids a hard `process.exit()` on the network paths, which trips a libuv assertion while the HTTP socket is closing.

## Uninstall

```
/plugin uninstall aisdlc-dev@aisdlc-marketplace
/plugin uninstall aisdlc-design@aisdlc-marketplace
/plugin marketplace remove aisdlc-marketplace
```
