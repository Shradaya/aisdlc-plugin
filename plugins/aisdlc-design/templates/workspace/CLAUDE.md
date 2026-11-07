# Design workspace

This folder is an aisdlc **design** workspace and the design git repository, managed by the `aisdlc-design` plugin. The designer builds the prototype in Claude Design and syncs it here; developers read it from git.

## Navigation

- `designs/<KEY>/` — one self-contained folder per ticket: `<page>.dc.html` pages, `support.js` (the Claude Design runtime, so pages render offline), `viewer.html` (links to every page), `canvas.json`, `design.md` (short per-page summary), `shared/` (other assets). Open `viewer.html` by double-click to view it.
- `logs/` — audit log.

## Flow

`/aisdlc-design:sync <artifact link | file> --ticket KEY [--pages a,b]`: writes `designs/KEY/` (all pages, or only `--pages`), asks for your approval, and commits `KEY: <summary>` straight to the current branch (normally `main`). No branches. You push; syncing the same ticket again replaces the folder and git history keeps the old version.

The plugin's hook enforces the commit rules: stage only one `designs/KEY/` folder, message `KEY: <summary>` with the same key, no `git commit -a`, and never a force-push.

## Rules

- No secrets, credentials, or real patient data in the prototype; synthetic placeholder content only.
- Never edit `support.js` by hand; sync refreshes it.
- Read-only toward the Claude Design artifact: sync never edits, republishes or shares it.
