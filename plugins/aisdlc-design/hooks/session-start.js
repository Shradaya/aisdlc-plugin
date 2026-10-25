#!/usr/bin/env node
// SessionStart hook (design plugin). Read-only: reports active design tasks. Does nothing outside a design workspace.
const fs = require("fs");
const path = require("path");
const ROOT = require("../scripts/lib/root").resolveRoot();
if (!ROOT) process.exit(0); // installed user-wide: do nothing outside an aisdlc workspace
const out = [];
const td = path.join(ROOT, "tasks");
const active = [];
if (fs.existsSync(td)) for (const t of fs.readdirSync(td)) {
  const f = path.join(td, t, "task.yaml");
  if (!fs.existsSync(f)) continue;
  try { const j = JSON.parse(fs.readFileSync(f, "utf8")); if (j.task.status !== "COMPLETED") active.push(`${j.task.id}: ${j.task.status}`); }
  catch { out.push(`WARNING: corrupt task file ${f}`); }
}
let designs = 0;
const dd = path.join(ROOT, "designs");
if (fs.existsSync(dd)) designs = fs.readdirSync(dd, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
out.push(`aisdlc-design: ${designs} design(s), ${active.length} active design tasks${active.length ? " (" + active.join(", ") + ")" : ""}`);
console.log(out.join("\n"));
