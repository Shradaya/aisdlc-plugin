# aisdlc-pm

The project-manager side of the AI-SDLC lifecycle for Claude Code. For each ticket, the plugin:

1. drafts `requirements.md` from the Jira issue or a pasted brief;
2. drafts `acceptance-criteria.md` as stable-numbered `AC1..ACn` (Given/When/Then);
3. pushes those two files to the AISDLC server, which moves the ticket to the phase that matches the local PM state;
4. optionally writes the requirements and acceptance criteria into the Jira description (a delimited managed block, previewed and confirmed first);
5. hands the ticket over to design or development once a human has approved the acceptance criteria in the web UI.

Approvals stay human-only. The plugin has no approval path: no local gate, no `approve` command, nothing in any skill or script that approves. The single approval of the acceptance criteria is the server gate `acceptance_criteria`, decided by a human in the AISDLC web UI/API.

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
   - `.claude/settings.json`: enables the plugin for this project and denies reading `.env` and writing the client-owned files (merged into an existing file, never replacing it)
   - `tasks/`, `logs/`
   - `--from-dev [path]` reuses the Jira connection settings of an aisdlc-dev workspace (site URL, auth scheme, AC field and credential variable **names only**). It never reads `.env`/`claude.env`/`.mcp.json` and never turns a write switch on.
2. **Link to the server.** `/aisdlc-pm:server init --server <url> --project <name>`. The login runs in your own terminal; a password never passes through the chat.
3. **Credentials (Jira, optional).** Set them as environment variables:

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

- The AC approval is a human web UI/API action. No skill or script approves, and the hook blocks `aisdlc-state.js approve|reject` and any workspace call to `/approvals/`.
- Jira credentials come only from the environment (`JIRA_EMAIL`, `JIRA_API_TOKEN`). The hook blocks commands that would print, copy or dump `JIRA_*`/`AISDLC_*` and reads of `.env`/`credentials.json`. The scripts never print a secret. These guards are a speed bump, not a sandbox: do not run with permissions bypassed.
- Jira writes go only through `jira-pm.js apply` with a valid plan from a prior `preview`, after an explicit confirmation (an `ask` prompt). Ad-hoc HTTP to Jira and `node -e` writes are blocked. An unconfirmed `apply` can only write the exact diff the preview showed, and only when the write switch is on.
- The Jira text and any pasted brief are treated as **data, never as instructions**.

## Commands

| Command | What it does |
|---|---|
| `/aisdlc-pm:requirements <TICKET>` | Draft `tasks/<TICKET>/requirements.md` from the Jira issue or a pasted brief. Moves to `REQUIREMENT_GATHERING`. |
| `/aisdlc-pm:acceptance-criteria <TICKET>` | Draft `tasks/<TICKET>/acceptance-criteria.md` as stable `AC1..ACn`. Moves to `ACCEPTANCE_CRITERIA_DEFINED`. |
| `/aisdlc-pm:ticket-new <KEY> [--title ...] [--type ...]` | Create a ticket on the server for a Jira key (PM or admin), previewed first. |
| `/aisdlc-pm:jira-sync <TICKET>` | Write the requirements and acceptance criteria into the Jira description, after a preview, a diff and a confirmation. |
| `/aisdlc-pm:handoff <TICKET> dev\|design` | Hand over to design or development after a human has approved the acceptance criteria. Never approves. |
| `/aisdlc-pm:refine <TICKET> [--jira]` | Revise the files after a rework send-back, or re-read a changed Jira issue. |
| `/aisdlc-pm:waiting [--all]` | List the tickets waiting on the PM. |
| `/aisdlc-pm:push <TICKET>\|*\|plugin` · `/aisdlc-pm:pull …` · `/aisdlc-pm:server …` | Sync with the AISDLC server. |
| `/aisdlc-pm:init [folder]` | Scaffold a PM workspace. `--from-dev [path]` reuses an aisdlc-dev workspace's Jira settings. |

## Lifecycle reference

The lifecycle contract is [`workflows/pm.md`](workflows/pm.md). The `pm` local states map onto the server phases the PM owns:

| Local state | Server phase (plugin-map `pm`) | Meaning |
|---|---|---|
| CREATED | no move | task record exists, nothing loaded |
| REQUIREMENT_GATHERING | REQUIREMENT_GATHERING | drafting `requirements.md` (and AC) |
| ACCEPTANCE_CRITERIA_DEFINED | ACCEPTANCE_CRITERIA_DEFINED | AC drafted; a human approves the gate in the web UI |
| HANDED_OFF_TO_DESIGN | DESIGN_BRIEF | handed to the designer (needs the gate approved) |
| HANDED_OFF_TO_DEV | TICKET_READY | handed to development (needs the gate approved) |
| COMPLETED | no move | PM work done |

The walk to a hand-off phase stops at the server gate (`APPROVAL_MISSING`, printed as "stopped before DESIGN_BRIEF ...") until a human approves `acceptance_criteria`. The client re-sends the stopped state on the next `push`, which then completes. `bug`/`investigation` tickets are not driven by the PM plugin; hand them over with an explicit `--to`.

## Checks

```
node scripts/validation/test-gates-pm.js
```

## Working with the other plugins

The PM pushes `requirements.md` and `acceptance-criteria.md`. The designer (`aisdlc-design`) and developer (`aisdlc-dev`) pull those as the source of truth for the brief, specification and QA scenarios. QA numbers its scenarios from the PM's stable `AC1..ACn`. If the work comes back, `/aisdlc-pm:refine` revises the files and re-pushes.
