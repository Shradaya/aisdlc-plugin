#!/usr/bin/env node
// SessionStart hook (design plugin). Read-only: reports the synced prototype. Does nothing outside a design workspace.
const fs = require("fs");
const path = require("path");
const { resolveRoot, workspaceKind } = require("../scripts/lib/root");
const ROOT = resolveRoot();
if (!ROOT) process.exit(0); // installed user-wide: do nothing outside an aisdlc workspace
const KIND = workspaceKind(ROOT);
if (KIND && KIND !== "design") process.exit(0); // another aisdlc plugin's workspace (config/workspace.yaml "kind")
const dir = path.join(ROOT, "designs", "prototype");
let pages = 0;
try { pages = fs.readdirSync(dir).filter((f) => /\.html$/i.test(f) && f !== "viewer.html").length; } catch {}
console.log(pages
  ? `aisdlc-design: ${pages} prototype page(s) in designs/prototype. Update them with /aisdlc-design:sync.`
  : "aisdlc-design: no prototype synced yet. Run /aisdlc-design:sync <artifact link> for the baseline.");
