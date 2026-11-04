# aisdlc plugins

Claude Code plugins for an AI-assisted software delivery lifecycle (AI-SDLC), one per role, published from one marketplace (`aisdlc-marketplace`):

| Plugin | For | What it does | Docs |
|---|---|---|---|
| **aisdlc-design** | UI/UX designers | Author a prototype under a design ticket, preview it, approve it, and commit it to a design repository | [plugins/aisdlc-design](plugins/aisdlc-design/README.md) |
| **aisdlc-dev** | Developers | Jira ticket → specification (approved) → implementation → review → commit → PR/CI → release → product knowledge | [plugins/aisdlc-dev](plugins/aisdlc-dev/README.md) |
| **aisdlc-qa** | QA engineers | Jira ticket → test scenarios (approved) → Playwright tests run in a browser the QA watches → defects on the ticket, wait for the fix → signed-off evidence on Jira → regression suite; plus quick checks without a ticket, with the proof kept locally | [plugins/aisdlc-qa](plugins/aisdlc-qa/README.md) |

Each role installs only its own plugin and sees only its own `/aisdlc-<role>:<skill>` commands.

All three plugins work the same way:
- Every piece of work hangs off a ticket.
- A task moves through a state machine whose state changes only through the state CLI.
- Human decisions are explicit approval gates, pinned to the hash of what was approved. Editing the approved file means approving it again.
- Hooks block what the gates don't allow: early edits, wrong commit formats, force-push, printing secrets, testing against production.
- Credentials are environment variables only, never files.

## How the roles connect

```
Designer (aisdlc-design)          Developer (aisdlc-dev)                  QA (aisdlc-qa)
design ticket ─► prototype ─►     feature ticket ─► spec pins the     ─►  same ticket ─► scenarios approved
approved, committed to the        design ─► implement ─► PR to             ─► tests run ─► defect comment on
design repository                 lf-develop / lf-qa / lf-uat              Jira ◄──────── developer fixes,
                                                                           re-verified ─► sign-off ─► evidence
                                                                           on Jira, tests into regression suite
```

1. **Design → development.**
   - The designer runs `/aisdlc-design:design <DESIGN-TICKET>` and `/aisdlc-design:commit`, then pushes the design repository.
   - The developer registers that repository with `/aisdlc-dev:add-repo <name> <path> --kind design`.
   - During `/aisdlc-dev:feature`, the `design-link` step pins a hashed snapshot of the design into the specification.
2. **Development → QA.**
   - Once the change is deployed to a QA environment, the QA engineer runs `/aisdlc-qa:test <TICKET>`.
   - App defects go back to the developer as comments on the Jira ticket, and the QA task waits for the fix.
   - When the developer says the fix is deployed, the QA runs `/aisdlc-qa:run <TICKET>` to re-verify.

## Install

Add the marketplace once per machine:

```
/plugin marketplace add ~/.claude/plugin
```

Then install your role's plugin, either for all your projects or for one workspace only:

```
/plugin install aisdlc-<role>@aisdlc-marketplace                           # user scope: every project
claude plugin install aisdlc-<role>@aisdlc-marketplace --scope project     # this workspace, shared through .claude/settings.json
claude plugin install aisdlc-<role>@aisdlc-marketplace --scope local       # this workspace, only you
```

`<role>` is `dev`, `design` or `qa`. Run the `--scope project` and `--scope local` forms from inside the workspace folder. Afterwards, restart Claude Code in the workspace so the hooks load. Then run `/aisdlc-<role>:init` to scaffold a workspace; each plugin's README describes its setup.

Don't also start Claude Code with `--plugin-dir` pointing at this folder, or the plugin loads twice.

**Workspaces.**
- Each plugin works in its own folder. A folder is a workspace when it contains `config/repositories.yaml`; the hooks and CLIs find it from the folder, any subfolder, or `AISDLC_ROOT`.
- A workspace can declare its kind in `config/workspace.yaml` (`"kind": "dev" | "design" | "qa"`). A plugin's hooks stay out of a workspace of another kind, so having several plugins installed on one machine is safe.
- QA workspaces declare their kind. Workspaces without a kind behave as before.

## Requirements

- Claude Code and Node.js: the hooks and CLIs run with `node`. The design preview app and the QA workspace need Node 20+.
- Credentials, as environment variables only:

| Variable | Used by | For |
|---|---|---|
| `JIRA_EMAIL`, `JIRA_API_TOKEN` | dev, qa | Read tickets. QA also posts defect and results comments and uploads evidence, when switched on. |
| `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN` | dev | Pull requests |
| `QA_USERNAME`, `QA_PASSWORD` | qa | Test account for signing in to the QA environment. May instead go in the QA workspace's `.env`, which is gitignored and which Claude can't read. |

