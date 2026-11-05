#!/usr/bin/env node
// Scaffold a design workspace into a folder: the workspace itself (config/, designs/, design-system/, tasks/, logs/,
// CLAUDE.md, claude.env.example, .gitignore) and the preview app (preview/).
// Usage: node aisdlc-design-init.js [target-dir] [--only workspace|preview] [--dry-run] [--force]
// Templates ship in <plugin>/templates. Existing files are never overwritten unless --force; .gitignore is merged
// line by line (missing lines appended). Never runs npm install; always skips node_modules.
const fs = require("fs");
const path = require("path");

const TEMPLATES = path.resolve(__dirname, "..", "..", "templates");
const PARTS = { workspace: "workspace", preview: "preview" };
const SKIP = new Set(["node_modules"]);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = opt("--only");
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
const target = path.resolve(positional[0] || process.cwd());
const dryRun = flag("--dry-run");
const force = flag("--force");

if (only && !PARTS[only]) { console.error(`--only must be one of: ${Object.keys(PARTS).join(", ")}`); process.exit(2); }
if (!fs.existsSync(TEMPLATES)) { console.error(`Templates not found at ${TEMPLATES}`); process.exit(2); }
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) { console.error(`Target folder does not exist: ${target}`); process.exit(2); }

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
    // workspace templates land at the target root; preview templates land under preview/
    const rel = name === "workspace" ? path.relative(root, file) : path.join("preview", path.relative(root, file));
    const dest = path.join(target, rel);
    const content = fs.readFileSync(file);
    if (!fs.existsSync(dest)) {
      write(dest, content, "created");
    } else if (path.basename(rel) === ".gitignore") {
      const have = fs.readFileSync(dest, "utf8");
      const lines = have.split(/\r?\n/);
      const missing = content.toString().split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#") && !lines.includes(l));
      if (missing.length) write(dest, have.trimEnd() + "\n\n# aisdlc-design\n" + missing.join("\n") + "\n", "merged");
      else report.skipped.push(`${rel} (already up to date)`);
    } else if (force && !content.equals(fs.readFileSync(dest))) {
      write(dest, content, "overwritten");
    } else {
      report.skipped.push(rel);
    }
  }
}

console.log(`${dryRun ? "[dry run] " : ""}aisdlc-design init -> ${target}`);
for (const [k, v] of Object.entries(report)) if (v.length) console.log(`${k} (${v.length}):\n  ${v.join("\n  ")}`);
if (!dryRun && report.created.some((f) => f.startsWith("preview"))) {
  console.log("\nNext: cd preview && npm install && npm run dev  (needs Node 20+) to preview prototypes by ticket number.");
}
console.log("\nNext: copy claude.env.example to claude.env if you need machine paths; then /aisdlc-design:codify <DESIGN-TICKET> to author a design and generate its code.");
console.log("Author designs: start Claude Code in this folder, or set AISDLC_ROOT to it.");
