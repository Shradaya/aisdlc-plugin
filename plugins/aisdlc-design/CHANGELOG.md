# Changelog

What changed in aisdlc-design, newest first. Versions: **major** when people must act, **minor** for something new, **patch** for fixes. README, tests and docs-site changes need no version. Every behavior change to this plugin needs a bump here and in `.claude-plugin/plugin.json` (checked by `node scripts/version-check.js --base <ref>`).

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
