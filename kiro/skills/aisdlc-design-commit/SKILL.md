---
name: aisdlc-design-commit
description: Commit an approved design to the design repository under designs/<DESIGN-TICKET>/ on branch <DESIGN-TICKET>, with the commit message "<DESIGN-TICKET>: <summary>", then guide the push so developers can consume it. Use when the user wants to commit an approved aisdlc design.
---

# aisdlc design commit (Kiro)

Publish an approved design: commit `designs/<DESIGN-TICKET>/` into the design repository (the design workspace folder is itself that git repo) on branch `<DESIGN-TICKET>`, so a developer can register it and pin a hashed snapshot. See `aisdlc-lifecycle-reference` for conventions.

Let `DESIGN=%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-design`.

## Note on enforcement in Kiro
No commit-gate hook runs here. The state CLI refuses `COMMITTED` without an approved design, which is the backstop. Follow the commit-format and branch rules below by discipline.

## Prerequisites
- `node %DESIGN%\scripts\state\aisdlc-state.js get <DESIGN-TICKET>` shows DESIGN_APPROVED and `approvals.design.status` = `approved`. If not, finish `aisdlc-design-design` for the ticket first.
- The design workspace is a git repository with a `main` branch.

## Procedure
1. Confirm state DESIGN_APPROVED and design approval via `get`.
2. Ensure the working branch is `<DESIGN-TICKET>`: `git rev-parse --abbrev-ref HEAD`. If on `main`, `git checkout -b <DESIGN-TICKET>` (or `git checkout <DESIGN-TICKET>` if it exists). Never commit on `main`.
3. Stage only the design's files: `git add designs/<DESIGN-TICKET>` (and `design-system/` only if the designer intentionally changed shared tokens/components for this design; mention it if so). Do not stage `claude.env`, `tasks/`, `logs/`, or `node_modules`.
4. Ask the designer to confirm the commit (show the staged files and the proposed summary). On confirmation, commit with exactly one single-line message: `git commit -m "<DESIGN-TICKET>: <summary>"`.
5. `node %DESIGN%\scripts\state\aisdlc-state.js transition <DESIGN-TICKET> COMMITTED`. Append audit `design-committed` (ticket, branch, commit sha; no secrets).
6. Tell the designer to push: `git push -u origin <DESIGN-TICKET>` (push is the designer's action; never force-push). Once pushed, a developer registers the repository with the `aisdlc-dev-add-repo` skill (`--kind design`) and pins `designs/<DESIGN-TICKET>/` into a feature specification.
7. Optionally `transition <DESIGN-TICKET> COMPLETED` once pushed and the designer is done.

## Failure behavior
Not approved, or on the wrong branch with uncommittable state: stop and report. A dirty or conflicted tree: `transition <DESIGN-TICKET> CONFLICTED --reason "<why>"` and let the designer resolve by hand.

## Safety restrictions
- Commit message is exactly `<DESIGN-TICKET>: <summary>`, one line, no body, on branch `<DESIGN-TICKET>`.
- Stage only the design's files; never commit `claude.env`, secrets, or real patient data.
- Never edit `task.yaml` directly; never push with `--force`.
