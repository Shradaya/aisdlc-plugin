#!/usr/bin/env node
// Scaffold the shared aisdlc repo that every role (pm, design, dev, qa) works in, with every role's files at once
// (workspace, config, QA environments and Playwright scaffold).
// Usage: node aisdlc-init.js [target-dir] [--role pm|design|dev|qa] [--dry-run] [--force] [--adopt]
//   --role   write .aisdlc/role (local, gitignored) so hand-offs for this person are highlighted
//   --adopt  convert an existing single-role workspace in place: workspace.kind becomes "aisdlc", each tasks/<T>/task.yaml
//            and execution-log.jsonl get the role suffix (needs --role), and .gitignore stops hiding tasks/
// Existing files are never overwritten unless --force; .gitignore is merged line by line.
const fs = require("fs");
const path = require("path");

const TEMPLATES = path.resolve(__dirname, "..", "..", "templates", "workspace");
// Everything every role needs, set up at once: the shared workspace plus the QA test scaffold (config/environments.yaml is
// shared; the Playwright files are gitignored, so they stay on the machines that use them).
const QA_TEMPLATES = path.resolve(__dirname, "..", "..", "templates", "qa");
// The read-only docs site (VitePress) over repositories/ and system/.
const WEB_TEMPLATES = path.resolve(__dirname, "..", "..", "templates", "web");
const ROLES = ["pm", "design", "dev", "qa"];
const SKIP = new Set(["node_modules"]);

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const role = opt("--role");
const positional = args.filter(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--role",
);
const target = path.resolve(positional[0] || process.cwd());
const dryRun = flag("--dry-run");
const force = flag("--force");
const adopt = flag("--adopt");

if (role && !ROLES.includes(role)) {
  console.error(`--role must be one of: ${ROLES.join(", ")}`);
  process.exit(2);
}
if (adopt && !role) {
  console.error("--adopt needs --role (the role whose workspace this is)");
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

const report = {
  created: [],
  merged: [],
  skipped: [],
  overwritten: [],
  adopted: [],
};

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

// 1. scaffold
const sources = [
  { dir: TEMPLATES },
  { dir: QA_TEMPLATES },
  { dir: WEB_TEMPLATES, prefix: "web" },
]
  .filter((x) => fs.existsSync(x.dir))
  .flatMap((x) =>
    walk(x.dir).map((file) => ({ base: x.dir, file, prefix: x.prefix || "" })),
  );
for (const { base, file, prefix } of sources) {
  const rel = path.join(prefix, path.relative(base, file));
  const dest = path.join(target, rel);
  const content = fs.readFileSync(file);
  if (!fs.existsSync(dest)) write(dest, content, "created");
  else if (path.basename(rel) === ".gitignore") {
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
  } else if (force && !content.equals(fs.readFileSync(dest)))
    write(dest, content, "overwritten");
  else report.skipped.push(rel);
}

// 2. adopt an existing single-role workspace
if (adopt) {
  const ws = path.join(target, "config", "workspace.yaml");
  if (fs.existsSync(ws)) {
    let text = fs.readFileSync(ws, "utf8");
    const next = /"kind"\s*:\s*"[^"]*"/.test(text)
      ? text.replace(/"kind"\s*:\s*"[^"]*"/, '"kind": "aisdlc"')
      : text.replace(/("workspace"\s*:\s*\{)/, '$1\n    "kind": "aisdlc",');
    if (next !== text) {
      if (!dryRun) fs.writeFileSync(ws, next);
      report.adopted.push("config/workspace.yaml: kind -> aisdlc");
    }
  }
  const tasks = path.join(target, "tasks");
  if (fs.existsSync(tasks)) {
    for (const t of fs.readdirSync(tasks)) {
      for (const [from, to] of [
        ["task.yaml", `task.${role}.yaml`],
        ["execution-log.jsonl", `execution-log.${role}.jsonl`],
      ]) {
        const a = path.join(tasks, t, from),
          b = path.join(tasks, t, to);
        if (fs.existsSync(a) && !fs.existsSync(b)) {
          if (!dryRun) fs.renameSync(a, b);
          report.adopted.push(`tasks/${t}/${from} -> ${to}`);
        }
      }
    }
  }
  const gi = path.join(target, ".gitignore");
  if (fs.existsSync(gi)) {
    const have = fs.readFileSync(gi, "utf8");
    const kept = have
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "tasks/*" && l.trim() !== "!tasks/.gitkeep");
    if (kept.length !== have.split(/\r?\n/).length) {
      if (!dryRun) fs.writeFileSync(gi, kept.join("\n"));
      report.adopted.push(".gitignore: tasks/ is now shared");
    }
  }
}

// 3. role
if (role) {
  const f = path.join(target, ".aisdlc", "role");
  if (!fs.existsSync(f) || force || fs.readFileSync(f, "utf8").trim() !== role)
    write(f, role + "\n", fs.existsSync(f) ? "overwritten" : "created");
}

console.log(`${dryRun ? "[dry run] " : ""}aisdlc init -> ${target}`);
for (const [k, v] of Object.entries(report))
  if (v.length) console.log(`${k} (${v.length}):\n  ${v.join("\n  ")}`);
if (!role && !fs.existsSync(path.join(target, ".aisdlc", "role")))
  console.log(
    "\nRole not set: re-run with --role pm|design|dev|qa (or set AISDLC_ROLE).",
  );
console.log(
  "\nNext: make sure this folder is the shared git repository (clone it, or git init and add the remote), install your role's plugin, then /aisdlc:pull and /aisdlc:status-page.",
);
