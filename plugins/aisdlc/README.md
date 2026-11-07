# aisdlc

The shared workflow plugin. Every role (PM, Design, Dev, QA) works in **one git repository**; this plugin owns the parts they all need: `init`, `push`, `pull`, hand-off and return between roles, and a status page. Each role plugin (`aisdlc-pm`, `aisdlc-design`, `aisdlc-dev`, `aisdlc-qa`) only does its own work, so no role needs its own init, push or pull.

Commands are `/aisdlc:<skill>`.

## Install

```
/plugin marketplace add ~/.claude/plugin
/plugin install aisdlc@aisdlc-marketplace
```

Install your role's plugin too (`aisdlc-pm`, `aisdlc-design`, `aisdlc-dev` or `aisdlc-qa`), then restart Claude Code in the repository folder so the hooks load. Use `--scope project` or `--scope local` from inside the folder if you want it for this repository only.

## Set up

1. Clone the shared repository, or make a folder with `git init` and `git remote add origin <url>`.
2. Run `/aisdlc:init`. It asks for your role (kept locally in `.aisdlc/role`) and scaffolds `config/`, `tasks/`, `designs/`, `system/`, `repositories/`, `logs/`, `CLAUDE.md` and `.gitignore`. Commit that first scaffolding from a normal terminal; the hook only allows Claude to commit workflow files as `TICKET: summary`.
3. QA only: run `/aisdlc-qa:init` once for the local test scaffold (it leaves the shared files alone).
4. An existing single-role workspace becomes the shared repo with `/aisdlc:init --adopt --role <role>`.

## Commands

| Command | What it does |
|---|---|
| `/aisdlc:init [folder] [--role r] [--adopt]` | Scaffold the shared repo and record your role |
| `/aisdlc:pull` | Pull the latest (rebase, your uncommitted workflow files are kept), then show what is waiting for your role |
| `/aisdlc:push [TICKET] [summary]` | **Pulls first**, then commits your workflow files as `TICKET: summary` and pushes the current branch (no ticket branches) |
| `/aisdlc:handoff TICKET ROLE [note]` | Your part is done; the next role starts. Resolves change requests addressed to you |
| `/aisdlc:return TICKET ROLE reason` | Ask an earlier role for changes; the reason is required |
| `/aisdlc:status-page` | Every ticket's flow from PM to QA in the browser, with its markdown documents and design pages to read (`--export --with-docs` for a file, `--json` for the terminal) |

## Flow

```
--PM                      --Design                 --Dev                      --QA
Requirement gathering     Created                  Understand                 Scenarios
 |                         |                        |                          |
Acceptance criteria       Hand off                 Specification              Tests
 |                                                   |                          |
Hand off ───────────────► ───────────────────────►  Plan                       Results
                                                     |                          |
                                                    Implement                  Sign-off
                                                     |
                                                    Pull request
                                                     |
                                                    Merged ── hand off ──────► (QA)
```

1. **PM** drafts requirements and acceptance criteria (`/aisdlc-pm:...`), gets the criteria approved, hands off to Design and/or Dev.
2. **Design** syncs the prototype with `/aisdlc-design:sync` into `designs/TICKET/`, then hands off (UI tickets only; otherwise Design shows "not needed").
3. **Dev** starts from `tasks/TICKET/requirements.md` and `acceptance-criteria.md` and the design in `designs/TICKET/`.
4. **QA** tests after merge, builds scenarios from the ticket's acceptance criteria, and shares results.
5. **Return.** Any role can send a ticket back: `/aisdlc:return EL-101 pm "AC 3 is ambiguous"`. The receiver sees it after `/aisdlc:pull` (and in `tasks/EL-101/changes.md`), their stage shows "changes requested", and their next `/aisdlc:handoff` asks which items are resolved. Every hand-off, return and resolution is kept in the history.

A role is shown as waiting, active, done, changes requested or not needed. Order is flexible: PM can hand off to Design and Dev together, and a ticket without UI never involves Design.

