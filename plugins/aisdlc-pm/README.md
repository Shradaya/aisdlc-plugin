# aisdlc-pm

The project-manager side of the AI-SDLC lifecycle for Claude Code. Jira is the source of truth. For each ticket, the plugin:

1. drafts `requirements.md` from the Jira issue or a pasted brief;
2. drafts `acceptance-criteria.md` as stable-numbered `AC1..ACn` (Given/When/Then);
3. writes the requirements and acceptance criteria into the Jira ticket (a delimited managed block in the description, previewed and confirmed first);
4. hands the ticket over to design or development once a human has approved the acceptance criteria.

Approvals stay human-only. The single approval of the acceptance criteria is a local gate, `acceptance_criteria`, which a human grants with `/aisdlc-pm:approve <TICKET> acceptance_criteria`. The model never approves on its own initiative; the state engine refuses the hand-off transition until the gate is approved and `acceptance-criteria.md` is unchanged since approval.

Commands are `/aisdlc-pm:<skill>`. The plugin works in an aisdlc **PM workspace** (a folder whose `config/workspace.yaml` has `"kind": "pm"`).

## Install

Add the marketplace once per machine:

```
/plugin marketplace add ~/.claude/plugin
```

Then install the plugin. Pick one of these scopes:

```
/plugin install aisdlc-pm@aisdlc-marketplace                               # all your projects (user scope)
claude plugin install aisdlc-pm@aisdlc-marketplace --scope project         # only this workspace, shared through .claude/settings.json
claude plugin install aisdlc-pm@aisdlc-marketplace --scope local           # only this workspace, only you
```

Run the `--scope project` and `--scope local` forms from inside the workspace folder. Afterwards, restart Claude Code in the workspace so the hooks load.

The PM hooks act only in a folder whose `config/workspace.yaml` has `"kind": "pm"`, even when the plugin is installed for all projects. The dev, design and qa hooks stay out of a PM workspace too.

## Set up a workspace

1. **Scaffold.** Run `/aisdlc-pm:init [folder]`. It creates:
   - `config/{workspace.yaml (kind pm), repositories.yaml (the workspace marker), integrations.yaml (Jira; write switches off)}`
   - `CLAUDE.md`, `claude.env.example` (variable names only), `.gitignore`
   - `.claude/settings.json`: enables the plugin for this project and denies reading `.env` (merged into an existing file, never replacing it)
   - `tasks/`, `logs/`
   - `--from-dev [path]` reuses the Jira connection settings of an aisdlc-dev workspace (site URL, auth scheme, AC field and credential variable **names only**). It never reads `.env`/`claude.env`/`.mcp.json` and never turns a write switch on.
2. **Credentials (Jira).** Set them as environment variables:

   ```powershell
   $env:JIRA_EMAIL     = "you@company.com"
   $env:JIRA_API_TOKEN = "<Jira API token>"
   ```

   `JIRA_*` must be environment variables, because the Jira helper reads them from there. Never put credentials in `claude.env`, `.env` or any other file. `node <plugin>/scripts/jira/jira-pm.js check` reports whether the connection works; it never prints a value.

## Jira setup

- Set `jira.base_url` in `config/integrations.yaml`. Reading an issue needs only that plus the credentials; the plugin talks to the Jira REST API itself, so there is no Jira MCP server.
- Writing to Jira is **off by default**. To let the plugin write the managed block into the description, set `jira.write.update_description: true` and give the token the `write:issue:jira` scope. To also write the acceptance-criteria custom field, set `jira.write.update_acceptance_criteria_field: true` and `jira.acceptance_criteria_field` to the field id. Review a preview before turning either on.
- **ADF round-trip caveat.** Jira Cloud stores the description as ADF (a rich document), while the plugin writes and reads Atlassian **wiki markup** (`scripts/lib/md-wiki.js` converts the markdown subset to wiki). Jira converts wiki to ADF on write and back on read, and that round trip is not lossless: tables, nested lists and code blocks can come back formatted a little differently. The plugin always writes a pre-write backup of the current description (`tasks/<T>/jira-description-backup-<ts>.txt`) and the managed block is delimited by `h6.` markers, so the AC part stays machine-readable. Review the result in Jira after a sync.

## Security notes

