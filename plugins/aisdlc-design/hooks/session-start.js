#!/usr/bin/env node
// SessionStart hook (design plugin). Read-only: reports the synced prototype. Does nothing outside a design workspace.
const fs = require("fs");
const path = require("path");
const { resolveRoot, workspaceKind } = require("../scripts/lib/root");
const ROOT = resolveRoot();
if (!ROOT) process.exit(0); // installed user-wide: do nothing outside an aisdlc workspace
const KIND = workspaceKind(ROOT);
if (KIND && KIND !== "design") process.exit(0); // another aisdlc plugin's workspace (config/workspace.yaml "kind")
const dir = path.join(ROOT, "designs");
let tickets = [];
try { tickets = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && /^[A-Z][A-Z0-9]*-\d+$/.test(e.name)).map((e) => e.name); } catch {}
console.log(tickets.length
  ? `aisdlc-design: ${tickets.length} ticket design(s) in designs/ (${tickets.slice(-5).join(", ")}). Add or update one with /aisdlc-design:sync --ticket KEY.`
  : "aisdlc-design: no designs synced yet. Run /aisdlc-design:sync <artifact link> --ticket KEY.");
