#!/usr/bin/env node
// Scaffold a QA workspace into a folder. The folder is both the aisdlc QA workspace (config/, tasks/, logs/, CLAUDE.md)
// and the QA Playwright test repository (package.json, playwright.config.ts, tests/, specs/, fixtures/).
// Usage:
//   node aisdlc-qa-init.js [target-dir] [--only workspace] [--dry-run] [--force]
//   node aisdlc-qa-init.js [target-dir] --mcp-backup   before `npx playwright init-agents`, which overwrites .mcp.json
//   node aisdlc-qa-init.js [target-dir] --mcp-merge    after it: merge the saved servers back next to playwright-test
//   node aisdlc-qa-init.js [target-dir] --from-dev [dev-workspace] [--dry-run]
//        reuse Jira settings from an aisdlc-dev workspace (found next to or above the target when no path is given):
//        its "atlassian" server from .mcp.json (merged next to the others, never replacing the file) and the Jira site
//        URL (its jira.base_url, else JIRA_URL in that server entry) when ours is empty. Never reads claude.env or .env.
// Templates ship in <plugin>/templates. Existing files are never overwritten unless --force; .gitignore is merged
// line by line (missing lines appended) and .claude/settings.json additively (permissions and enabled plugins added,
// nothing removed). Never runs npm; never creates claude.env, .env, .mcp.json or node_modules.
const fs = require("fs");
const path = require("path");

const TEMPLATES = path.resolve(__dirname, "..", "..", "templates");
const PARTS = { workspace: "workspace" };
const SKIP = new Set(["node_modules"]);
const MCP_BACKUP = ".mcp.json.aisdlc-backup";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = opt("--only");
const positional = args.filter((a, i) => !a.startsWith("--") && !["--only", "--from-dev"].includes(args[i - 1]));
const target = path.resolve(positional[0] || process.cwd());
const dryRun = flag("--dry-run");
const force = flag("--force");

if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) { console.error(`Target folder does not exist: ${target}`); process.exit(2); }

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^\s*#.*$/gm, ""));
// Rewrite a JSON-compatible YAML file, keeping its leading '#' comment block.
function writeYaml(f, obj) {
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  const header = lines.slice(0, Math.max(0, lines.findIndex((l) => l.trim() && !l.trim().startsWith("#"))));
  fs.writeFileSync(f, (header.length ? header.join("\n") + "\n" : "") + JSON.stringify(obj, null, 2) + "\n");
}

// Reuse Jira settings from an aisdlc-dev workspace.
if (flag("--from-dev")) {
  const kindOf = (d) => { try { return (readJson(path.join(d, "config", "workspace.yaml")).workspace || {}).kind || null; } catch { return null; } };
  const isDev = (d) => fs.existsSync(path.join(d, "config", "repositories.yaml")) && path.resolve(d) !== target &&
    (kindOf(d) === "dev" || (!kindOf(d) && fs.existsSync(path.join(d, "repositories")) && fs.existsSync(path.join(d, "system"))));
  const given = opt("--from-dev");
  let candidates;
  if (given && !given.startsWith("--")) candidates = [path.resolve(given)].filter(isDev);
  else {
    const near = new Set();
    for (let d = path.dirname(target), i = 0; i < 3 && d !== path.dirname(d); d = path.dirname(d), i++) {
      near.add(d);
      for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) near.add(path.join(d, e.name));
    }
    candidates = [...near].filter(isDev);
  }
  if (candidates.length !== 1) {
    console.log(JSON.stringify({ ok: false, candidates, error: candidates.length ? "several aisdlc-dev workspaces found; pass one: --from-dev <path>" : "no aisdlc-dev workspace found; pass one: --from-dev <path>" }));
    process.exit(1);
  }
  const dev = candidates[0];
  const report = { ok: true, dry_run: dryRun, dev_workspace: dev, changes: [] };
  const devMcp = path.join(dev, ".mcp.json");
  const server = fs.existsSync(devMcp) ? (readJson(devMcp).mcpServers || {}).atlassian : null;
  if (server) {
    const mcp = path.join(target, ".mcp.json");
    const ours = fs.existsSync(mcp) ? readJson(mcp) : { mcpServers: {} };
    if ((ours.mcpServers || {}).atlassian) report.changes.push(".mcp.json already has an atlassian server; left as is");
    else {
      ours.mcpServers = { ...(ours.mcpServers || {}), atlassian: server };
      if (!dryRun) fs.writeFileSync(mcp, JSON.stringify(ours, null, 2) + "\n");
      report.changes.push(".mcp.json += atlassian (copied from the dev workspace, including its certificate mount)");
    }
  } else report.changes.push("the dev workspace has no atlassian server in .mcp.json");
  const integ = path.join(target, "config", "integrations.yaml");
  if (fs.existsSync(integ)) {
    const cfg = readJson(integ);
    let devUrl = "";
    try { devUrl = (readJson(path.join(dev, "config", "integrations.yaml")).jira || {}).base_url || ""; } catch {}
    devUrl = devUrl || (server && server.env && /^https?:\/\//.test(server.env.JIRA_URL || "") ? server.env.JIRA_URL : "");
    if (cfg.jira && !cfg.jira.base_url && devUrl) {
      cfg.jira.base_url = devUrl.replace(/\/+$/, "");
      if (!dryRun) writeYaml(integ, cfg);
      report.changes.push(`jira.base_url = ${cfg.jira.base_url}`);
    }
  }
  // Credentials are never copied or read from files; only whether they are set in this environment.
  report.credentials = Object.fromEntries(["JIRA_EMAIL", "JIRA_API_TOKEN"].map((n) => [n, process.env[n] ? "set" : "missing"]));
  console.log(JSON.stringify(report));
  process.exit(0);
}

