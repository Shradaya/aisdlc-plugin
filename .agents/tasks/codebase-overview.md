# Codebase overview: aisdlc plugins (c:\Users\Leapfrog\.claude\plugin)

## 1. Summary

This repo is a Claude Code plugin marketplace (`aisdlc-marketplace`, owner Evoke Medical Care) for an AI-assisted SDLC. It ships **three** role plugins, not two: `aisdlc-dev` (developers), `aisdlc-design` (UI/UX designers) and `aisdlc-qa` (QA engineers). It also has a shared core (`packages/aisdlc-core`), a sync script (`scripts/sync-core.js`) and a Kiro port (`kiro/`) of the dev and design lifecycles.

Every plugin follows the same model:
- Work hangs off a ticket.
- A task moves through a state machine whose state changes only via the state CLI (`aisdlc-state.js`).
- Human approvals are gates pinned to the artifact hash. Editing an approved file forces re-approval.
- PreToolUse hooks enforce the gates: early edits, commit format/branch, force-push and secret printing are blocked.
- Credentials are environment variables only.

Role hand-off: design (approved prototype committed to a design repo) -> dev (`design-link` pins a hashed design snapshot into the spec) -> QA (scenarios from the same Jira ticket, Playwright runs, defects back to Jira).

Verified: `node scripts/sync-core.js --check` reports "vendored core is up to date". Git tree is clean on branch `aisdlc-plugin` (HEAD 7ea8cdd, in sync with origin). I could not capture full output of the three gate test suites in this shell (only the first PASS line of design and QA was visible), so I did not confirm that they all pass.

## 2. Structure

| Path | Contents |
|---|---|
| `.claude-plugin/marketplace.json` | Lists aisdlc-dev, aisdlc-design, aisdlc-qa (sources `./plugins/<name>`). |
| `README.md` | Install, roles, credentials, layout, maintenance, checks. |
| `packages/aisdlc-core/` | Canonical core: `lib/{root,repo-paths,yaml,design-config}.js`, `state/aisdlc-state.js`. README explains why it is vendored. |
| `scripts/sync-core.js` | Copies the 5 core files into `plugins/{dev,design,qa}/scripts/`. `--check` exits 1 on drift. |
| `plugins/aisdlc-dev/` | Largest. 15 agents, ~30 skills, 8 workflows (feature, bug, investigation, api-change, database-change, dependency-upgrade, documentation, refactor), `config/` (task-types, policies, testing-policy, 4 schemas), hooks, templates (`workspace/`, `web/` VitePress docs site, `.claude/rules`). Scripts: `git-hosting/bitbucket-pr.js`, `graph/aisdlc-graph.js`, `init/aisdlc-init.js`, `status/status-server.js`+`status-page.html`, validation (`test-gates.js`, `test-repo-paths.js`, `test-status-page.js`, `cred-check.js`). |
| `plugins/aisdlc-design/` | 1 agent (`design-writer`), skills init/design/commit, `workflows/design.md`, hooks, `templates/preview/` (Vite app) and `templates/workspace/`. Scripts: `init/aisdlc-design-init.js`, `config/design-config.js`, `validation/test-gates-design.js`. |
| `plugins/aisdlc-qa/` | 3 agents (scenario-writer, qa-test-reviewer, results-analyst), skills add-env/check/commit/init/jira-ticket/publish/run/status/status-page/test, `config/qa-policy.yaml`, Playwright workspace template, `scripts/qa/*` (run-tests, pw, env, evidence-pack, zip, summarize-results...), `scripts/jira/jira-attach.js`, status server, `docs/qa-flow.html`. Gate tests: `test-gates-qa.js`, `test-status-page-qa.js`. |
| `kiro/` | `install-kiro-skills.js`, `skills/` (12 Kiro skills), `hooks/` (dev/design `*-hook.json` + `*-pre-tool-policy.js`), README. QA is not ported. |

Each plugin has the same shape: `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`, `agents/`, `hooks/` (`hooks.json`, `session-start.js`, `pre-tool-policy.js`, `post-tool-audit.js`), `workflows/`, `config/`, `scripts/`, `templates/`.

## 3. How the pieces relate

### Vendored core (intentional duplication)
- A hosted marketplace install copies only a plugin's own subtree, and `..` paths fail validation, so each plugin carries a physical copy of the core in `scripts/lib` and `scripts/state` (see `packages/aisdlc-core/README.md`).
- `packages/aisdlc-core` is the source of truth. `scripts/sync-core.js` (`CORE_FILES`, `CORE_CONSUMERS`) pushes five files into all three plugins. Currently no drift.
- Hooks import the vendored copy: `plugins/aisdlc-design/hooks/pre-tool-policy.js` uses `require("../scripts/lib/root")` and `.../yaml`.
- Lifecycle differences come from each plugin's `config/task-types.yaml`, not from forked code.

