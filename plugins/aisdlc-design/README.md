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
2. Run `/aisdlc-design:init [folder]`. It scaffolds `config/repositories.yaml` (the workspace marker), `designs/`, `logs/`, `CLAUDE.md` and `.gitignore`. Commit that scaffolding from a normal terminal: the hook only allows Claude to commit `designs/prototype/`.
3. Restart Claude Code in the folder so the hooks load.
4. Make sure you can push to the design repository (or fork it and open pull requests).

A designer whose Claude is in another organization installs the plugin in their own Claude the same way, adding the marketplace from the repository's git URL (`/plugin marketplace add <git-url>`) instead of the local path.

No tokens are needed. `sync` uses your own git credentials to push, and never calls Jira or Bitbucket.

## Commands

| Command | What it does |
|---|---|
| `/aisdlc-design:init [folder]` | Scaffold the design workspace |
| `/aisdlc-design:sync <artifact-link-or-file> [--ticket KEY] [--pages a,b]` | Sync the Claude Design prototype into `designs/prototype/` and commit it, no ticket required. First sync goes to `main`; later changes go on a branch from `main` |

`design.md` is short and precise by rule: terse one-line entries, no prose paragraphs, `None` for empty sections.

## Design flow

Use this when the designer works in Claude Design, including when their Claude organization blocks outside access. Nothing is shared out of that organization: the designer's own Claude reads their own artifact and git carries it.

```
/aisdlc-design:sync <artifact link | this artifact | file> [--ticket KEY] [--pages home,checkout]
```

### Flow

```
Designer (Claude Design)                      Design repo (git)                     Developer
────────────────────────                      ────────────────                      ─────────
1. Build the prototype in Claude Design
2. /aisdlc-design:sync <artifact>
   (no --pages = whole prototype)    ──►  baseline commit on main
                                          designs/prototype/*.dc.html
                                          + support.js, viewer.html, pages.yaml
3. New ticket needs a change
4. Edit in Claude Design
5. /aisdlc-design:sync <artifact>
   --ticket KEY --pages checkout     ──►  branch KEY from main
                                          commit "KEY: <summary>"
                                          (only the checkout page changes)
6. git push -u origin KEY
                                                                          7. /aisdlc-dev:add-repo <name> <path> --kind design
                                                                          8. /aisdlc-dev:design-link <KEY>
                                                                             reads KEY's pages, pins the commit sha
                                                                          9. Implement; the design PR merges to main
```

1. **Build** the prototype in Claude Design, as usual.
2. **Baseline.** Run `/aisdlc-design:sync <artifact>` once with no `--pages`. The whole prototype is written to `designs/prototype/` and committed on `main` after your explicit approval.
3. **Per ticket.** Edit the prototype in Claude Design, then run `/aisdlc-design:sync <artifact> --ticket KEY --pages <page,...>`. The skill creates a branch from the latest `main` (`KEY`, or `design/<slug>` without a ticket), updates only the named pages, shows what changed, asks for your approval, and commits `KEY: <summary>`.
4. **Push** the branch (`git push -u origin KEY`). The skill never pushes for you and never force-pushes.
5. **Hand-off.** The developer runs `/aisdlc-dev:design-link <KEY>`. It reads the pages tagged for that ticket in `pages.yaml` at the ticket's branch (else `main`) and pins the source commit sha in the specification.
6. **Merge.** After development completes, the branch is merged to `main` by pull request, so `main` always holds the current prototype.

### What is in the repository
```
designs/prototype/
  <page>.dc.html   one file per page; .dc.html is the default format (plain .html only if you ask for it)
  support.js       the Claude Design runtime, copied from the artifact on every sync
  viewer.html      static page that links to every page
  canvas.json      Claude Design canvas index (page names and sizes), for context
  pages.yaml       page -> file and the tickets that touched it
  design.md        short per-page summary: states, copy, interactions, open questions
  shared/          other assets (images, fonts, CSS) if any
```

### Rules
- **Scope.** No `--pages`: the whole prototype syncs. With `--pages`: only those pages change, so a ticket's branch diff is just its pages. An unknown page name is listed back to you, never guessed.
- **Viewing without Claude.** Open `designs/prototype/viewer.html` (or any `.dc.html`) by double-click. No Claude account is needed. Google Fonts load from the network.
- **Approval.** One explicit approval before every commit. The skill scans first for remote scripts, secrets and patient data and asks before stripping anything.
- **Commits.** `design: baseline <summary>` only on `main`; `<KEY>: <summary>` only on branch `<KEY>`; `design: <summary>` only on `design/<slug>`. The commit stages only `designs/prototype/`. The hook enforces these.
- **Read-only toward the artifact.** Sync never edits, republishes or shares it.

## Stages

| Stage | Who | Command / action | Result |
|---|---|---|---|
| Build | Designer | Make or change the prototype in Claude Design | Artifact in the designer's own organization |
| Baseline | Designer | `/aisdlc-design:sync <artifact>` (no `--pages`) | Whole prototype in `designs/prototype/`, committed on `main` after approval |
| Change | Designer | `/aisdlc-design:sync <artifact> --ticket KEY --pages <pages>` | Branch `KEY` (or `design/<slug>`) from `main`, only those pages updated, committed `KEY: <summary>` after approval |
| Publish | Designer | `git push -u origin KEY` | Branch on the design remote |
| Link | Developer | `/aisdlc-dev:design-link <KEY>` | Spec pins the ticket's pages and the source commit sha |
| Merge | Team | Pull request `KEY` into `main` after development | `main` holds the current prototype |

## Checks

```
node scripts/validation/test-gates-design.js
```

## Working with the other plugins

1. The developer registers the design repository with `/aisdlc-dev:add-repo <name> <path> --kind design`.
2. During `/aisdlc-dev:feature`, the `design-link` step reads the ticket's pages from the design repository and pins the source commit sha in the feature specification.
