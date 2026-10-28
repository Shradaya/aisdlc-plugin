# aisdlc-design

The designer side of the AI-SDLC lifecycle for Claude Code: author a UI/UX prototype under a design ticket, preview it by ticket number, approve it, and commit it to a design repository that developers consume.

Commands are `/aisdlc-design:<skill>`. The plugin works in an aisdlc **design workspace**. That folder is also the design git repository that gets pushed for developers.

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

1. Run `/aisdlc-design:init [folder]`. It scaffolds:
   - `config/repositories.yaml` (the workspace marker)
   - `designs/` and `design-system/{tokens,components,patterns}.md`
   - `tasks/`, `logs/`, `CLAUDE.md`, `claude.env.example` and `.gitignore`
   - the `preview/` app
2. Fill in `design-system/`. These files are the local constraints every prototype follows.
3. Optional: to author against a design system kept in Claude Design, set `AISDLC_DESIGN_SYSTEM` (and `AISDLC_DESIGN_SYSTEM_URL`) in `claude.env`. These are identifiers, not secrets.
4. Start the preview app with `cd preview && npm install && npm run dev` (Node 20+). It renders each prototype by ticket number and shows where each design is in the lifecycle.

The design plugin needs no tokens. If Jira is unavailable, the ticket details are asked for interactively.

## Commands

| Command | What it does |
|---|---|
| `/aisdlc-design:design <DESIGN-TICKET>` | Write the brief, then author the prototype in HTML/CSS (or in Claude Design, then export), version it, and ask for your approval. Resumes an existing task. |
| `/aisdlc-design:commit <DESIGN-TICKET>` | Commit the approved design on branch `<DESIGN-TICKET>` as `<DESIGN-TICKET>: <summary>`, then guide the push |
| `/aisdlc-design:init` | Scaffold a design workspace and the preview app |

## Lifecycle and gates

The lifecycle contract is [`workflows/design.md`](workflows/design.md):

> CREATED → TICKET_READY → DESIGN_BRIEF → DESIGN_DRAFTED → **AWAITING_DESIGN_APPROVAL → DESIGN_APPROVED** → COMMITTED → COMPLETED

What is enforced:

- **Prototype edits.** Files under `designs/<T>/prototype/` can be written from DESIGN_BRIEF onward. After approval they are pinned to the approved `design.md` hash, so any change needs reapproval. The hook enforces this.
- **Commits.** The state engine refuses COMMITTED without approval. Commits must be `<T>: <summary>` on branch `<T>`, and must never go to `main` or be force-pushed.
- **Pinned versions.** A version snapshot that a feature ticket pins is never edited; a changed design becomes a new version.

What a design produces:

- `designs/<T>/design.md`: screens, states, copy, tokens, interactions and open questions.
- `designs/<T>/prototype/`: self-contained HTML/CSS.
- `designs/<T>/versions/v<N>/`: hashed snapshots.
- `designs/<T>/children.yaml`: which feature tickets pin which version.

Agent: `design-writer`. It authors from the brief and the design system only, never from application source.

## Checks

```
node scripts/validation/test-gates-design.js
```

## Working with the other plugins

The pushed `designs/<DESIGN-TICKET>/` folder is the hand-off to developers:
1. A developer registers the repository with `/aisdlc-dev:add-repo <name> <path> --kind design`.
2. During `/aisdlc-dev:feature`, the `design-link` step pins a hashed snapshot of the design into the feature specification.
