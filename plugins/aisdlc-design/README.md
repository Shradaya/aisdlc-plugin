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
| `/aisdlc-design:codify <DESIGN-TICKET>` | Capture the brief, author a prototype, run your approval, then generate the requested front-end code (HTML/CSS or React JS) under `designs/<DESIGN-TICKET>/code/`. The design title is the ticket number. Resumes an existing task. |
| `/aisdlc-design:commit <DESIGN-TICKET>` | Commit the approved design on branch `<DESIGN-TICKET>` as `<DESIGN-TICKET>: <summary>`, then guide the push |
| `/aisdlc-design:comment <DESIGN-TICKET> <version>` | Upload that version's design files to the Jira ticket as attachments and post one comment (needs `jira.write.add_attachment`/`add_comment`) |
| `/aisdlc-design:init` | Scaffold a design workspace and the preview app |

`design.md` and `brief.md` are short and precise by rule: terse one-line entries, no prose paragraphs, `None` for empty sections.

## Lifecycle and gates

The lifecycle contract is [`workflows/design.md`](workflows/design.md):

> CREATED → TICKET_READY → DESIGN_BRIEF → DESIGN_DRAFTED → **AWAITING_DESIGN_APPROVAL → DESIGN_APPROVED** → COMMITTED → COMPLETED

What is enforced:

- **Approval before code.** `/aisdlc-design:codify` generates the front-end code only after you approve the design. The hook blocks writes under `designs/<T>/code/` (and `designs/<T>/prototype/`) until the design is approved and `design.md` is unchanged since approval.
- **Prototype and code edits.** Files under `designs/<T>/prototype/` and `designs/<T>/code/` can be written from DESIGN_BRIEF onward. After approval they are pinned to the approved `design.md` hash, so any change needs reapproval. The hook enforces this.
- **Commits.** The state engine refuses COMMITTED without approval. Commits must be `<T>: <summary>` on branch `<T>`, and must never go to `main` or be force-pushed.
- **Pinned versions.** A version snapshot that a feature ticket pins is never edited; a changed design becomes a new version.
- **Jira publishing.** `/aisdlc-design:comment` writes to Jira only when `jira.write.add_attachment` and `jira.write.add_comment` are both enabled; it only attaches files and posts one comment.

What codify produces:

- `designs/<T>/design.md`: screens, states, copy, tokens, interactions and open questions.
- `designs/<T>/prototype/`: self-contained HTML/CSS (the reviewable, approved artifact).
- `designs/<T>/code/<html|react>/v<N>/`: the generated front-end code for the approved version.
- `designs/<T>/versions/v<N>/`: hashed snapshots.
- `designs/<T>/children.yaml`: which feature tickets pin which version.

Agent: `design-writer`. It authors the prototype from the brief and the design system only, never from application source.

## Checks

```
node scripts/validation/test-gates-design.js
```

## Working with the other plugins

The pushed `designs/<DESIGN-TICKET>/` folder is the hand-off to developers:
1. A developer registers the repository with `/aisdlc-dev:add-repo <name> <path> --kind design`.
2. During `/aisdlc-dev:feature`, the `design-link` step pins a hashed snapshot of the design into the feature specification.
