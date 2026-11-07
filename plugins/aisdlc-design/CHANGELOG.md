# Changelog

What changed in aisdlc-design, newest first. Versions: **major** when people must act, **minor** for something new, **patch** for fixes. README, tests and docs-site changes need no version. Every behavior change to this plugin needs a bump here and in `.claude-plugin/plugin.json` (checked by `node scripts/version-check.js --base <ref>`).

## 3.0.0 (2026-11-07)
Breaking: no more branches and no shared `designs/prototype/`. `/aisdlc-design:sync` now requires `--ticket KEY` and writes a self-contained `designs/<KEY>/` folder (pages, `support.js`, `viewer.html`, `canvas.json`, `design.md`) containing all pages or only `--pages`. It pulls `main`, asks for approval, and commits `<KEY>: <summary>` straight to the current branch; re-syncing a ticket replaces its folder and git history keeps the old version. The hook now requires a commit to stage exactly one `designs/<KEY>/` folder with a matching message, and no longer has branch rules. `pages.yaml` is gone. Nothing used 2.0.0.

## 2.0.0 (2026-11-06)
Breaking: the plugin is now just `init` and `sync`.
- New `/aisdlc-design:sync`: syncs a Claude Design prototype (own artifact link, file or pasted HTML) into `designs/prototype/` and pushes it to git with no ticket needed, so a designer in another Claude organization can hand off without shared access. Syncs the whole prototype or only `--pages`. The first sync is a baseline commit on `main`; later changes go on a branch from `main` (`<KEY>` or `design/<slug>`).
- Pages are stored as `.dc.html` by default (plain `.html` only when asked) with a local viewer: `support.js` (the Claude Design runtime, refreshed each sync) and `viewer.html`, so pages open from disk without Claude access.
- Removed `codify`, `commit` and `comment`, the `design-writer` agent, the ticket state engine and approval gates, the Jira comment script, the preview app and the `design-system/` templates. `init` now scaffolds only the workspace.
- The hook now enforces only: commits stage only `designs/prototype/`; `design: baseline ...` on `main`, `<KEY>: ...` on branch `<KEY>`, `design: ...` on `design/<slug>`; no force-push or history rewrite.

## 1.1.2 (2026-11-06)
Skill and agent descriptions no longer contain angle brackets (uploads reject them as XML tags) and are valid strict YAML.

## 1.1.1 (2026-11-06)
Generated documents are now required to be short and precise.

## 1.1.0 (2026-11-05)
- Replaced the `design` skill with `codify`: it captures the brief, authors a prototype, runs the designer's approval, and then — only after approval — generates the requested front-end code (HTML/CSS or React JS) under `designs/<DESIGN-TICKET>/code/<framework>/v<N>/`. The design's title is the ticket number.
- Added the `comment` skill (and `scripts/jira/jira-comment.js`): uploads a version's design files to the Jira ticket as attachments and posts one comment that lists/embeds them, gated by `jira.write.add_attachment` / `jira.write.add_comment`.
- The PreToolUse hook now gates `designs/<DESIGN-TICKET>/code/` the same way as `prototype/`, so generated code can only be written after approval and is hash-pinned afterward.

## 1.0.0 (2026-11-03)
Initial tracked version.
