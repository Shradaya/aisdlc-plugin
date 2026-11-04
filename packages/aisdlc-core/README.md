# aisdlc-core

Canonical shared core for the aisdlc plugins. Holds the workspace/path resolution, the JSON-compatible YAML loader, the Jira REST client, and the task state engine that `aisdlc-dev`, `aisdlc-design` and `aisdlc-qa` depend on.

## Why it is vendored, not referenced

A Claude Code plugin installed from a hosted marketplace is copied into the plugin cache as its own self-contained subtree (the marketplace `source`). A sibling `packages/` directory outside the plugin root is **not** copied, and component paths may not escape the plugin root (`..` fails validation). So each plugin carries its own physical copy of the core under `plugins/<plugin>/scripts/{lib,state}/`.

This directory is the single source of truth. After editing anything here, run:

```bash
node scripts/sync-core.js
```

from the repo root to copy the core into every plugin. CI (and the gate suites) should run the sync and then `git diff --exit-code` to ensure the vendored copies are current.

## Contents

| File | Purpose |
|---|---|
| `lib/root.js` | Workspace resolution (`resolveRoot`), plugin-root resolution, `configPath` (workspace override of plugin default). |
| `lib/repo-paths.js` | Resolve each registered repository's real path on this machine from `claude.env`/env vars (paths only, never secrets). |
| `lib/yaml.js` | Load JSON-compatible YAML (strip full-line `#` comments, then `JSON.parse`). |
| `lib/jira.js` | Jira REST API client (no MCP server): config and credentials from `config/integrations.yaml` + environment, `fetchIssue` (normalized ticket incl. acceptance criteria), `checkConnection`, `transitionIssue` (exact configured name only), shared error type. |
| `state/aisdlc-state.js` | The task state engine: `init`/`get`/`transition`/`approve`/`reject`/`set`, O_EXCL lock, hash-pinned gates (`specification`, `design`), append-only audit log. |
