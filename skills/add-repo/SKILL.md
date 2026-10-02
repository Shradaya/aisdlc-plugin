---
name: add-repo
description: Onboard a code repository into the aisdlc workspace - read-only study, knowledge package, testing profile, registry entry. Use only when the developer runs /aisdlc:add-repo.
argument-hint: <repo-name> <repo-path>
disable-model-invocation: true
---

# add-repo

## Purpose
Register a repository and generate its standardized knowledge package and testing profile (spec §12-14). Onboarding is strictly read-only with respect to the code repository. It does not use `/init`.

## Invocation conditions
Only on explicit `/aisdlc:add-repo <repo-name> <repo-path>`. `$ARGUMENTS` = `<repo-name> <repo-path>`.

## Inputs
- `repo-name`: identifier; must not already exist in `config/repositories.yaml` (use `refresh-repo` for existing ones).
- `repo-path`: filesystem path (relative paths resolve against the workspace root).

## Prerequisites
- Both arguments present. If either is missing, ask with AskUserQuestion; never guess.
- Path exists and is a Git repository.
- A `main` branch exists (local or `origin/main`). `base_branch` for managed repositories MUST equal `main`; otherwise mark the repository non-compliant, report it, and do not register it as compliant.

## Procedure
1. Resolve the canonical absolute path and confirm it is a Git repository: `git -C <path> rev-parse --show-toplevel`.
2. Record the remote URL (`git -C <path> remote get-url origin`), HEAD commit (`git -C <path> rev-parse HEAD`), and verify `main` (`git -C <path> rev-parse --verify main` or `origin/main`). Use only read-only git commands. Do not checkout, stash, branch, or edit anything in the repository.
3. Study in this exact order: A Identity, B Structure, C Architecture, D Dependencies, E Interfaces, F Data model, G Testing, H Build and release, I Security baseline, J Conventions, K Change-impact map, L Synthesis and verification (spec §12.3, §13).
4. Run phases A and B yourself. After B, parallel analysis is allowed. Launch subagents with disjoint output files, passing only: repo name, canonical path, analyzed commit, their phases, their output file list, and the provenance rules below:
   - `repository-analyst`: Phases F, I, J plus `overview.md`, `structure.md` (from A, B), `data-model.md`, `security.md`, `conventions.md`.
   - `architecture-analyst`: Phases C, K -> `architecture.md`, `change-impact.md`.
   - `dependency-analyst`: Phases D, E -> `dependencies.md`, `interfaces.md`.
   - `test-analyst`: Phases G, H -> `testing.md`, `build-release.md`.
   Subagents write only under `repositories/<repo-name>/`.
