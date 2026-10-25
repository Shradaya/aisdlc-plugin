---
name: commit
description: Commit an approved design to the design repository under designs/<DESIGN-TICKET>/ on branch <DESIGN-TICKET>, with the commit message '<DESIGN-TICKET>: <summary>', then guide the push so developers can consume it. Use when the designer runs /aisdlc-design:commit.
argument-hint: <design-ticket-number>
disable-model-invocation: true
---

# commit

## Purpose
Publish an approved design: commit `designs/<DESIGN-TICKET>/` into the design repository (the design workspace folder is itself that git repo) on branch `<DESIGN-TICKET>`, so a developer can register the repository and pin a hashed snapshot of the design. The hook enforces that the design is approved, the branch is `<DESIGN-TICKET>`, and the message is `<DESIGN-TICKET>: <summary>`.

## Invocation conditions
Explicit `/aisdlc-design:commit <DESIGN-TICKET>`. The task must be at DESIGN_APPROVED. Run inside the design workspace.

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <DESIGN-TICKET>` shows DESIGN_APPROVED and `approvals.design.status` = `approved`. If not, stop and tell the designer to finish `/aisdlc-design:design <DESIGN-TICKET>` first.
- The design workspace is a git repository with a `main` branch.

## Procedure
1. Confirm state DESIGN_APPROVED and design approval via `get`.
2. Ensure the working branch is `<DESIGN-TICKET>`: `git rev-parse --abbrev-ref HEAD`. If on `main`, create/switch: `git checkout -b <DESIGN-TICKET>` (or `git checkout <DESIGN-TICKET>` if it exists). Never commit on `main` (the hook blocks it).
3. Stage only the design's own files: `git add designs/<DESIGN-TICKET>` (and `design-system/` only if the designer intentionally changed shared tokens/components for this design; mention it if so). Do not stage `claude.env`, `tasks/`, `logs/`, or `node_modules`.
4. Ask the designer to confirm the commit with AskUserQuestion (show the files staged and the proposed summary). On confirmation, commit with exactly one single-line message: `git commit -m "<DESIGN-TICKET>: <summary>"`. The hook rejects any other format, a body, the wrong branch, or an unapproved design.
5. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <DESIGN-TICKET> COMMITTED`. Append audit `design-committed` (ticket, branch, commit sha; no secrets).
6. Tell the designer to push the branch so developers can consume it: `git push -u origin <DESIGN-TICKET>` (push is the designer's action; do not force-push). Once pushed, a developer registers this repository with `/aisdlc-dev:add-repo <name> <path> --kind design` and pins `designs/<DESIGN-TICKET>/` into a feature specification.
7. Optionally transition to COMPLETED once the branch is pushed and the designer is done: `transition <DESIGN-TICKET> COMPLETED`.

## Outputs
A commit on branch `<DESIGN-TICKET>` containing `designs/<DESIGN-TICKET>/`; task state at COMMITTED (or COMPLETED).

## Failure behavior
Not approved, or on the wrong branch with uncommittable state: stop and report. A dirty or conflicted working tree: `transition <DESIGN-TICKET> CONFLICTED --reason "<why>"` and let the designer resolve by hand. Never force-push, never rewrite history.

## Safety restrictions
- Commit message is exactly `<DESIGN-TICKET>: <summary>`, one line, no body, on branch `<DESIGN-TICKET>`.
- Stage only the design's files; never commit `claude.env`, secrets, or real patient data.
- Never edit `task.yaml` directly; never push with `--force`.
