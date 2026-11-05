# Design workspace

This folder is an aisdlc **design** workspace, managed by the `aisdlc-design` plugin. A UI/UX designer authors a design here under a design ticket, approves it, generates its front-end code, and commits it so developers can consume it. A version can also be published to the Jira ticket as a comment.

## Navigation

- `designs/<DESIGN-TICKET>/` — one folder per design ticket (the ticket number is the design title): `design.md` (structured design), `prototype/` (self-contained HTML/CSS), `code/<html|react>/v<N>/` (generated front-end code), `versions/v<N>/` (hashed snapshots that a feature may pin), `children.yaml` (which feature tickets pin which version). This folder is committed and pushed; developers register this repository and read it read-only.
- `design-system/` — durable local constraints the authoring follows: `tokens.md` (colors, typography, spacing), `components.md` (component inventory and usage), `patterns.md` (layout and interaction patterns). Edit these to steer every prototype.
- Claude Design design system (optional): set `AISDLC_DESIGN_SYSTEM` (and `AISDLC_DESIGN_SYSTEM_URL`) in `claude.env` to author against a design system you keep in Claude Design. It is an identifier, not a secret. `/aisdlc-design:codify` reads it as a constraint alongside the local `design-system/` files.
- `preview/` — a local Vite app that renders each prototype by ticket number in a sandboxed iframe. Run `cd preview && npm install && npm run dev`.
- `tasks/<DESIGN-TICKET>/` — design task state and temporary artifacts. State CLI: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js`. Never edit `task.yaml` by hand.
- `logs/` — audit log.

## Lifecycle

`/aisdlc-design:codify <DESIGN-TICKET>` drives: ticket (and code target: HTML/CSS or React) → brief → draft prototype → **your approval** (hash-pinned) → **generate code** under `designs/<TICKET>/code/` → commit to the design repo. The plugin's hooks enforce the gates: files under `designs/<TICKET>/prototype/` and `designs/<TICKET>/code/` are generated only after approval, and commits must read `<DESIGN-TICKET>: <summary>` on branch `<DESIGN-TICKET>`. Publish a version to the Jira ticket with `/aisdlc-design:comment <DESIGN-TICKET> v<N>`.

## Rules

- Prototypes are self-contained HTML/CSS; no secrets, credentials, or real patient data in any design, snapshot, log or state.
- A version snapshot that any feature ticket pins is never edited or deleted; a changed design is a new version.
