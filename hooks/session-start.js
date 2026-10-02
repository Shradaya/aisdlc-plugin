#!/usr/bin/env node
// SessionStart hook (spec §30.1). Read-only: validates config and reports active tasks.
const fs = require("fs");
const path = require("path");
const ROOT = process.env.AISDLC_ROOT || path.resolve(__dirname, "..");
const out = [];
const { resolveRepoPath } = require("../scripts/lib/repo-paths");
const parse = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^\s*#.*$/gm, ""));
let repos = {};
try { repos = parse(path.join(ROOT, "config", "repositories.yaml")).repositories || {}; }
catch (e) { out.push("WARNING: config/repositories.yaml is unreadable: " + e.message); }
for (const [n, r] of Object.entries(repos)) {
  const loc = resolveRepoPath(n, r, ROOT);
  if (!loc) out.push(`WARNING: repository '${n}': local path not configured. Set AISDLC_REPOS_ROOT or AISDLC_REPO_${n.toUpperCase().replace(/[^A-Z0-9]/g, "_")} in .env`);
  else if (!fs.existsSync(loc.path)) out.push(`WARNING: repository '${n}' path missing: ${loc.path} (from ${loc.source})`);
  if (r.base_branch !== "main") out.push(`WARNING: repository '${n}' is non-compliant (base_branch=${r.base_branch}).`);
}
const td = path.join(ROOT, "tasks");
const active = [];
if (fs.existsSync(td)) for (const t of fs.readdirSync(td)) {
  const f = path.join(td, t, "task.yaml");
  if (!fs.existsSync(f)) continue;
  try { const j = JSON.parse(fs.readFileSync(f, "utf8")); if (j.task.status !== "COMPLETED") active.push(`${j.task.id}: ${j.task.status}`); }
  catch { out.push(`WARNING: corrupt task file ${f}`); }
}
out.push(`aisdlc: ${Object.keys(repos).length} repositories, ${active.length} active tasks${active.length ? " (" + active.join(", ") + ")" : ""}`);
console.log(out.join("\n"));
