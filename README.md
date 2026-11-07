# aisdlc plugins

Claude Code plugins for an AI-assisted software delivery lifecycle (AI-SDLC), published from one marketplace (`aisdlc-marketplace`). Every role works in **one shared git repository**; the `aisdlc` plugin owns init, push, pull, hand-off between roles and a status page, and one plugin per role (PM, design, dev, QA) does that role's work:

| Plugin | For | What it does | Docs |
|---|---|---|---|
| **aisdlc** | Everyone | The shared repository: `init`, `push`, `pull`, `handoff`, `return` and a status page showing every ticket's flow from PM to QA | [plugins/aisdlc](plugins/aisdlc/README.md) |
| **aisdlc-pm** | Project managers | Jira ticket → requirements and acceptance criteria (approved by a human) → written into the Jira ticket as the source of truth → hand-off to design or development | [plugins/aisdlc-pm](plugins/aisdlc-pm/README.md) |
| **aisdlc-design** | UI/UX designers | Sync a Claude Design prototype to a git design repository, no ticket needed | [plugins/aisdlc-design](plugins/aisdlc-design/README.md) |
| **aisdlc-dev** | Developers | Jira ticket → specification (approved) → implementation → review → commit → PR/CI → release → product knowledge | [plugins/aisdlc-dev](plugins/aisdlc-dev/README.md) |
| **aisdlc-qa** | QA engineers | Jira ticket → test scenarios (approved) → Playwright tests run in a browser the QA watches → defects on the ticket, wait for the fix → signed-off evidence on Jira → regression suite; plus quick checks without a ticket, with the proof kept locally | [plugins/aisdlc-qa](plugins/aisdlc-qa/README.md) |

Everyone installs `aisdlc` plus their own role's plugin, and sees only those `/aisdlc:<skill>` and `/aisdlc-<role>:<skill>` commands.

All the plugins work the same way:
- Every piece of work hangs off a ticket.
- A task moves through a state machine whose state changes only through the state CLI.
- Human decisions are explicit approval gates, pinned to the hash of what was approved. Editing the approved file means approving it again.
- Hooks block what the gates don't allow: early edits, wrong commit formats, force-push, printing secrets, testing against production.
- Credentials are environment variables only, never files.
- Every generated document (requirements, acceptance criteria, design, specification, impact analysis, plan, scenarios, results) is kept short and precise: terse bullets and tables, no filler.

## How the roles connect

```
--PM                      --Design                 --Dev                      --QA
Requirement gathering     Created                  Understand                 Scenarios
 |                         |                        |                          |
Acceptance criteria       Hand off                 Specification              Tests
 |                                                   |                          |
Hand off ───────────────► ───────────────────────►  Plan                       Results
                                                     |                          |
                                                    Implement                  Sign-off
                                                     |
                                                    Pull request
                                                     |
                                                    Merged ── hand off ──────► (QA)
```

Hand-offs can also go back: any role can return a ticket to an earlier role with a reason, and it is tracked until the receiver resolves it. The status page (`/aisdlc:status-page`) shows each role as waiting, active, done, changes requested or not needed.