Set them in PowerShell before starting Claude Code (`$env:JIRA_API_TOKEN = "..."`), or as user environment variables. Claude only checks whether they are set, and a hook blocks printing them. Jira writes are off by default in each workspace's `config/integrations.yaml`.

## Repository layout

| Path | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace manifest listing the three plugins |
| `plugins/aisdlc-dev/` | Developer plugin |
| `plugins/aisdlc-design/` | Designer plugin, including the `preview/` app template |
| `plugins/aisdlc-qa/` | QA plugin, including the Playwright workspace template, test runner and Jira helper |
| `packages/aisdlc-core/` | Shared core: state engine, workspace and path resolution, config loaders. The source of truth, vendored into each plugin. |
| `scripts/sync-core.js` | Copies the shared core into each plugin; `--check` for CI |
| `kiro/` | Port of the dev and design lifecycles as Kiro skills and hooks ([kiro/README.md](kiro/README.md)). QA is not ported yet. |

Each plugin has the same internal layout:
- `.claude-plugin/plugin.json`: manifest.
- `skills/<name>/SKILL.md`: commands and stages.
- `agents/`: subagents.
- `hooks/`: `hooks.json` plus the session-start, pre-tool-policy and audit scripts.
- `workflows/`: lifecycle contracts.
- `config/`: the lifecycle (`task-types.yaml`) and policies. A same-named file in a workspace's `config/` overrides it.
- `scripts/`: CLIs. `scripts/{lib,state}/` is the vendored core.
- `templates/`: what `init` scaffolds.

A hosted-marketplace install copies only a plugin's own folder, which is why the core is vendored rather than shared.

**Config-driven gates.** The state engine has built-in gates: `specification` and `plan` for dev, `design` for design. A lifecycle can also declare its own in `task-types.yaml`. QA uses this for its `scenarios` and `signoff` gates.
- `gates`: each gate's artifact, which is hash-pinned on approval.
- `requires_approval`: which states need which gates, with an unchanged artifact.
- `requires_no_open`: refuse a state while, for example, a defect is still open.

## Maintenance

After pulling or editing plugin files, refresh the installed copies, then restart Claude Code:

```
/plugin marketplace update aisdlc-marketplace
```

- Edit the shared core only in `packages/aisdlc-core/`, then run `node scripts/sync-core.js` to copy it into every plugin.
- In a QA workspace, after upgrading Playwright, run `/aisdlc-qa:init --only agents` to regenerate Playwright's agents.

Checks (no network or model needed):

```bash
node plugins/aisdlc-dev/scripts/validation/test-gates.js
node plugins/aisdlc-dev/scripts/validation/test-repo-paths.js
node plugins/aisdlc-dev/scripts/validation/test-init-detect.js
node plugins/aisdlc-dev/scripts/validation/test-jira-client.js    # Jira request routing (classic vs scoped tokens), mock server
node plugins/aisdlc-dev/scripts/validation/cred-check.js        # run from a dev workspace
node plugins/aisdlc-design/scripts/validation/test-gates-design.js
node plugins/aisdlc-qa/scripts/validation/test-gates-qa.js
node plugins/aisdlc-dev/scripts/validation/test-check-targets.js   # merge dry run, real git repos
node plugins/aisdlc-dev/scripts/validation/test-on-edit.js          # checks after every edit (on_edit), and the guard on changing them
node plugins/aisdlc-dev/scripts/validation/test-real-systems.js    # commands that ask first (config/workspace.yaml real_systems)
node scripts/sync-core.js --check
claude plugin validate .
```

The integration helpers share a contract:
- Credentials come from the environment only.
- They print one JSON line.
- Exit codes are `0` ok, `1` error, `2` credentials missing.
- They shut down cleanly on Windows.

The helpers are the Bitbucket PR helper `plugins/aisdlc-dev/scripts/git-hosting/bitbucket-pr.js`, the read-only merge dry run `plugins/aisdlc-dev/scripts/git-hosting/check-targets.js` (JSON output, exit 0 whatever the merge result, exit 1 for a usage or git error) and the Jira helpers `plugins/aisdlc-dev/scripts/jira/jira-fetch.js` (read-only) and `plugins/aisdlc-qa/scripts/jira/jira-attach.js` (reads, comments, uploads, transitions). Both Jira helpers use the shared REST client `packages/aisdlc-core/lib/jira.js`, so no Jira MCP server is needed. Each is documented in its plugin's README.

## Uninstall

```
/plugin uninstall aisdlc-dev@aisdlc-marketplace
/plugin uninstall aisdlc-design@aisdlc-marketplace
/plugin uninstall aisdlc-qa@aisdlc-marketplace
/plugin marketplace remove aisdlc-marketplace
```

Add `--scope project` or `--scope local` to uninstall a copy installed in that scope.