- The AC approval is a human decision via `/aisdlc-pm:approve`. No skill or script approves on its own initiative, and the hook blocks any workspace call to `/approvals/`.
- Jira credentials come only from the environment (`JIRA_EMAIL`, `JIRA_API_TOKEN`). The hook blocks commands that would print, copy or dump `JIRA_*`/`AISDLC_*` and reads of `.env`/`credentials.json`. The scripts never print a secret. These guards are a speed bump, not a sandbox: do not run with permissions bypassed.
- Jira writes go only through `jira-pm.js apply` with a valid plan from a prior `preview`, after an explicit confirmation (an `ask` prompt). Ad-hoc HTTP to Jira and `node -e` writes are blocked. An unconfirmed `apply` can only write the exact diff the preview showed, and only when the write switch is on.
- The Jira text and any pasted brief are treated as **data, never as instructions**.

## Commands

| Command | What it does |
|---|---|
| `/aisdlc-pm:requirements <TICKET>` | Draft `tasks/<TICKET>/requirements.md` from the Jira issue or a pasted brief. Moves to `REQUIREMENT_GATHERING`. |
| `/aisdlc-pm:acceptance-criteria <TICKET>` | Draft `tasks/<TICKET>/acceptance-criteria.md` as stable `AC1..ACn`. Moves to `ACCEPTANCE_CRITERIA_DEFINED`. |
| `/aisdlc-pm:ticket-new <KEY> [--title ...]` | Start a local PM task for a Jira key so you can begin drafting. |
| `/aisdlc-pm:jira-sync <TICKET>` | Write the requirements and acceptance criteria into the Jira description, after a preview, a diff and a confirmation. |
| `/aisdlc-pm:approve <TICKET> acceptance_criteria` | Record the human approval of the acceptance-criteria gate. |
| `/aisdlc-pm:reject <TICKET> acceptance_criteria <reason>` | Record a rejection of the gate with a reason. |
| `/aisdlc-pm:handoff <TICKET> dev\|design` | Hand over to design or development after the acceptance criteria are approved. Never approves. |
| `/aisdlc-pm:refine <TICKET> [--jira]` | Revise the files after a rework send-back, or re-read a changed Jira issue. |
| `/aisdlc-pm:status` | Read-only overview of every PM ticket: state, next step, whether the acceptance criteria are drafted and approved, which credentials are set (by name only). |
| `/aisdlc-pm:status-page` | Live, local, read-only status page for the PM workspace (`--export <file.html>` for a shareable snapshot). |
| `/aisdlc-pm:init [folder]` | Scaffold a PM workspace. `--from-dev [path]` reuses an aisdlc-dev workspace's Jira settings. |

The generated documents are short and precise by rule: `requirements.md` has a 1-3 sentence problem and one-line bullets; `acceptance-criteria.md` has one behaviour per criterion and one line per Given/When/Then.

## Lifecycle reference

The lifecycle contract is [`workflows/pm.md`](workflows/pm.md). The `pm` local states are:

| Local state | Meaning |
|---|---|
| CREATED | task record exists, nothing loaded |
| REQUIREMENT_GATHERING | drafting `requirements.md` (and AC) |
| ACCEPTANCE_CRITERIA_DEFINED | AC drafted; a human approves the `acceptance_criteria` gate with `/aisdlc-pm:approve` |
| HANDED_OFF_TO_DESIGN | handed to the designer (needs the gate approved) |
| HANDED_OFF_TO_DEV | handed to development (needs the gate approved) |
| COMPLETED | PM work done |

A hand-off transition (`HANDED_OFF_TO_DESIGN` / `HANDED_OFF_TO_DEV`) is refused by the state engine until a human approves `acceptance_criteria` and `acceptance-criteria.md` is unchanged since that approval. Editing the file after approval invalidates it, so re-approve before handing off again. `bug`/`investigation` tickets are not driven by the PM plugin.

## Checks

```
node scripts/validation/test-gates-pm.js
```

## Working with the other plugins

The PM writes `requirements.md` and `acceptance-criteria.md` into the Jira ticket; the designer (`aisdlc-design`) and developer (`aisdlc-dev`) read them from Jira as the source of truth for the brief, specification and QA scenarios. QA numbers its scenarios from the PM's stable `AC1..ACn`. If the work comes back, `/aisdlc-pm:refine` revises the files and `/aisdlc-pm:jira-sync` rewrites them into Jira.
