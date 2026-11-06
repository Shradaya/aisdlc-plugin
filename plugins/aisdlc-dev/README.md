# aisdlc-dev

The developer side of the AI-SDLC lifecycle for Claude Code. It takes a Jira ticket from analysis through specification, implementation, review, commit, pull request, CI and release, to product-knowledge consolidation. Hooks enforce the lifecycle gates along the way.

Commands are `/aisdlc-dev:<skill>`. The plugin works in an aisdlc **dev workspace**: a control-plane folder that holds knowledge *about* your code repositories (never their source), plus task state and audit logs. The repositories themselves stay wherever they are cloned.

## Install

Add the marketplace once per machine:

```
/plugin marketplace add ~/.claude/plugin
```

Then install the plugin. Pick one of these scopes:

```
/plugin install aisdlc-dev@aisdlc-marketplace                              # all your projects (user scope)
claude plugin install aisdlc-dev@aisdlc-marketplace --scope project        # only this workspace, shared through .claude/settings.json
claude plugin install aisdlc-dev@aisdlc-marketplace --scope local          # only this workspace, only you
```

Run the `--scope project` and `--scope local` forms from inside the workspace folder. Afterwards, restart Claude Code in the workspace so the hooks load.

## Set up a workspace

1. Run `/aisdlc-dev:init [folder]`. It scaffolds:
   - `.claude/settings.json` and `.claude/rules/`
   - the `web/` docs site
   - `config/`, `repositories/`, `system/`, `tasks/` and `logs/`
   - `CLAUDE.md` and `claude.env.example`
2. Copy `claude.env.example` to `claude.env` and set `AISDLC_REPOS_ROOT`, the folder holding your clones. This file holds paths only, never secrets.
3. Set credentials as environment variables in the terminal before starting Claude Code. They are never put in files.

   ```powershell
   $env:JIRA_EMAIL = "you@company.com"
   $env:JIRA_API_TOKEN = "<Jira API token>"
   $env:BITBUCKET_EMAIL = "you@company.com"
   $env:BITBUCKET_API_TOKEN = "<Bitbucket API token>"
   ```

   Set `jira.base_url` in `config/integrations.yaml`. Tickets are read over the Jira REST API by `scripts/jira/jira-fetch.js`, so there is no MCP server to set up; `node <plugin>/scripts/jira/jira-fetch.js check` confirms the connection and prints the `route` it used. Both classic API tokens and tokens with scopes work: the helper switches to the Atlassian API gateway on its own when Jira refuses a scoped token on the site URL (see `jira.api_route`, `jira.cloud_id`). Behind Cloudflare WARP or Zscaler, set `NODE_EXTRA_CA_CERTS` to the corporate root certificate (WARP: `C:/ProgramData/Cloudflare/installed_cert.pem`). Token scopes are listed in `config/integrations.yaml` and in `web/docs/guide/getting-started.md`. Jira writes are off by default.
4. Register each repository with `/aisdlc-dev:add-repo <name> <path>`. Add `--kind design` for a design repository published by `aisdlc-design`.
5. Run `/aisdlc-dev:status` to see repositories, active tasks, integrations, and which credentials are `set` or `missing` (names only, never values). For the same in your browser, refreshing itself as work moves on, run `/aisdlc-dev:status-page`.

## Commands

| Command | What it does |
|---|---|
| `/aisdlc-dev:feature <TICKET>` | Full feature lifecycle, from Jira through specification approval, implementation, validation, review, commit, PR and CI, up to the release hand-off |
| `/aisdlc-dev:bug <TICKET>` | Reproduce the bug, find the root cause, make a minimal fix with a regression test, then validate, review, commit and open a PR |
| `/aisdlc-dev:investigate <TICKET>` | Read-only investigation: evidence, hypotheses, findings |
| `/aisdlc-dev:refactor` · `api-change` · `database-change` · `dependency-upgrade` · `documentation` `<TICKET>` | Specialised workflows that use the feature lifecycle |
| `/aisdlc-dev:approve` · `reject <TICKET> <gate>` | Record a human decision on the specification or plan gate |
| `/aisdlc-dev:commit <TICKET>` | Compliant commit `<TICKET>: <summary>` on branch `<TICKET>` |
| `/aisdlc-dev:pr` · `pull-request` · `create-pr <TICKET>` | Push the branch, create the PRs (to `lf-develop`, `lf-qa`, `lf-uat`), track CI and merge |
| `/aisdlc-dev:sync-main [repo ...] [targets]` | After a release: bring `main` back into `lf-develop`, `lf-qa` and `lf-uat` (one PR per repository and environment; a dated sync branch only where there are conflicts) |
| `/aisdlc-dev:promote <TICKET> [targets]` | For a target `create-pr` found conflicts in: resolve them on the ticket's environment branch (`<TICKET>-<env>`) and open the PR from there |
| `/aisdlc-dev:pr-review <repo> <pr>` | Review any pull request against its requirement and the repository's knowledge |
| `/aisdlc-dev:pr-comments <TICKET> [repo]` | Read the review comments on the ticket's PR, triage them with you, fix the valid ones, push and reply |
| `/aisdlc-dev:post-release <TICKET>` | After release: consolidate product knowledge into `system/product/` and clean up task artifacts |
| `/aisdlc-dev:finish <TICKET>` | Final completion gate |
| `/aisdlc-dev:resume <TICKET>` | Continue an interrupted task from its first incomplete safe state |
| `/aisdlc-dev:status` | Read-only workspace overview |
| `/aisdlc-dev:status-page` | Live status page in the browser: each ticket's past, current and upcoming states, approvals, next step, history and all its documents. `--export <file.html>` saves a self-contained snapshot of it (one file, no server); `--markdown <TICKET>` prints one ticket's status as Markdown |
| `/aisdlc-dev:add-repo` · `refresh-repo` · `remove-repo` | Onboard, refresh or unregister a repository |
| `/aisdlc-dev:repository-preparation <TICKET>` | Stash local changes, fast-forward `main`, create branch `<TICKET>` in each affected repository |
| `/aisdlc-dev:init` | Scaffold a dev workspace |

