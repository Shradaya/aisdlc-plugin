# Getting started

## What you need

- Claude Code.
- A local clone of the aisdlc workspace repository (the control plane). It contains `.claude-plugin/plugin.json`, `skills/`, `hooks/`, `config/`, `repositories/`, `system/` and `tasks/`.
- Local clones of the application repositories you want aisdlc to manage. Each must be a Git repository whose default branch is `main`.
- Optional but recommended: a Jira connector (MCP) so tickets are fetched automatically. Without it aisdlc [asks you for the details](/guide/jira-unavailable).

## Where your repositories live (`claude.env`)

The registry does not hold machine-specific paths, because every developer clones the repositories somewhere different. Each registry entry uses `"path": "${AISDLC_REPOS_ROOT}/<repo-name>"`, and the value comes from `claude.env` in the workspace root (gitignored, so it is yours alone):

```text
# claude.env  (paths only, never secrets)
AISDLC_REPOS_ROOT=C:/Evoke                          # folder containing all clones, named like the registry keys
AISDLC_REPO_REST_API_EVOKE=D:/work/rest-api-evoke   # optional override for one repository
```

Copy `claude.env.example` to start. Claude can read and write `claude.env` (`/aisdlc-dev:add-repo` adds an override when a clone is not under the root). Your own `.env` and real environment variables take precedence, and Claude is not allowed to read `.env` or any `.env.*` file. If a path is missing, the session-start hook tells you which variable to set.

## Credentials for Jira and Bitbucket

aisdlc reads integration credentials from environment variables only. Set them in the same terminal session before you start Claude Code. Values are never stored in the workspace, written to task files or logs, or printed by Claude; a hook blocks attempts to print the API tokens.

| Integration | Variables | Used for |
|---|---|---|
| Bitbucket | `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN` | Creating pull requests and reading their status. |
| Jira | `JIRA_EMAIL`, `JIRA_API_TOKEN` | Fetching tickets. Jira Cloud also needs your site URL in `jira.base_url` in `config/integrations.yaml` (not a secret). |

PowerShell:

```powershell
$env:BITBUCKET_EMAIL = "you@company.com"
$env:BITBUCKET_API_TOKEN = "<your Bitbucket API token>"
$env:JIRA_EMAIL = "you@company.com"
$env:JIRA_API_TOKEN = "<your Jira API token>"
claude --plugin-dir .
```

bash:

```bash
export BITBUCKET_EMAIL="you@company.com"
export BITBUCKET_API_TOKEN="<your Bitbucket API token>"
export JIRA_EMAIL="you@company.com"
export JIRA_API_TOKEN="<your Jira API token>"
claude --plugin-dir .
```

`/aisdlc-dev:status` shows each variable as `set` or `missing` (never the value). If one is missing, aisdlc falls back: Jira details are [asked interactively](/guide/jira-unavailable), and pull requests are saved as `pr-description.md` for you to open by hand. The Jira variable names are an aisdlc convention; if your Jira connector expects different names, change them in `config/integrations.yaml`.

### Token scopes

When you create the API tokens, grant only the scopes aisdlc needs. aisdlc reads from Jira and never changes a ticket by default; its Bitbucket use is limited to pushing branches and opening and reading pull requests.

Jira (classic/granular scopes):

| Scope | Why aisdlc needs it |
|---|---|
| `read:issue:jira` | Fetch the ticket and its basic fields. |
| `read:issue-details:jira` | Description, labels, priority, linked issues. |
| `read:comment:jira` | Comments, only when the workflow asks for them. |
| `read:field:jira` | Find the custom field holding acceptance criteria. |
| `read:project:jira` | Resolve the project a ticket belongs to. |
| `read:jira-user` | Optional: assignee and reporter names. |

These are read-only. aisdlc's Jira writes (adding a comment, adding a PR link, status transitions) are disabled by default in `config/integrations.yaml`; enable them there only if you want them, and add the matching `write:*:jira` scopes to the token at that point.

Bitbucket:

| Scope | Why aisdlc needs it |
|---|---|
| `read:repository:bitbucket` | Read repository content and pull request diffs. |
| `read:pullrequest:bitbucket` | Read pull request details and status. |
| `write:pullrequest:bitbucket` | Create pull requests. |

aisdlc never force-pushes and never approves or merges a pull request. Posting PR comments is disabled by default (`git_hosting.write.add_pr_comment` in `config/integrations.yaml`); enable it only if you want aisdlc to comment, which uses the same `write:pullrequest:bitbucket` scope.

## 1. Load the plugin