### Kiro skills vs plugin skills
- Kiro has no plugin or marketplace mechanism. `kiro/install-kiro-skills.js <ws> --set dev|design|all` copies `kiro/skills/*` into `<ws>/.kiro/skills/` and writes a PreToolUse hook JSON into `<ws>/.kiro/hooks/`.
- Mapping (Kiro -> plugin): `aisdlc-design-{init,design,commit}` -> `aisdlc-design` skills `init`, `design`, `commit`. `aisdlc-dev-{init,feature,bug,investigate,status,resume,add-repo,pr-review}` -> `aisdlc-dev` skills of the same name. `aisdlc-lifecycle-reference` is Kiro-only and shared.
- Kiro skills are **entry points only**. Detailed stage procedures (impact-analysis, feature-specification, testing, code-review, commit, pull-request, ...) are read on demand from `%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev\skills\<stage>\SKILL.md`. The Node CLIs run unchanged, located via `AI_SDLC_PLUGIN_HOME`.
- Kiro hook tool names: `fs_write|str_replace|fs_append|execute_pwsh`. The installer writes the absolute script path into the hook JSON. The checked-in `kiro/hooks/dev-hook.json` and `design-hook.json` use `%AI_SDLC_PLUGIN_HOME%` instead, so they are templates or reference copies, not what the installer emits.

## 4. Lifecycle, state and enforcement

- **State engine**: `packages/aisdlc-core/state/aisdlc-state.js`. Commands `init/get/transition/approve/reject/set`, O_EXCL lock file, append-only audit log, hash-pinned gates (`specification`, `design`, plus `plan` per README). Task state lives in `<workspace>/tasks/<T>/task.yaml`. Hooks block direct edits to it.
- **Config-driven gates**: `config/task-types.yaml` defines states, `skip`, `source_edit_min_state`/`source_edit_max_state`, `next_steps`. QA adds `gates`, `requires_approval` and `requires_no_open` (the `scenarios` and `signoff` gates).
- **Dev lifecycle** (`plugins/aisdlc-dev/config/task-types.yaml`):
  - feature: CREATED, TICKET_READY, UNDERSTOOD, REPOSITORIES_PREPARED, SPEC_APPROVED, PLAN_APPROVED, IMPLEMENTING, COMMITTED, PR_CREATED, MERGED, RELEASED, KNOWLEDGE_CONSOLIDATED, COMPLETED. Source edits are allowed from SPEC_APPROVED to COMMITTED.
  - bug: ... ROOT_CAUSE_CONFIRMED, REPOSITORIES_PREPARED, IMPLEMENTING, COMMITTED, PR_CREATED, COMPLETED. Edits are allowed from REPOSITORIES_PREPARED.
  - investigation is read-only.
  - Failure states: BLOCKED, WAITING_FOR_INPUT, WAITING_FOR_APPROVAL, CONFLICTED, FAILED, CANCELLED, CI_FAILED, JIRA_CHANGED, SPEC_REVIEW_REQUIRED.
  - Other task types (api-change, refactor, ...) use `feature` (`other_types_use`).
- **Design lifecycle**: DESIGN_BRIEF ... DESIGN_APPROVED ... COMMITTED. Prototype files under `designs/<TICKET>/prototype/` are writable in the allowed window. After approval they are hash-checked against `tasks/<id>/design.md` (`designWriteReason` in the design `pre-tool-policy.js`). Commit format is `<DESIGN-TICKET>: <summary>` on a branch named after the ticket.
- **QA lifecycle**: ticket -> scenarios (approved) -> run -> defect on Jira -> wait for fix -> re-verify -> signoff -> evidence on Jira and regression suite. `qa-policy.yaml` also blocks testing against production.
- **Hook enforcement** (`plugins/*/hooks/hooks.json`): `session-start.js` (context), `pre-tool-policy.js` (reads the event JSON on stdin; exit 2 plus stderr blocks), `post-tool-audit.js`. It blocks protected paths (`.git`, `credentials/`, `secrets/`, `.pem`/`.key`), task.yaml edits, out-of-state source edits, bad commits, force-push, history rewrite and secret printing. Hooks no-op when `config/workspace.yaml` `kind` belongs to another plugin, so plugins can coexist. A workspace is any folder containing `config/repositories.yaml` (or `AISDLC_ROOT`).
- The Kiro path adds a second implementation of the same policy in `kiro/hooks/*-pre-tool-policy.js`. The state CLI is the backstop in all cases.

## 5. Entry points, install, run, test

