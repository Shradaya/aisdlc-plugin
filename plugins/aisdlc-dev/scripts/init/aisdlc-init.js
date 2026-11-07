#!/usr/bin/env node
// Scaffold an aisdlc workspace into a folder: shared Claude Code config (.claude/), the docs site (web/) and
// the workspace itself (config/, repositories/, system/, tasks/, logs/, CLAUDE.md, claude.env.example, .gitignore).
// Usage: node aisdlc-init.js [target-dir] [--only claude|web|workspace] [--dry-run] [--force]
// Templates ship in <plugin>/templates. Existing files are never overwritten unless --force,
// except .claude/settings.json, which is merged additively (nothing the developer set is removed).
// .gitignore is merged line by line (missing lines appended). Works anywhere: the target does not need to be an aisdlc workspace yet.
const fs = require("fs");
const path = require("path");

const TEMPLATES = path.resolve(__dirname, "..", "..", "templates");
const PARTS = { claude: ".claude", web: "web", workspace: "workspace" };
const SKIP = new Set(["node_modules", "settings.local.json"]);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt("--only");
const positional = args.filter(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--only",
);
const target = path.resolve(positional[0] || process.cwd());
const dryRun = flag("--dry-run");
const force = flag("--force");

if (only && !PARTS[only]) {
  console.error(`--only must be one of: ${Object.keys(PARTS).join(", ")}`);
  process.exit(2);
}
if (!fs.existsSync(TEMPLATES)) {
  console.error(`Templates not found at ${TEMPLATES}`);
  process.exit(2);
}
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
  console.error(`Target folder does not exist: ${target}`);
  process.exit(2);
}

const report = { created: [], merged: [], skipped: [], overwritten: [] };

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const union = (a = [], b = []) => [...a, ...b.filter((x) => !a.includes(x))];

function mergeSettings(existing, template) {
  const out = { ...template, ...existing };
  out.permissions = { ...template.permissions, ...existing.permissions };
  for (const k of ["allow", "deny", "ask"]) {
    out.permissions[k] = union(
      existing.permissions?.[k],
      template.permissions?.[k],
    );
  }
  out.enabledPlugins = {
    ...template.enabledPlugins,
    ...existing.enabledPlugins,
  };
  return out;
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
  for (const file of walk(root)) {
    const rel = path.relative(name === "workspace" ? root : TEMPLATES, file);
    const dest = path.join(target, rel);
    const content = fs.readFileSync(file);
    if (!fs.existsSync(dest)) {
      write(dest, content, "created");
    } else if (rel === ".gitignore") {
      const have = fs.readFileSync(dest, "utf8");
      const lines = have.split(/\r?\n/);
      const missing = content
        .toString()
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.startsWith("#") && !lines.includes(l));
      if (missing.length)
        write(
          dest,
          have.trimEnd() + "\n\n# aisdlc\n" + missing.join("\n") + "\n",
          "merged",
        );
      else report.skipped.push(`${rel} (already up to date)`);
    } else if (rel === path.join(".claude", "settings.json")) {
      let merged;
      try {
        merged = mergeSettings(
          JSON.parse(fs.readFileSync(dest, "utf8")),
          JSON.parse(content),
        );
      } catch (e) {
        report.skipped.push(`${rel} (not valid JSON, left untouched)`);
        continue;
      }
      const text = JSON.stringify(merged, null, 2) + "\n";
      if (text === fs.readFileSync(dest, "utf8"))
        report.skipped.push(`${rel} (already up to date)`);
      else write(dest, text, "merged");
    } else if (force && !content.equals(fs.readFileSync(dest))) {
      write(dest, content, "overwritten");
    } else {
      report.skipped.push(rel);
    }
  }
}

console.log(`${dryRun ? "[dry run] " : ""}aisdlc init -> ${target}`);
for (const [k, v] of Object.entries(report))
  if (v.length) console.log(`${k} (${v.length}):\n  ${v.join("\n  ")}`);
if (!dryRun && report.created.some((f) => f.startsWith("web"))) {
  console.log("\nNext: cd web && npm install && npm run dev  (needs Node 20+)");
}
console.log(
  "\nNext: copy claude.env.example to claude.env and set AISDLC_REPOS_ROOT; then /aisdlc-dev:add-repo <name> <path> for each repository.",
);
console.log(
  "Work across repositories: start Claude Code in this folder, or set AISDLC_ROOT to it.",
);