// .mcp.json handling around `npx playwright init-agents --loop=claude` (it writes .mcp.json from scratch).
if (flag("--mcp-backup") || flag("--mcp-merge")) {
  const mcp = path.join(target, ".mcp.json"), bak = path.join(target, MCP_BACKUP);
  const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  if (flag("--mcp-backup")) {
    if (!fs.existsSync(mcp)) { console.log("No .mcp.json yet; nothing to back up."); process.exit(0); }
    if (!dryRun) fs.copyFileSync(mcp, bak);
    console.log(`${dryRun ? "[dry run] " : ""}Saved .mcp.json to ${MCP_BACKUP}.`);
    process.exit(0);
  }
  if (!fs.existsSync(bak)) { console.log("No saved .mcp.json; nothing to merge."); process.exit(0); }
  const saved = read(bak);
  const now = fs.existsSync(mcp) ? read(mcp) : { mcpServers: {} };
  const merged = { ...saved, ...now, mcpServers: { ...(saved.mcpServers || {}), ...(now.mcpServers || {}) } };
  if (!dryRun) {
    fs.writeFileSync(mcp, JSON.stringify(merged, null, 2) + "\n");
    fs.unlinkSync(bak);
  }
  console.log(`${dryRun ? "[dry run] " : ""}.mcp.json servers: ${Object.keys(merged.mcpServers).join(", ")}`);
  process.exit(0);
}

if (only && !PARTS[only]) { console.error(`--only must be one of: ${Object.keys(PARTS).join(", ")}`); process.exit(2); }
if (!fs.existsSync(TEMPLATES)) { console.error(`Templates not found at ${TEMPLATES}`); process.exit(2); }

const report = { created: [], merged: [], skipped: [], overwritten: [] };

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function write(dest, content, bucket) {
  report[bucket].push(path.relative(target, dest));
  if (dryRun) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

for (const [name, dir] of Object.entries(PARTS)) {
  if (only && only !== name) continue;
  const root = path.join(TEMPLATES, dir);
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const rel = path.relative(root, file);
    const dest = path.join(target, rel);
    const content = fs.readFileSync(file);
    if (!fs.existsSync(dest)) {
      write(dest, content, "created");
    } else if (rel.replace(/\\/g, "/") === ".claude/settings.json") {
      // Additive merge: add our permission rules and enabled plugin, keep everything already there.
      const have = readJson(dest), want = JSON.parse(content.toString());
      const merged = { ...have, permissions: { ...(have.permissions || {}) }, enabledPlugins: { ...(want.enabledPlugins || {}), ...(have.enabledPlugins || {}) } };
      for (const k of ["allow", "deny", "ask"]) {
        const list = [...new Set([...((have.permissions || {})[k] || []), ...((want.permissions || {})[k] || [])])];
        if (list.length) merged.permissions[k] = list;
      }
      if (JSON.stringify(merged) !== JSON.stringify(have)) write(dest, JSON.stringify(merged, null, 2) + "\n", "merged");
      else report.skipped.push(`${rel} (already up to date)`);
    } else if (path.basename(rel) === ".gitignore") {
      const have = fs.readFileSync(dest, "utf8");
      const lines = have.split(/\r?\n/);
      const missing = content.toString().split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#") && !lines.includes(l));
      if (missing.length) write(dest, have.trimEnd() + "\n\n# aisdlc-qa\n" + missing.join("\n") + "\n", "merged");
      else report.skipped.push(`${rel} (already up to date)`);
    } else if (force && !content.equals(fs.readFileSync(dest))) {
      write(dest, content, "overwritten");
    } else {
      report.skipped.push(rel);
    }
  }
}

console.log(`${dryRun ? "[dry run] " : ""}aisdlc-qa init -> ${target}`);
for (const [k, v] of Object.entries(report)) if (v.length) console.log(`${k} (${v.length}):\n  ${v.join("\n  ")}`);
console.log("\nNext: fill in config/environments.yaml (QA/UAT base URLs, login) and config/integrations.yaml (Jira site URL).");
console.log("Then, in this folder: npm install; npx playwright install chromium; npx playwright init-agents --loop=claude (around it: --mcp-backup / --mcp-merge).");
console.log("Test a ticket: start Claude Code in this folder, then /aisdlc-qa:test <TICKET>.");