## Approvals and tamper evidence

- **Approvals are always asked.** `aisdlc-state.js approve|reject` can only be run after the plugin's hook has asked you in Claude Code ("Approve 'specification' for EL-101? ... recorded under git user.email you@company.com"); Claude cannot approve silently. Rejections are asked the same way.
- **Who approved.** The approver recorded is `git config user.email` of the repository the command runs in. It is not authentication: anyone can set it, which is why the prompt shows it. The engine refuses to approve when no email is set.
- **Execution logs are hash-chained.** Every line of `tasks/<TICKET>/execution-log.<role>.jsonl` carries the hash of the line before it, so changing, removing or reordering a line is detected at that line. Skills add lines only with `aisdlc-state.js audit <TICKET> <event> '<json>'`; the hooks block editing the files by hand.
- **State files are sealed.** `tasks/<TICKET>/task.<role>.yaml` carries a seal over its whole content plus the hash of the newest log line. A hand-edit (an approval, a state), a removed seal, or a log changed without the state is detected: the engine refuses to work from it, the hooks ignore it, and the status page shows it in red.
- **Older files.** A state file written before sealing existed is accepted as "unsealed" (the status page warns in amber, because a hand edit of it cannot be detected). Check it with `git diff`, then seal it once with `aisdlc-state.js seal <TICKET>`: the hook asks you, because sealing accepts the file as it is, and the act is recorded in the log under your git email. Sealing refuses a state whose seal was stripped from a chained log (restore it from git instead).
- **Line endings.** Approvals pin the bytes of a file, so `/aisdlc:init` adds a `.gitattributes` that keeps `tasks/`, `designs/`, `system/` and `config/` on LF; without it, Windows `core.autocrlf` can rewrite them on checkout and show approved files as "changed since approval".
- **Check it yourself:** `node <plugin>/scripts/state/aisdlc-state.js verify <TICKET>` (exit 1 when broken). The status page shows "log verified" and "state sealed" per role.
- **Optional key.** Set `AISDLC_LOG_KEY` (a team secret, never committed) and every new line and seal also carries an HMAC, so nobody without the key can rewrite a file and recompute a valid chain. Without the key, a person who rewrites a whole file can recompute it (git history still shows that), and removing lines from the very end of a log cannot be detected from the file alone. Lines written before chaining existed are accepted as "unchained".

## Merge conflicts

Every push starts with a pull. If the same file was changed on both sides, aisdlc stops and tells you; it never resolves, aborts or resets anything. Fix it yourself: `git status`, edit the conflicted files, `git add` them, `git rebase --continue` (or `git rebase --abort` to go back), then run `/aisdlc:push` again. Hand-off and return events are separate files per event, so they never conflict.

## What is shared and what is local

| In git | Local only |
|---|---|
| `tasks/TICKET/`: documents, `task.<role>.yaml`, `handoffs/` | QA `tests/`, `fixtures/`, Playwright files, `.auth/`, reports |
| `designs/TICKET/`, `system/`, `repositories/`, `config/` | `.env`, `claude.env`, `.aisdlc/role`, logs, locks |
| | `tasks/TICKET/changes.md` (generated from the hand-off events after each pull) |

Each role keeps its own state in `tasks/TICKET/task.<role>.yaml` and `execution-log.<role>.jsonl`, so roles never overwrite each other. Hand-offs and returns are tiny unique files under `tasks/TICKET/handoffs/`, so two people recording them at once never conflict. The PM owns `jira.md`, `requirements.md` and `acceptance-criteria.md`; Dev and QA read them.

## Rules (enforced by the hook)

- A commit at the repo root stages only `tasks/`, `designs/`, `system/`, `repositories/`, `config/`, and reads `TICKET: summary` on one line. No `git commit -a`, no force-push, no history rewrite.
- Hand-off events and `changes.md` are written only by `/aisdlc:handoff` and `/aisdlc:return`.
- Documents stay short and precise.

## Checks

```
node scripts/validation/test-aisdlc.js
```