5. Phase L (you): reconcile every subagent claim against repository evidence; downgrade or remove unsupported claims. Ensure `testing.md` uses exactly the spec §14 headings (Frameworks, Test Layers, Commands, Test Data, Fixtures and Mocks, Environment Requirements, Database / Infrastructure Requirements, Coverage, CI Integration, Required Pre-merge Checks, Regression Strategy, Flaky / Quarantined Tests, Known Gaps, Feature Test Decision Rules) and records each applicable layer (§14.1: unit, integration, contract, API, component, end-to-end, data-quality, migration, performance, security, smoke) with Layer, Framework, Command, Scope, Prerequisites, CI stage, Required for merge, Typical runtime, Test data strategy, Known failures/flakiness. Any value that cannot be established is `unknown` plus evidence of what was checked.
6. Write `repositories/<repo-name>/repository.yaml` (JSON-compatible YAML, shape per spec §56 plus `base_branch` and the registry fields, conforming to `config/schemas/repository.schema.yaml`; `status: current`) and `metadata.json` containing: analyzed_commit, analyzed_at (ISO-8601), generator (`aisdlc@<version from .claude-plugin/plugin.json>`), per-phase status, unknowns list.
7. Provenance (spec §10): every generated artifact carries analyzed commit SHA, timestamp, generator version, `status` (observed | inferred | human-confirmed | deprecated | conflicted), evidence references, and `confidence` (high | medium | low). New knowledge is `observed` or `inferred`; never `human-confirmed` without explicit human approval.
8. Register the repository in `config/repositories.yaml` (keep it JSON-compatible, `#` comment lines only on their own line). Required fields: path, role, base_branch, domains, depends_on, provides; optional deployment. The `path` MUST be portable, never an absolute machine path. The clone's real location goes in `claude.env` (paths only, never secrets). Decide as follows: if `AISDLC_REPOS_ROOT` is set in `claude.env` and the clone is at `<root>/<repo-name>`, write `"path": "${AISDLC_REPOS_ROOT}/<repo-name>"` and add nothing else. If `AISDLC_REPOS_ROOT` is not set, ask the developer whether their clones share one folder; if yes, add `AISDLC_REPOS_ROOT=<that folder>` to `claude.env` and use the same form. If the clone lives elsewhere, add `AISDLC_REPO_<NAME>=<canonical path>` to `claude.env` (name upper-cased, non-alphanumerics become `_`) and write `"path": "${AISDLC_REPO_<NAME>}"`. Use the same portable `path` in `repositories/<repo-name>/repository.yaml` (step 6) and never write the absolute path into any knowledge document; refer to it as `${AISDLC_REPOS_ROOT}/<repo-name>` or the variable name. Never overwrite existing keys in `claude.env`; add only what is missing. Study commands use the resolved path from `scripts/lib/repo-paths.js`. Resolution is done by `scripts/lib/repo-paths.js`; other developers set their own `claude.env`, and their `.env` and real environment variables override it.
9. Update `system/repository-relationships.yaml` using only already registered repositories (depends_on / provides edges). Create it if absent.
10. **Phase M: system placement and baseline product documentation** (see section below). Runs for every repository, after steps 1-9, because the application already exists and its product behavior must be documented when the repository joins the system.
11. Report files created, the registry entry, every unknown, and the relationship and capability claims the developer confirmed. Never print secret values.

## Phase M: system placement and baseline product documentation
This extends spec §12 so that existing applications get product documentation at onboarding instead of waiting for a first post-release consolidation. It only documents behavior that exists in the code now.

**M1. Derive evidence-based candidates (no questions yet).** From the study, collect what suggests how this repository fits the system, each with its file evidence:
- calls to other services or repositories (HTTP clients, SDKs, generated clients, base URLs and service-name environment variables, queue/topic names, shared package names);
- shared databases, schemas or collections, and who appears to own them;
- who likely consumes this repository (routes and events it exposes; frontend-looking API calls);
- user-facing surfaces (UI routes/pages, CLI commands, public endpoints) and background jobs;
- candidate business capabilities and domains, taken from module, route and table names.
Compare against `system/repository-relationships.yaml`, `system/product/` and the other registered repositories so nothing is duplicated.

**M2. Interview the developer with AskUserQuestion.** Never guess where this repository fits. Ask in short rounds (at most 4 questions per call), each question stating the evidence it comes from and offering the derived candidate as the first option, with the free-text "Other" for corrections. Cover, in this order:
1. **Role in the system:** what this repository is for in one sentence and who uses it (end users, other services, operators); confirm or correct the derived `role`.
2. **Upstream and downstream:** for each candidate dependency or consumer found in M1, confirm it is real and which registered (or not yet registered) repository it is. Ask separately for connections the code cannot show (manual processes, third-party systems, repositories not yet onboarded).
3. **Data ownership:** which database/schema/collections this repository owns, which it only reads, and which other repositories share them.
4. **Business capabilities and domains:** which product capabilities this repository implements or contributes to, with stable names. Propose names from M1; ask which are customer-visible and which are internal.
5. **Key workflows and business rules:** for each confirmed capability, the main user or consumer workflow in plain steps and any rule the code enforces that the developer wants documented (eligibility, limits, states). Offer rules observed in code for confirmation.
6. **Terminology:** terms from the code that need a product-language definition.
7. **Known gaps:** anything in the code that is legacy, deprecated, or not user-visible and should be left out of product documentation.
If the developer skips or answers "don't know", record the item as `unknown`; do not fill it from inference. Ask only what is still unresolved when other repositories are already documented.