The workflows also call these stages themselves; Claude can invoke them without a command:
- `jira-ticket`
- `impact-analysis`
- `feature-specification`
- `design-link`
- `testing`
- `code-review`
- `adr`
- `product-knowledge-consolidation`

## Lifecycle and gates

The lifecycle contracts are in [`workflows/`](workflows/): `feature.md`, `bug.md`, `investigation.md`, plus one file for each specialised workflow. The feature path is:

> ticket → understand → impact analysis → repositories prepared → **specification approval** (hash-pinned) → [plan approval] → implement → validate → review → commit → PR → CI → merge → release → knowledge consolidation → complete

What is enforced, and where:

| Rule | Enforced by |
|---|---|
| Every task has a ticket number; state changes only through `scripts/state/aisdlc-state.js` | State engine |
| Source edits in registered repositories only after the specification is approved, and only while its hash still matches | Hook |
| Commits are exactly `<TICKET>: <summary>` on branch `<TICKET>` | Hook |
| No force-push or history rewrite; secrets and API tokens are never printed | Hook |
| A feature is not complete until its product knowledge has been consolidated into `system/product/` | State engine and skills |

## Agents

- **Analysts:** `repository-analyst`, `architecture-analyst`, `dependency-analyst`, `test-analyst`, `impact-analyst`, `service-tracer` (searches the code of every registered repository for the contracts a change touches), `product-knowledge-analyst`.
- **Writers:** `specification-writer`, `implementation-planner`, `test-writer`. The test writer sees only the approved specification, never the implementation.
- **Independent reviewers (read-only):** `backend-reviewer`, `frontend-reviewer`, `database-reviewer`, `security-reviewer`, `test-reviewer`, `documentation-reviewer`.

## Helpers

- **`scripts/git-hosting/bitbucket-pr.js`** is the Bitbucket Cloud PR helper (`create`, `status`, `comment`).
- **`data`** (in `config/workspace.yaml`) declares what the repositories handle: `sensitivity` (`none`, `pii`, `phi`, `financial`) and `data_files` (extensions that hold such data). Anything but `none` makes the security review mandatory and gives the reviewer that sensitivity's checklist (`config/sensitivity/<name>.md`; a same-named file in the workspace's `config/` overrides the plugin's), plus the data files a change adds. `scripts/review/sensitivity.js` resolves it for `code-review`.
- **`on_edit`** (per repository, in `config/repositories.yaml`) lists checks that run right after Claude edits a file there: a formatter (`"fix": true`), a linter, the related test. `hooks/post-tool-edit.js` runs them without a shell and reports failures back to Claude so it fixes them; they run outside the permission prompts, so an edit that changes `on_edit` asks the developer to confirm. Claude Code only (Kiro's PostToolUse hook cannot return output to the model). See the FAQ's "Can aisdlc format and check each file Claude edits?".
- **`real_systems`** (in `config/workspace.yaml`) lists commands that touch real systems; `hooks/pre-tool-policy.js` asks the developer to confirm each one, with its reason, instead of running it (`scripts/lib/real-systems.js`). See the guide's "Commands that ask first".
- **`scripts/git-hosting/check-targets.js`** is a read-only dry run of how a branch merges into each target branch: clean, already merged, or conflicts (with the files, and which targets share the same conflict), plus named imports the merge would leave dangling. It never checks anything out or writes a ref. `/aisdlc-dev:create-pr` runs it before opening any PR. Needs git 2.38+.
  - Credentials come from the environment only.
  - It prints one JSON line and exits `0` ok, `1` error, `2` credentials missing.
  - It shuts down cleanly on Windows: no hard `process.exit()` while the HTTP socket is closing.

  Smoke test with no credentials set (exits `2`):

  ```
  node scripts/git-hosting/bitbucket-pr.js status x 1
  ```
- **`scripts/graph/aisdlc-graph.js`** queries the repository relationship graph: `impact`, `neighbors`, `validate`.
- **`scripts/state/aisdlc-state.js`** is the task state engine, vendored from `packages/aisdlc-core/`.
- **`scripts/status/status-server.js`** serves the live status page (`status-page.html`) on `http://localhost:4317/`. It has no dependencies, is read-only, binds `127.0.0.1` only, and serves documents only from inside `tasks/<TICKET>/` (never `.env` or key files). `--json` prints the overview once without a server.

## Checks

```
node scripts/validation/test-gates.js
node scripts/validation/test-repo-paths.js
node scripts/validation/test-init-detect.js
node scripts/validation/test-status-page.js
node scripts/validation/cred-check.js      # run from a dev workspace
```

## Working with the other plugins

- **From design.** A design repository registered with `--kind design` is read during `/aisdlc-dev:feature`. The `design-link` step snapshots `designs/<DESIGN-TICKET>/` into `system/designs/` and pins it in the specification.
- **To QA.** After your PR reaches the QA environment, the QA engineer tests the ticket with `aisdlc-qa`. Defects come back to you as comments on the Jira ticket. The QA task waits until you reply that the fix is deployed.
