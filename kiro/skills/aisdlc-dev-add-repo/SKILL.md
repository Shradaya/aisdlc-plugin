---
name: aisdlc-dev-add-repo
description: Onboard a repository into the aisdlc dev workspace - a code repository (read-only study, knowledge package, testing profile, registry entry) or, with --kind design, a design repository the designer publishes (registered as a read-only source of designs/<ticket>/). Use when the user wants to register a repository in an aisdlc dev workspace.
---

# aisdlc dev add-repo (Kiro)

Register a repository. For a **code** repository (default), also generate its standardized knowledge package and testing profile; onboarding is strictly read-only with respect to the code. For a **design** repository (`--kind design`), register it as a read-only source of authored designs (`designs/<DESIGN-TICKET>/`) that the feature flow's design-link stage reads and pins. See `aisdlc-lifecycle-reference` for conventions. Let `DEV=%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev`. Run inside a dev workspace.

The authoritative procedure is `%DEV%\skills\add-repo\SKILL.md` — read it and follow it. Key points below.

## Inputs
`<repo-name> <repo-path> [--kind code|design]`. Default kind is `code`. Both positional arguments are required; if either is missing, ask the user; never guess. The path must exist and be a Git repository.

## Design repository (--kind design)
When `--kind design`, do only this and stop (skip the code-study procedure):
1. Resolve the canonical path and confirm it is a Git repository: `git -C <path> rev-parse --show-toplevel`. Record the remote URL (read-only git only; no checkout/branch/edit).
2. Register it in `config/repositories.yaml` with `kind: design`, a portable `path` (the clone's real location goes in `claude.env` as `AISDLC_REPO_<NAME>` or under `AISDLC_REPOS_ROOT`; never an absolute machine path in the registry), `role: design-source`, and `remote`. Do not set `base_branch`, `domains`, `depends_on`, `provides`, `ui`, or a testing profile.
3. Do not create `repositories/<repo-name>/` knowledge, do not run Phase M, do not touch `system/`. Report the registry entry and how design-link will read `designs/<DESIGN-TICKET>/` from it. Never print secrets.

## Code repository (default)
Follow `%DEV%\skills\add-repo\SKILL.md` in full: read-only study in the defined phase order, produce the knowledge package under `repositories/<repo-name>/`, the testing profile, the registry entry (portable path via `claude.env`), the relationship edges, and the baseline product documentation (Phase M). A `main` branch is required for a managed code repository; mark non-compliant and do not register as compliant otherwise.

## Safety restrictions
- Never modify the code repository (no checkout, stash, branch, commit, config, or source edits).
- Never write secret values (variable names only) into any artifact.
- Writes only under `repositories/`, `system/`, and `config/repositories.yaml`.
