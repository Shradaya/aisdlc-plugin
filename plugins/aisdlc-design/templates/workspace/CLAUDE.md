# Design workspace

This folder is an aisdlc **design** workspace and the design git repository, managed by the `aisdlc-design` plugin. The designer builds the prototype in Claude Design and syncs it here; developers read it from git.

## Navigation

- `designs/prototype/` — the one living prototype: `<page>.dc.html` pages, `support.js` (the Claude Design runtime, so pages render offline), `viewer.html` (links to every page), `canvas.json`, `pages.yaml` (page to file and the tickets that touched it), `design.md` (short per-page summary), `shared/` (other assets). Open `viewer.html` by double-click to view it.
- `logs/` — audit log.

## Flow

`/aisdlc-design:sync <artifact link | file> [--ticket KEY] [--pages a,b]`
1. First sync (no `--pages`): whole prototype, baseline commit on `main`.
2. Each ticket: edit in Claude Design, then sync with `--ticket KEY --pages <pages>`. It branches from `main` (`KEY`, or `design/<slug>`), updates only those pages, asks for your approval, commits `KEY: <summary>`. You push the branch; it merges to `main` by pull request after development.

The plugin's hook enforces the commit rules: only `designs/prototype/` is staged, `design: baseline <summary>` only on `main`, `<KEY>: <summary>` only on branch `<KEY>`, `design: <summary>` only on `design/<slug>`, and never a force-push.

## Rules

- No secrets, credentials, or real patient data in the prototype; synthetic placeholder content only.
- Never edit `support.js` by hand; sync refreshes it.
- Read-only toward the Claude Design artifact: sync never edits, republishes or shares it.