aisdlc is packaged as a Claude Code plugin named `aisdlc`, and its skills are namespaced with the plugin name. That is why every command starts with `/aisdlc-dev:`.

Developers load the plugin from the central workspace repository (or from your organization's approved plugin distribution). From a terminal in the workspace repository:

```bash
cd path/to/aisdlc-workspace
claude --plugin-dir .
```

Check that it loaded by typing `/aisdlc-dev:` in the prompt: the commands from the [catalog](/guide/commands) should be offered. The plugin and the workspace are versioned together (see `.claude-plugin/plugin.json`), so pull both at the same time.

When a session starts, the SessionStart hook validates the configuration and the repository registry paths, checks task files for corruption and reports the active tasks. It never modifies code repositories.

## 2. Add your repositories

Register each application repository once:

```text
/aisdlc-dev:add-repo <repo-name> <repo-path>
```

For example:

```text
/aisdlc-dev:add-repo backend ../company-backend
/aisdlc-dev:add-repo database ../company-database
```

Add repositories that other repositories depend on first. When a repository is added, aisdlc uses the already-registered ones to update the cross-repository relationship data.

`add-repo` does the following, in this order:

1. Resolves the path and confirms it exists and is a Git repository.
2. Reads the remote URL and the current HEAD commit, and verifies a `main` branch exists.
3. Inspects the repository **read-only**: identity, structure, architecture, dependencies, interfaces, data model, security baseline, conventions, change-impact map, plus a standardized test-system study and build and release information.
4. Writes a knowledge package to `repositories/<repo-name>/` (`overview.md`, `structure.md`, `architecture.md`, `dependencies.md`, `interfaces.md`, `data-model.md`, `testing.md`, `build-release.md`, `security.md`, `conventions.md`, `change-impact.md`, `repository.yaml`, `metadata.json`).
5. Registers the repository in `config/repositories.yaml` and records analysis metadata.
6. **Asks you where the repository fits in the system.** From what it found in the code (calls to other services, shared databases, consumers, user-facing screens and jobs), it proposes answers and asks you to confirm or correct them: the repository's role, what it depends on and who uses it, which data it owns, which business capabilities it implements, the main workflows and business rules, and any terms to define. It never guesses; anything you skip is recorded as unknown.
7. **Documents the existing application** from the code and your answers: capability, workflow and business-rule pages in `system/product/`, entries in the feature catalog (marked `introduced_by: baseline`), glossary terms, and a cross-repository `system/architecture/system-overview.md`. Repositories added later extend these pages instead of duplicating them.
8. Reports unknowns explicitly instead of guessing.

::: tip Onboarding is read-only
`add-repo` never checks out another branch, stashes, creates branches, edits source, changes the repository's configuration or commits to your code repository.
:::

::: warning The base branch must be main
A repository whose default branch is not `main` is marked non-compliant and cannot enter an implementation workflow until explicitly remediated. It shows up under **Blocking issues** in `/aisdlc-dev:status` and on the live status page (`/aisdlc-dev:status-page`).
:::

The registry entry for each repository records `path`, `role`, `base_branch`, `domains`, `depends_on` and `provides`.

## 3. Keep knowledge fresh

Repositories change. To bring a knowledge package up to date with the repository HEAD:

```text
/aisdlc-dev:refresh-repo <repo-name>
```

Refresh compares the previously analyzed commit with the current HEAD, updates only the affected knowledge artifacts, and does a full study if it detects a structural change (build system, framework migration, top-level source layout, new or removed service, deployment architecture, database technology, API or event contracts, or a dependency change involving another registered repository). It never modifies the source repository.

Remove a repository from the registry with `/aisdlc-dev:remove-repo <repo-name>`.

## 4. Check where you are

```text
/aisdlc-dev:status
```

shows registered repositories, knowledge freshness, active tasks and their states, disconnected integrations, pending approvals, unresolved conflicts and non-compliant repositories. For a live view in your browser, `/aisdlc-dev:status-page` starts a local page that refreshes itself: every task's place in its lifecycle (past, current and upcoming states), approvals, next step, history and all of its documents.

## 5. Start work

```text
/aisdlc-dev:feature FEAT-1234
```

or

```text
/aisdlc-dev:bug BUG-5678
```

See the [feature lifecycle](/guide/feature-lifecycle) and [bug lifecycle](/guide/bug-lifecycle) for what happens next.

## Browsing this site

Registered repositories appear under [Repositories](/repos/) after the site is rebuilt (`npm run build`, or restart `npm run dev`). Every page shows a provenance badge and a freshness note; see [FAQ](/guide/faq) for how to read them. If nothing is registered yet, that page tells you to run `/aisdlc-dev:add-repo`.