1. **Set up once.** `/aisdlc:init` in the shared repository (it records your role), your role's plugin, `/aisdlc:pull` to get the latest. Every `/aisdlc:push` starts with a pull; a merge conflict is left for you to resolve. QA also runs `/aisdlc-qa:init` once for its local test scaffold.
2. **PM → Design and Dev.** The PM drafts `/aisdlc-pm:requirements` and `/aisdlc-pm:acceptance-criteria`, approves the criteria, then `/aisdlc:push` and `/aisdlc:handoff <TICKET> dev` (and `design` for UI tickets). Writing them into Jira with `/aisdlc-pm:jira-sync` stays optional.
3. **Design.** The designer runs `/aisdlc-design:sync <artifact> --ticket <TICKET>` (see the [design plugin README](plugins/aisdlc-design/README.md#design-flow)), then `/aisdlc:push` and `/aisdlc:handoff <TICKET> dev`. The design lives in `designs/<TICKET>/` of the same repository.
4. **Development.** After `/aisdlc:pull`, the developer works from `tasks/<TICKET>/requirements.md` and `acceptance-criteria.md` and the design: `/aisdlc-dev:feature <TICKET>` reads them instead of Jira, and the `design-link` step pins a hashed snapshot of the design into the specification. Code and pull requests stay in the application repositories registered in `config/repositories.yaml`.
5. **QA.** After the change is merged and deployed to a QA environment, the QA engineer runs `/aisdlc-qa:test <TICKET>`; scenarios come from the PM's acceptance criteria. Tests stay local and are never committed; the scenarios, results and state are shared with `/aisdlc:push`. Defects go back with `/aisdlc:return <TICKET> dev <defect>` (and as comments on the Jira ticket when switched on); when the fix is deployed the QA re-verifies with `/aisdlc-qa:run <TICKET>` and hands off.
6. **Review loop.** After a PR is open, the developer runs `/aisdlc-dev:pr-comments <TICKET>`: it reads the reviewers' comments, triages them with the developer, fixes the valid ones under the normal rules, asks before committing and pushing, then replies.
7. **Changes requested.** `/aisdlc:return <TICKET> <role> <reason>` adds an open item to `tasks/<TICKET>/changes.md` (a local view generated from the shared hand-off events). The receiver sees it after `/aisdlc:pull`, fixes it with their role's usual commands, and resolves it with their next `/aisdlc:handoff`.

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

Install `aisdlc` and your role's plugin; `<role>` is `dev`, `design`, `qa` or `pm`, and `aisdlc-<role>` can be replaced by `aisdlc` for the shared plugin. Run the `--scope project` and `--scope local` forms from inside the workspace folder. Afterwards, restart Claude Code in the workspace so the hooks load. Then run `/aisdlc-<role>:init` to scaffold a workspace; each plugin's README describes its setup.

Don't also start Claude Code with `--plugin-dir` pointing at this folder, or the plugin loads twice.

### Claude Desktop and Claude on the web

These plugins need Claude Code (hooks, the `node` CLIs and a workspace folder), so use the **Code** tab in Claude Desktop or claude.ai/code. Plain chat does not run hooks, so it can't enforce the approval gates.

- **Package.** `node scripts/package-plugins.js` writes `dist/<plugin>-<version>.zip` for each plugin (git-tracked files only, plugin contents at the zip root). Hand the zip to teammates or an org admin to upload.
- **Desktop, Code tab.** It runs the same Claude Code, so the install above applies unchanged: open your workspace folder, add the marketplace or install the plugin, then run `/aisdlc-<role>:init`.
- **Web (cloud sessions).** The session runs in a cloud sandbox and sees only the repository it was started on. Commit a `.claude/settings.json` to the workspace repository that registers the marketplace and enables your role's plugin, and set the credentials from the table above as environment variables or secrets of the cloud environment. Node 20+ is needed for the hooks.
- **Limits on the web.** There is no local machine: QA's visible Playwright browser and repository paths on your PC are not available. Jira/Bitbucket work and spec, plan and scenario drafting do work.

**Workspaces.**
- All roles work in one shared repository, created by `/aisdlc:init` and marked `"kind": "aisdlc"` in `config/workspace.yaml`. Each role plugin then keeps its own state in `tasks/<TICKET>/task.<role>.yaml`, and the aisdlc hook owns commits at the repository root. Single-role workspaces created by the role plugins still work as before (`/aisdlc:init --adopt --role <role>` converts one).
- A workspace declares its kind in `config/workspace.yaml` (`"kind": "aisdlc" | "dev" | "design" | "qa" | "pm"`). A role plugin's hooks stay out of a workspace of another role's kind and work in an `aisdlc` one, so having several plugins installed on one machine is safe.
- Workspaces without a kind behave as before.

## Requirements

- Claude Code and Node.js: the hooks and CLIs run with `node`. The QA workspace needs Node 20+.
- Credentials, as environment variables only:

| Variable | Used by | For |
|---|---|---|
| `JIRA_EMAIL`, `JIRA_API_TOKEN` | dev, qa | Read tickets. QA also posts defect and results comments and uploads evidence, when switched on. |
| `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN` | dev | Pull requests |
| `QA_USERNAME`, `QA_PASSWORD` | qa | Test account for signing in to the QA environment. May instead go in the QA workspace's `.env`, which is gitignored and which Claude can't read. |

Set them in PowerShell before starting Claude Code (`$env:JIRA_API_TOKEN = "..."`), or as user environment variables. Claude only checks whether they are set, and a hook blocks printing them. Jira writes are off by default in each workspace's `config/integrations.yaml`.

### Approvals and tamper evidence

Approvals are asked of you by the hooks and recorded under `git config user.email`; audit logs are hash-chained and task state files sealed, so a hand edit is detected (engine, hooks and the status page). See the [aisdlc README](plugins/aisdlc/README.md#approvals-and-tamper-evidence); set `AISDLC_LOG_KEY` for keyed signatures.

### Token scopes

Create the tokens with only the scopes each role needs. Classic (unscoped) Atlassian tokens also work; the scopes below apply to tokens created with scopes. Anything marked *optional* is off by default and needed only after you switch the matching write in the workspace's `config/integrations.yaml`.

**Jira** (`JIRA_API_TOKEN`)

| Scope | dev | qa | pm | design | Used for |
|---|:-:|:-:|:-:|:-:|---|
| `read:issue:jira` | yes | yes | yes | n/a | Fetch the ticket and its basic fields |
| `read:issue-details:jira` | yes | yes | yes | n/a | Description, labels, priority, linked issues |
| `read:field:jira` | yes | yes | yes | n/a | Find the custom field holding acceptance criteria |
| `read:comment:jira` | yes | yes | n/a | n/a | Comments (dev: only when the workflow asks; qa: developer replies while a defect waits) |
| `read:project:jira` | yes | n/a | n/a | n/a | Resolve the project a ticket belongs to |
| `read:jira-user` | yes | yes | yes | n/a | Connection check (`/myself`) and assignee names |
| `write:comment:jira` | n/a | optional | n/a | n/a | qa: defect and results comments |
| `write:attachment:jira` | n/a | optional | n/a | n/a | qa: screenshots and reports |
| `write:issue:jira` | n/a | optional | optional | n/a | pm: write the managed block into the description. qa: status transitions |

The design plugin needs no Jira token: `/aisdlc-design:sync` does not use Jira.

**Bitbucket** (`BITBUCKET_API_TOKEN`, dev only)

| Scope | Used for |
|---|---|
| `read:repository:bitbucket` | Read repository content and pull request diffs |
| `read:pullrequest:bitbucket` | Read pull request details, status and review comments (`/aisdlc-dev:pr-comments`) |
| `write:pullrequest:bitbucket` | Create pull requests; post PR comments and replies (on by default, set `git_hosting.write.add_pr_comment` to `false` to stop) |

Never granted: approving or merging pull requests; the plugins never force-push.

**Git access.** `/aisdlc:push` and `/aisdlc:pull` use your own git credentials; everyone needs push access to the shared repository (or a fork and pull requests). No Bitbucket API token or scope is needed for the shared repo; the Bitbucket scopes above are for dev's pull requests on the application repositories.

## Repository layout

| Path | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace manifest listing the four plugins |
| `plugins/aisdlc-dev/` | Developer plugin |
| `plugins/aisdlc/` | Shared plugin: `init`, `push`, `pull`, `handoff`, `return`, `status-page` |
| `plugins/aisdlc-design/` | Designer plugin: `init` and `sync` |
| `plugins/aisdlc-qa/` | QA plugin, including the Playwright workspace template, test runner and Jira helper |
| `plugins/aisdlc-pm/` | Project-manager plugin: requirements, acceptance criteria, Jira write-back |
| `scripts/package-plugins.js` | Builds one installable zip per plugin into `dist/` |
| `packages/aisdlc-core/` | Shared core: state engine, workspace and path resolution, config loaders. The source of truth, vendored into each plugin. |
| `scripts/sync-core.js` | Copies the shared core into each plugin; `--check` verifies them |
| `kiro/` | Port of the dev lifecycle as Kiro skills and hooks (the design port predates `/aisdlc-design:sync` and is outdated) ([kiro/README.md](kiro/README.md)). QA is not ported yet. |

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

**Config-driven gates.** The state engine has built-in gates: `specification` and `plan` for dev. A lifecycle can also declare its own in `task-types.yaml`. QA uses this for its `scenarios` and `signoff` gates.
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
node scripts/test-version-check.js
node scripts/test-conflict-markers.js
node scripts/check-conflict-markers.js                          # no leftover merge conflict markers in tracked files
node plugins/aisdlc-dev/scripts/validation/test-init-detect.js
node plugins/aisdlc-dev/scripts/validation/test-jira-client.js    # Jira request routing (classic vs scoped tokens), mock server
node plugins/aisdlc-dev/scripts/validation/cred-check.js        # run from a dev workspace
node plugins/aisdlc-design/scripts/validation/test-gates-design.js
node plugins/aisdlc-qa/scripts/validation/test-gates-qa.js
node plugins/aisdlc-dev/scripts/validation/test-status-export.js    # status page snapshot (--export) and Markdown status (--markdown)
node plugins/aisdlc-dev/scripts/validation/test-check-targets.js   # merge dry run, real git repos
node plugins/aisdlc-dev/scripts/validation/test-trace-gate.js       # cross-repository trace required before editing source (both hooks)
node plugins/aisdlc-dev/scripts/validation/test-sensitivity.js      # data sensitivity resolver (checklists, overrides, data files in a diff)
node plugins/aisdlc-dev/scripts/validation/test-on-edit.js          # checks after every edit (on_edit), and the guard on changing them
node plugins/aisdlc-dev/scripts/validation/test-real-systems.js    # commands that ask first (config/workspace.yaml real_systems)
node scripts/sync-core.js --check
node scripts/version-check.js                                   # every plugin.json matches its CHANGELOG.md
claude plugin validate .
```
CI (`.github/workflows/ci.yml`) runs all of the above on every PR (a PR fails if any tracked file still has merge conflict markers), plus `node scripts/version-check.js --base origin/<base-branch>`: any PR that changes a plugin's behavior (anything under `plugins/<name>/` except README, CHANGELOG, `scripts/validation/**` and `templates/web/docs/**`) must raise that plugin's `.claude-plugin/plugin.json` version above the base and add a `CHANGELOG.md` entry whose newest heading matches it.

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
