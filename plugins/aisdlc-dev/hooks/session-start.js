#!/usr/bin/env node
// SessionStart hook (spec §30.1). Read-only: validates config and reports active tasks.
const fs = require("fs");
const path = require("path");
const ROOT = require("../scripts/lib/root").resolveRoot();
const { state: STATE_FILE, log: LOG_FILE } = require("../scripts/lib/root").taskNames(ROOT); // task.yaml, or task.<role>.yaml in a shared aisdlc workspace
if (!ROOT) process.exit(0); // installed user-wide: do nothing outside an aisdlc workspace
const KIND = require("../scripts/lib/root").workspaceKind(ROOT);
if (KIND && KIND !== "dev" && KIND !== "aisdlc") process.exit(0); // another aisdlc plugin's workspace (config/workspace.yaml "kind")
const out = [];
const { resolveRepoPath } = require("../scripts/lib/repo-paths");
const parse = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^\s*#.*$/gm, ""));
let repos = {};
try { repos = parse(path.join(ROOT, "config", "repositories.yaml")).repositories || {}; }
catch (e) { out.push("WARNING: config/repositories.yaml is unreadable: " + e.message); }
let designRepos = 0;
for (const [n, r] of Object.entries(repos)) {
  const loc = resolveRepoPath(n, r, ROOT);
  if (!loc) out.push(`WARNING: repository '${n}': local path not configured. Set AISDLC_REPOS_ROOT or AISDLC_REPO_${n.toUpperCase().replace(/[^A-Z0-9]/g, "_")} in .env`);
  else if (!fs.existsSync(loc.path)) out.push(`WARNING: repository '${n}' path missing: ${loc.path} (from ${loc.source})`);
  // Design repositories are read-only sources of authored designs; they have no base_branch/compliance requirement.
  if (r.kind === "design") { designRepos++; continue; }
  if (r.base_branch !== "main") out.push(`WARNING: repository '${n}' is non-compliant (base_branch=${r.base_branch}).`);
}
const td = path.join(ROOT, "tasks");
const active = [];
if (fs.existsSync(td)) for (const t of fs.readdirSync(td)) {
  const f = path.join(td, t, STATE_FILE);
  if (!fs.existsSync(f)) continue;
  try { const j = JSON.parse(fs.readFileSync(f, "utf8")); if (j.task.status !== "COMPLETED") active.push(`${j.task.id}: ${j.task.status}`); }
  catch { out.push(`WARNING: corrupt task file ${f}`); }
}
const codeRepos = Object.keys(repos).length - designRepos;
out.push(`aisdlc: ${codeRepos} code repositories${designRepos ? `, ${designRepos} design repositories` : ""}, ${active.length} active tasks${active.length ? " (" + active.join(", ") + ")" : ""}`);
console.log(out.join("\n"));
