# Design workspace

This folder is an aisdlc **design** workspace, managed by the `aisdlc-design` plugin. A UI/UX designer authors prototypes here under a design ticket, previews them, and commits them so developers can consume them.

## Navigation

- `designs/<DESIGN-TICKET>/` — one folder per design ticket: `design.md` (structured design), `prototype/` (self-contained HTML/CSS), `versions/v<N>/` (hashed snapshots that a feature may pin), `children.yaml` (which feature tickets pin which version). This folder is committed and pushed; developers register this repository and read it read-only.
- `design-system/` — durable local constraints the authoring follows: `tokens.md` (colors, typography, spacing), `components.md` (component inventory and usage), `patterns.md` (layout and interaction patterns). Edit these to steer every prototype.
- Claude Design design system (optional): set `AISDLC_DESIGN_SYSTEM` (and `AISDLC_DESIGN_SYSTEM_URL`) in `claude.env` to author against a design system you keep in Claude Design. It is an identifier, not a secret. `/aisdlc-design:design` reads it as a constraint alongside the local `design-system/` files.
- `preview/` — a local Vite app that renders each prototype by ticket number in a sandboxed iframe. Run `cd preview && npm install && npm run dev`.
- `tasks/<DESIGN-TICKET>/` — design task state and temporary artifacts. State CLI: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js`. Never edit `task.yaml` by hand.
- `logs/` — audit log.

## Lifecycle

`/aisdlc-design:design <DESIGN-TICKET>` drives: ticket → brief (how to author, existing design?) → draft → **your approval** (hash-pinned) → commit to the design repo. The plugin's hooks enforce the gates: prototype files under `designs/<TICKET>/prototype/` are writable only after approval, and commits must read `<DESIGN-TICKET>: <summary>` on branch `<DESIGN-TICKET>`.

## Rules

- Prototypes are self-contained HTML/CSS; no secrets, credentials, or real patient data in any design, snapshot, log or state.
- A version snapshot that any feature ticket pins is never edited or deleted; a changed design is a new version.
