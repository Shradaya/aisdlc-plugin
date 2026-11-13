# aisdlc-design

The designer side of the AI-SDLC lifecycle for Claude Code. The designer builds the prototype in Claude Design and syncs it into a git design repository with one command; developers read it from git. There are two skills, `init` and `sync`.

Commands are `/aisdlc-design:<skill>`. The plugin works in an aisdlc **design workspace**, which is also the design git repository.

## Install

Add the marketplace once per machine:

```
/plugin marketplace add ~/.claude/plugin
```

Then install the plugin. Pick one of these scopes:

```
/plugin install aisdlc-design@aisdlc-marketplace                           # all your projects (user scope)
claude plugin install aisdlc-design@aisdlc-marketplace --scope project     # only this workspace, shared through .claude/settings.json
claude plugin install aisdlc-design@aisdlc-marketplace --scope local       # only this workspace, only you
```

Run the `--scope project` and `--scope local` forms from inside the workspace folder. Afterwards, restart Claude Code in the workspace so the hooks load.

## Set up a workspace

1. Clone the design repository, or make a new folder and run `git init` plus `git remote add origin <url>`.
2. Run `/aisdlc-design:init [folder]`. It scaffolds `config/repositories.yaml` (the workspace marker), `designs/`, `logs/`, `CLAUDE.md` and `.gitignore`. Commit that scaffolding from a normal terminal: the hook only allows Claude to commit `designs/<KEY>/`.
3. Restart Claude Code in the folder so the hooks load.
4. Make sure you can push to the design repository (or fork it and open pull requests).

A designer whose Claude is in another organization installs the plugin in their own Claude the same way, adding the marketplace from the repository's git URL (`/plugin marketplace add <git-url>`) instead of the local path.

No tokens are needed. `sync` uses your own git credentials to push, and never calls Jira or Bitbucket.

## Commands

| Command | What it does |
|---|---|
| `/aisdlc-design:init [folder]` | Scaffold the design workspace |
| `/aisdlc-design:sync <artifact-link-or-file> --ticket KEY [--pages a,b]` | Sync the Claude Design prototype into `designs/KEY/` and commit it as `KEY: <summary>` |

`design.md` is short and precise by rule: terse one-line entries, no prose paragraphs, `None` for empty sections.

## Design flow

Use this when the designer works in Claude Design, including when their Claude organization blocks outside access. Nothing is shared out of that organization: the designer's own Claude reads their own artifact and git carries it. Each ticket gets its own folder, and there are no branches: sync commits straight to `main`.

```
/aisdlc-design:sync <artifact link | this artifact | file> --ticket KEY [--pages home,checkout]
```

```
Designer (Claude Design)                      Design repo (main)                    Developer
────────────────────────                      ──────────────────                    ─────────
1. Build or change the prototype
   in Claude Design
2. /aisdlc-design:sync <artifact>
   --ticket EL-101 --pages checkout  ──►  designs/EL-101/
                                            checkout.dc.html
                                            support.js, viewer.html, design.md
                                          commit "EL-101: <summary>"
3. git push
                                                                          4. /aisdlc-dev:add-repo <name> <path> --kind design
                                                                          5. /aisdlc-dev:design-link EL-101
                                                                             reads designs/EL-101/, pins the commit sha
6. Design changes again: repeat step 2 for the same ticket (the folder is replaced; git history keeps the old version)
```

1. **Build** the prototype in Claude Design, as usual.
2. **Sync per ticket.** Run `/aisdlc-design:sync <artifact> --ticket KEY`. Without `--pages` every page goes into the ticket folder; with `--pages` only the named ones do. The skill pulls the latest `main`, writes `designs/KEY/`, shows what changed, asks for your approval, and commits `KEY: <summary>`. It never creates branches.
3. **Push** with `git push`. The skill never pushes for you and never force-pushes.
4. **Hand-off.** The developer runs `/aisdlc-dev:design-link KEY`. It reads `designs/KEY/` and pins the source commit sha in the specification.
5. **Change.** Sync the same ticket again. The folder is replaced and a new commit is made; the developer re-runs `design-link` to pick up the new version.

### What is in a ticket folder
```
designs/KEY/
  <page>.dc.html   one file per page; .dc.html is the default format (plain .html only if you ask for it)
  support.js       the Claude Design runtime, copied from the artifact so pages render offline
  viewer.html      static page that links to every page in the folder
  canvas.json      Claude Design canvas index (page names and sizes), for context
  design.md        short per-page summary: states, copy, interactions, open questions
  shared/          other assets (images, fonts, CSS) if any
```
Each folder is self-contained, so two tickets can hold their own copy of the same page. `support.js` is about 190 KB per folder.

### Rules
- **Scope.** No `--pages`: all pages go into the ticket folder. With `--pages`: only those. An unknown page name is listed back to you, never guessed.
- **Viewing without Claude.** Open `designs/KEY/viewer.html` (or any `.dc.html`) by double-click. No Claude account is needed. Google Fonts load from the network.
- **Approval.** One explicit approval before every commit. The skill scans first for remote scripts, secrets and patient data and asks before stripping anything.
- **Commits.** `KEY: <summary>`, one line, staging only `designs/KEY/` (one ticket per commit). The hook enforces this and blocks `git commit -a`, force-push and history rewrites.
- **Read-only toward the artifact.** Sync never edits, republishes or shares it.

## Stages

| Stage | Who | Command / action | Result |
|---|---|---|---|
| Build | Designer | Make or change the prototype in Claude Design | Artifact in the designer's own organization |
| Sync | Designer | `/aisdlc-design:sync <artifact> --ticket KEY [--pages ...]` | `designs/KEY/` committed as `KEY: <summary>` on `main` after approval |
| Publish | Designer | `git push` | Design on the remote |
| Link | Developer | `/aisdlc-dev:design-link KEY` | Spec pins the folder's pages and the source commit sha |
| Change | Designer | Sync the same ticket again, push | Folder replaced, new commit; developer re-links |

## Checks

```
node scripts/validation/test-gates-design.js
```

## Working with the other plugins

1. The developer registers the design repository with `/aisdlc-dev:add-repo <name> <path> --kind design`.
2. During `/aisdlc-dev:feature`, the `design-link` step reads `designs/<TICKET>/` from the design repository and pins the source commit sha in the feature specification.