**M3. Record the answers.**
- `config/repositories.yaml` entry: set `domains`, `depends_on`, `provides` from the confirmed answers. Add a `system_role` string.
- `system/repository-relationships.yaml`: add each confirmed edge with `from`, `to`, `kind` (api, database, event, file, library, third-party), `direction`, `evidence`, and `status`: `human-confirmed` for edges the developer confirmed, `observed` for code-evidenced edges they did not contradict, `inferred` otherwise, `conflicted` where the answer contradicts the code (and tell the developer). Edges to not-yet-registered repositories are recorded with `target_registered: false`.
- A developer answer is explicit human approval for that specific claim only.

**M4. Write the baseline documentation.** Delegate to `product-knowledge-analyst` in **baseline mode** (it writes only under `system/`), passing: repository name and path, analyzed commit, the repository knowledge package paths, the confirmed answers, the M1 evidence, and the current contents of `system/product/` and `system/architecture/`. It must:
- create or update `system/product/capabilities/<capability>.md` for each confirmed capability, written as current behavior in product language, with a provenance header (analyzed commit, timestamp, generator, status, confidence, evidence) and a section "Implemented by" listing the repositories and their role in this capability;
- add `feature-catalog.yaml` entries (`status: active`, `introduced_by: baseline`, `repositories: [...]`, `product_document`, `user_workflows`); update an existing entry instead of adding a duplicate when another repository already contributes to the same capability;
- create or update `system/product/user-workflows/*.md` and `system/product/business-rules/*.md` for the confirmed workflows and rules;
- update `system/product/glossary.md` and `system/product/product-overview.md` (add this repository's capabilities; do not rewrite other repositories' content);
- create or update `system/architecture/system-overview.md` with the cross-repository picture (a diagram of confirmed edges, data ownership, and the path of each customer-visible capability across repositories) and link to the per-repository `architecture.md` files instead of duplicating them;
- put every `unknown` and every `inferred` statement in an "Open questions" section rather than stating it as fact;
- never state behavior that is not in the code evidence or a developer answer, and never copy secrets.

**M5. Verify.** Check that every capability mentioned in a workflow or rule exists in `feature-catalog.yaml`, every catalog entry's `product_document` file exists, every repository in a relationship edge is either registered or flagged `target_registered: false`, and no statement contradicts a confirmed answer. Fix or list failures; do not report success with unresolved failures.

## Outputs
`repositories/<repo-name>/{repository.yaml,overview.md,structure.md,architecture.md,dependencies.md,interfaces.md,data-model.md,testing.md,build-release.md,security.md,conventions.md,change-impact.md,metadata.json}`, updated `config/repositories.yaml`, updated `system/repository-relationships.yaml`, and the baseline documentation: `system/product/{product-overview.md,feature-catalog.yaml,glossary.md,capabilities/,user-workflows/,business-rules/}` and `system/architecture/system-overview.md`.

## Failure behavior
Missing path, non-Git path, missing `main`, or an already-registered name: stop, report the exact reason, create nothing. If a subagent fails, record the affected phase as `unknown` in `metadata.json` and tell the developer; do not fabricate content.

## Safety restrictions
- MUST NOT modify the code repository (no checkout, stash, branch, commit, config or source edits).
- MUST NOT write secret values (variable names only) into any artifact.
- Writes only under `repositories/`, `system/`, and `config/repositories.yaml`.
- Phase M never invents product behavior: every statement traces to code evidence or a developer answer, and unanswered items stay `unknown`.
- Do not skip Phase M to save time; a repository without confirmed system placement is reported as `placement: incomplete` in `metadata.json` and flagged in `/aisdlc:status`.