- Install: `/plugin marketplace add ~/.claude/plugin`, then `/plugin install aisdlc-<role>@aisdlc-marketplace` (`--scope project|local` also work), restart Claude Code, then `/aisdlc-<role>:init` to scaffold a workspace. Do not also use `--plugin-dir`, or the plugin loads twice.
- Daily commands: `/aisdlc-dev:feature|bug|investigate|approve|reject|commit|pr|post-release|finish|status|resume|add-repo...`, `/aisdlc-design:design|commit`, `/aisdlc-qa:test|run|check|publish|...`.
- CLIs (all plain Node, no dependencies): `scripts/state/aisdlc-state.js`, `scripts/init/*-init.js`, `scripts/status/status-server.js`, `scripts/git-hosting/bitbucket-pr.js`, `scripts/qa/*.js`, `scripts/jira/jira-attach.js`. The integration helpers print one JSON line and exit 0 (ok), 1 (error) or 2 (credentials missing).
- Tests (no network or model needed; there is no package.json at the root):
  - `node plugins/aisdlc-dev/scripts/validation/test-gates.js`
  - `node plugins/aisdlc-dev/scripts/validation/test-repo-paths.js`
  - `node plugins/aisdlc-dev/scripts/validation/test-status-page.js`
  - `node plugins/aisdlc-dev/scripts/validation/cred-check.js` (run from a dev workspace)
  - `node plugins/aisdlc-design/scripts/validation/test-gates-design.js`
  - `node plugins/aisdlc-qa/scripts/validation/test-gates-qa.js`
  - `node plugins/aisdlc-qa/scripts/validation/test-status-page-qa.js`
  - `node scripts/sync-core.js --check`
  - `claude plugin validate .`
- Kiro: set `AI_SDLC_PLUGIN_HOME` to the repo root, then run `node kiro/install-kiro-skills.js <ws> --set dev|design|all [--dry-run --force --no-hooks]`.
- Requirements: Node (20+ for the design preview and the QA workspace), env vars `JIRA_EMAIL`, `JIRA_API_TOKEN`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN`, `QA_USERNAME`, `QA_PASSWORD`. Jira writes are off by default (`config/integrations.yaml`).

## 6. Issues, inconsistencies and risks

1. **Stale briefing and docs**: the investigation brief and `kiro/README.md` mention only dev and design. `aisdlc-qa` exists and is not ported to Kiro (the root README says so). `kiro/README.md` says nothing about it beyond that.
2. **Root README path error**: the layout table says the design plugin includes a `preview/` app. The real path is `plugins/aisdlc-design/templates/preview/`.
3. **Design plugin has a non-vendored `scripts/config/design-config.js` CLI**. It requires `../lib/design-config`, which is the vendored library of the same name. Same basename, different roles (CLI vs library), which is confusing. `sync-core.js` also copies `design-config.js` into dev and qa, where it is probably unused. The comment says it is needed everywhere "for uniformity".
4. **Policy logic is duplicated in at least 8 places and not covered by sync**: `plugins/{dev,design,qa}/hooks/pre-tool-policy.js` plus `kiro/hooks/{dev,design}-pre-tool-policy.js` (and the dev/QA status servers and pages). Only the lib and state files have a drift check, so a fix to a policy (for example a new secret pattern) must be applied by hand to each copy. Hook tests exist only for the Claude hooks, so the Kiro copies are not shown to be covered.
5. **Kiro hook JSON templates are not what the installer generates** (`%AI_SDLC_PLUGIN_HOME%` vs absolute path, see section 3). The checked-in files can mislead.
6. **Dev skills are heavily overlapping**: `pr`, `pull-request` and `create-pr` are three skills, as are `feature` / `feature-specification`, and `finish` / `post-release`. This risks duplicate or conflicting instructions. I did not read their bodies to confirm they are redundant.
7. **No CI in the repo**: the README says CI should run the sync check, but there is no workflow file (no `.github`, no `package.json` or test runner). All checks are manual Node scripts.
8. **Windows-centric tooling**: the Kiro hook matcher uses `execute_pwsh`, the setup docs use `setx`, and hooks normalise paths to lowercase with forward slashes. It is untested on POSIX from what I saw.
9. **Test results not fully verified in this run** (only a partial output was visible). Treat "tests pass" as unconfirmed until run locally.

## 7. Recommendations (nothing implemented)

- Add a minimal CI workflow (or a root `package.json` with `npm test`) that runs `sync-core.js --check` and all the `test-gates*.js` suites.
- Extend `sync-core.js` (or add a second canonical module) for the shared hook policy helpers (secret and dangerous-command patterns), and add a drift or behavioural test for the Kiro policy scripts.
- Fix the `preview/` path in the root README, mention `aisdlc-qa` in `kiro/README.md` as unported, and either generate `kiro/hooks/*.json` or label them as templates.
- Rename the design CLI (for example `design-config-cli.js`) or add a comment pointing to the library, and consider excluding `design-config.js` from the dev and qa consumers if unused.
- Review the overlapping dev skills (`pr`/`pull-request`/`create-pr`, etc.) and consolidate or cross-reference them.
