#!/usr/bin/env node
// Scaffold a QA workspace into a folder. The folder is both the aisdlc QA workspace (config/, tasks/, logs/, CLAUDE.md)
// and the QA Playwright test repository (package.json, playwright.config.ts, tests/<TICKET>/, fixtures/); each ticket's approved spec is
// tasks/<TICKET>/spec.md, committed next to its tests.
// Usage:
//   node aisdlc-qa-init.js [target-dir] [--only workspace] [--dry-run] [--force]
//   node aisdlc-qa-init.js [target-dir] --mcp-backup   before `npx playwright init-agents`, which overwrites .mcp.json
//   node aisdlc-qa-init.js [target-dir] --mcp-merge    after it: merge the saved servers back next to playwright-test
//   node aisdlc-qa-init.js [target-dir] --from-dev [dev-workspace] [--dry-run]
//        reuse Jira connection settings from an aisdlc-dev workspace's config/integrations.yaml (found next to or
//        above the target when no path is given): jira.base_url, auth_scheme, acceptance_criteria_field and
//        credential variable names, each only when ours is unset or default. Never reads .mcp.json, claude.env or .env.
//   node aisdlc-qa-init.js [target-dir] --migrate-layout [--dry-run] [--force]
//        move an existing workspace to one folder per ticket: specs/<T>.md -> tasks/<T>/spec.md, and test files under
//        tests/<feature-area>/ that name exactly one ticket -> tests/<T>/ (header rewritten to tasks/<T>/spec.md; a
//        helper moves only with all its importers). Lists what it leaves; never moves auth.setup.ts or seed.spec.ts;
//        never touches the git index; appends the tasks/*/spec.md .gitignore exception when missing.
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
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt("--only");
const positional = args.filter(
  (a, i) =>
    !a.startsWith("--") && !["--only", "--from-dev"].includes(args[i - 1]),
);
const target = path.resolve(positional[0] || process.cwd());
const dryRun = flag("--dry-run");
const force = flag("--force");

if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
  console.error(`Target folder does not exist: ${target}`);
  process.exit(2);
}

const readJson = (f) =>
  JSON.parse(fs.readFileSync(f, "utf8").replace(/^\s*#.*$/gm, ""));
// Rewrite a JSON-compatible YAML file, keeping its leading '#' comment block.
function writeYaml(f, obj) {
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  const header = lines.slice(
    0,
    Math.max(
      0,
      lines.findIndex((l) => l.trim() && !l.trim().startsWith("#")),
    ),
  );
  fs.writeFileSync(
    f,
    (header.length ? header.join("\n") + "\n" : "") +
      JSON.stringify(obj, null, 2) +
      "\n",
  );
}

// The .gitignore lines that keep each ticket's approved spec committed while the rest of tasks/<TICKET>/ stays local.
const SPEC_EXCEPTION = [
  "# The approved spec of each ticket is committed next to its tests (tests/<TICKET>/); everything else in tasks/<TICKET>/ stays local",
  "!tasks/*/",
  "tasks/*/*",
  "!tasks/*/spec.md",
];

// Move an existing workspace from the old layout (specs/<T>.md, tests/<feature-area>/...) to one folder per ticket
// (tasks/<T>/spec.md, tests/<T>/...). Files are moved on disk only; the QA commits the move.
if (flag("--migrate-layout")) {
  const TICKET = /^[A-Z][A-Z0-9]*-\d+$/;
  const rel = (p) => path.relative(target, p).replace(/\\/g, "/");
  const moves = [],
    left = [];
  // specs/<T>.md -> tasks/<T>/spec.md
  const specs = path.join(target, "specs");
  if (fs.existsSync(specs))
    for (const f of fs.readdirSync(specs)) {
      const m = f.match(/^([A-Za-z][A-Za-z0-9]*-\d+)\.md$/);
      if (!m) {
        if (![".gitkeep", "README.md"].includes(f))
          left.push({ path: `specs/${f}`, reason: "not a <TICKET>.md spec" });
        continue;
      }
      const to = path.join(target, "tasks", m[1].toUpperCase(), "spec.md");
      if (fs.existsSync(to) && !force)
        left.push({
          path: `specs/${f}`,
          reason: `${rel(to)} already exists (use --force to overwrite)`,
        });
      else
        moves.push({
          from: path.join(specs, f),
          to,
          content: fs.readFileSync(path.join(specs, f)),
        });
    }
  // tests/<feature-area>/** (and loose files directly under tests/) -> tests/<T>/
  const tests = path.join(target, "tests");
  const candidates = [];
  if (fs.existsSync(tests))
    for (const e of fs.readdirSync(tests, { withFileTypes: true })) {
      const p = path.join(tests, e.name);
      if (e.isFile()) {
        if (!["auth.setup.ts", "seed.spec.ts"].includes(e.name))
          candidates.push({ file: p, dir: tests });
        continue;
      }
      if (!e.isDirectory() || TICKET.test(e.name)) continue; // already a ticket folder
      for (const s of fs.readdirSync(p, { withFileTypes: true })) {
        if (s.isDirectory())
          left.push({
            path: rel(path.join(p, s.name)),
            reason: "nested folder (import paths would change): move by hand",
          });
        else candidates.push({ file: path.join(p, s.name), dir: p });
      }
    }
  // Relative imports between files under tests/ (fixtures/ imports keep working: the folder depth does not change).
  const texts = new Map(
    candidates.map((c) => [c.file, fs.readFileSync(c.file, "utf8")]),
  );
  const resolveImport = (from, spec) => {
    const base = path.resolve(path.dirname(from), spec);
    return (
      [base, ...[".ts", ".js", ".mts", ".cts"].map((e) => base + e)].find((p) =>
        texts.has(p),
      ) || null
    );
  };
  const importsOf = (file) =>
    [
      ...texts
        .get(file)
        .matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g),
    ]
      .map((m) => resolveImport(file, m[1]))
      .filter(Boolean);
  // Proposed destination per file: specs by their one ticket; other files (helpers) by the tickets importing them.
  const dest = new Map(),
    why = new Map();
  for (const c of candidates) {
    if (c.dir === tests) {
      why.set(
        c.file,
        "loose file directly under tests/: move it to tests/<TICKET>/ by hand (its import paths change)",
      );
      continue;
    }
    if (!/\.spec\.ts$/.test(c.file)) continue;
    const ids = [
      ...new Set(
        [
          ...texts
            .get(c.file)
            .matchAll(/@([A-Z][A-Z0-9]*-\d+)(?:-(?:S|AC)\d+)?\b/g),
        ].map((m) => m[1]),
      ),
    ];
    if (ids.length === 1) dest.set(c.file, ids[0]);
    else
      why.set(
        c.file,
        ids.length
          ? `names several tickets (${ids.join(", ")})`
          : "names no ticket",
      );
  }
  // A helper moves only when every file importing it moves to the same ticket folder; a file moves only when every
  // tests/ file it imports moves with it. Repeat until stable, so no import is left pointing at the wrong place.
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of candidates.filter(
      (c) => c.dir !== tests && !/\.spec\.ts$/.test(c.file),
    )) {
      const importers = candidates.filter((o) =>
        importsOf(o.file).includes(c.file),
      );
      const owners = [
        ...new Set(importers.map((o) => dest.get(o.file) || "?")),
      ];
      const t =
        importers.length && owners.length === 1 && owners[0] !== "?"
          ? owners[0]
          : null;
      if (t && !dest.has(c.file)) {
        dest.set(c.file, t);
        why.delete(c.file);
        changed = true;
      }
      if (!t) {
        if (dest.delete(c.file)) changed = true;
        why.set(
          c.file,
          importers.length
            ? `imported by tests of ${owners.map((o) => (o === "?" ? "files that stay" : o)).join(", ")}: helpers several tickets need belong in fixtures/`
            : "not imported by any test here",
        );
      }
    }
    for (const [file, t] of [...dest]) {
      const stray = importsOf(file).filter((i) => dest.get(i) !== t);
      if (stray.length) {
        dest.delete(file);
        why.set(
          file,
          `imports ${stray.map(rel).join(", ")}, which does not move to tests/${t}/`,
        );
        changed = true;
      }
    }
  }
  for (const c of candidates) {
    const t = dest.get(c.file);
    if (!t) {
      left.push({ path: rel(c.file), reason: why.get(c.file) || "not moved" });
      continue;
    }
    const to = path.join(tests, t, path.basename(c.file));
    if (fs.existsSync(to)) {
      left.push({ path: rel(c.file), reason: `${rel(to)} already exists` });
      continue;
    }
    const text = texts
      .get(c.file)
      .replace(
        /\/\/\s*spec:\s*specs\/([A-Za-z][A-Za-z0-9]*-\d+)\.md/g,
        (_, k) => `// spec: tasks/${k.toUpperCase()}/spec.md`,
      );
    moves.push({ from: c.file, to, content: Buffer.from(text) });
  }
  // .gitignore: append the spec exception when missing (never rewrite existing lines).
  const gi = path.join(target, ".gitignore");
  const have = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  const gitignore = have.split(/\r?\n/).includes("!tasks/*/spec.md")
    ? "already has the tasks/<TICKET>/spec.md exception"
    : "appended the tasks/<TICKET>/spec.md exception";
  if (!dryRun) {
    for (const m of moves) {
      fs.mkdirSync(path.dirname(m.to), { recursive: true });
      fs.writeFileSync(m.to, m.content);
      fs.unlinkSync(m.from);
    }
    for (const d of new Set(moves.map((m) => path.dirname(m.from))))
      if (
        d !== specs &&
        d !== tests &&
        fs.existsSync(d) &&
        !fs.readdirSync(d).length
      )
        fs.rmdirSync(d);
    if (gitignore.startsWith("appended"))
      fs.writeFileSync(
        gi,
        have.trimEnd() + "\n\n" + SPEC_EXCEPTION.join("\n") + "\n",
      );
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: dryRun,
        workspace: target,
        moves: moves.map((m) => ({ from: rel(m.from), to: rel(m.to) })),
        left,
        gitignore,
        next: moves.length
          ? "Review, then commit the move (git add -A tests specs tasks/*/spec.md; git commit on the ticket branch)."
          : "Nothing to move.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// Reuse Jira settings from an aisdlc-dev workspace.
if (flag("--from-dev")) {
  const kindOf = (d) => {
    try {
      return (
        (readJson(path.join(d, "config", "workspace.yaml")).workspace || {})
          .kind || null
      );
    } catch {
      return null;
    }
  };
  const isDev = (d) =>
    fs.existsSync(path.join(d, "config", "repositories.yaml")) &&
    path.resolve(d) !== target &&
    (kindOf(d) === "dev" ||
      (!kindOf(d) &&
        fs.existsSync(path.join(d, "repositories")) &&
        fs.existsSync(path.join(d, "system"))));
  const given = opt("--from-dev");
  let candidates;
  if (given && !given.startsWith("--"))
    candidates = [path.resolve(given)].filter(isDev);
  else {
    const near = new Set();
    for (
      let d = path.dirname(target), i = 0;
      i < 3 && d !== path.dirname(d);
      d = path.dirname(d), i++
    ) {
      near.add(d);
      for (const e of fs.readdirSync(d, { withFileTypes: true }))
        if (e.isDirectory()) near.add(path.join(d, e.name));
    }
    candidates = [...near].filter(isDev);
  }
  if (candidates.length !== 1) {
    console.log(
      JSON.stringify({
        ok: false,
        candidates,
        error: candidates.length
          ? "several aisdlc-dev workspaces found; pass one: --from-dev <path>"
          : "no aisdlc-dev workspace found; pass one: --from-dev <path>",
      }),
    );
    process.exit(1);
  }
  const dev = candidates[0];
  const report = { ok: true, dry_run: dryRun, dev_workspace: dev, changes: [] };
  // Jira is reached over REST (scripts/jira/jira-attach.js), so only connection settings are copied, from the dev
  // workspace's own config/integrations.yaml; no MCP server is read or copied.
  let devJira = {};
  try {
    devJira =
      readJson(path.join(dev, "config", "integrations.yaml")).jira || {};
  } catch {}
  const integ = path.join(target, "config", "integrations.yaml");
  if (fs.existsSync(integ)) {
    const cfg = readJson(integ);
    const jira = cfg.jira || (cfg.jira = {});
    let changed = false;
    if (!jira.base_url && devJira.base_url) {
      jira.base_url = String(devJira.base_url).replace(/\/+$/, "");
      changed = true;
      report.changes.push(`jira.base_url = ${jira.base_url}`);
    }
    if (
      devJira.auth_scheme &&
      devJira.auth_scheme !== (jira.auth_scheme || "basic") &&
      (jira.auth_scheme || "basic") === "basic"
    ) {
      jira.auth_scheme = devJira.auth_scheme;
      changed = true;
      report.changes.push(`jira.auth_scheme = ${jira.auth_scheme}`);
    }
    if (devJira.acceptance_criteria_field && !jira.acceptance_criteria_field) {
      jira.acceptance_criteria_field = devJira.acceptance_criteria_field;
      changed = true;
      report.changes.push(
        `jira.acceptance_criteria_field = ${jira.acceptance_criteria_field}`,
      );
    }
    // Variable NAMES only (never values), and only when ours are still the defaults.
    const dc = devJira.credentials || {},
      oc = jira.credentials || {};
    if (
      (dc.email_env || dc.api_token_env) &&
      (oc.email_env || "JIRA_EMAIL") === "JIRA_EMAIL" &&
      (oc.api_token_env || "JIRA_API_TOKEN") === "JIRA_API_TOKEN" &&
      ((dc.email_env || "JIRA_EMAIL") !== "JIRA_EMAIL" ||
        (dc.api_token_env || "JIRA_API_TOKEN") !== "JIRA_API_TOKEN")
    ) {
      jira.credentials = {
        ...oc,
        ...(dc.email_env ? { email_env: dc.email_env } : {}),
        ...(dc.api_token_env ? { api_token_env: dc.api_token_env } : {}),
      };
      changed = true;
      report.changes.push(
        `jira.credentials = ${jira.credentials.email_env} / ${jira.credentials.api_token_env} (names only)`,
      );
    }
    if (changed && !dryRun) writeYaml(integ, cfg);
  }
  if (!report.changes.length)
    report.changes.push(
      "nothing to copy (jira settings already set, or none in the dev workspace)",
    );
  // Credentials are never copied or read from files; only whether they are set in this environment.
  report.credentials = Object.fromEntries(
    ["JIRA_EMAIL", "JIRA_API_TOKEN"].map((n) => [
      n,
      process.env[n] ? "set" : "missing",
    ]),
  );
  console.log(JSON.stringify(report));
  process.exit(0);
}

// .mcp.json handling around `npx playwright init-agents --loop=claude` (it writes .mcp.json from scratch).
if (flag("--mcp-backup") || flag("--mcp-merge")) {
  const mcp = path.join(target, ".mcp.json"),
    bak = path.join(target, MCP_BACKUP);
  const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  if (flag("--mcp-backup")) {
    if (!fs.existsSync(mcp)) {
      console.log("No .mcp.json yet; nothing to back up.");
      process.exit(0);
    }
    if (!dryRun) fs.copyFileSync(mcp, bak);
    console.log(
      `${dryRun ? "[dry run] " : ""}Saved .mcp.json to ${MCP_BACKUP}.`,
    );
    process.exit(0);
  }
  if (!fs.existsSync(bak)) {
    console.log("No saved .mcp.json; nothing to merge.");
    process.exit(0);
  }
  const saved = read(bak);
  const now = fs.existsSync(mcp) ? read(mcp) : { mcpServers: {} };
  const merged = {
    ...saved,
    ...now,
    mcpServers: { ...(saved.mcpServers || {}), ...(now.mcpServers || {}) },
  };
  if (!dryRun) {
    fs.writeFileSync(mcp, JSON.stringify(merged, null, 2) + "\n");
    fs.unlinkSync(bak);
  }
  console.log(
    `${dryRun ? "[dry run] " : ""}.mcp.json servers: ${Object.keys(merged.mcpServers).join(", ")}`,
  );
  process.exit(0);
}

if (only && !PARTS[only]) {
  console.error(`--only must be one of: ${Object.keys(PARTS).join(", ")}`);
  process.exit(2);
}
if (!fs.existsSync(TEMPLATES)) {
  console.error(`Templates not found at ${TEMPLATES}`);
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

function write(dest, content, bucket) {
  report[bucket].push(path.relative(target, dest));
  if (dryRun) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

// In the shared aisdlc repo (config/workspace.yaml kind "aisdlc") the workspace files belong to /aisdlc:init. QA adds only
// its test scaffold and environments.yaml; the QA tests stay local (the shared .gitignore already ignores them).
let sharedRepo = false;
try {
  sharedRepo =
    (
      JSON.parse(
        fs
          .readFileSync(path.join(target, "config", "workspace.yaml"), "utf8")
          .replace(/^\s*#.*$/gm, ""),
      ).workspace || {}
    ).kind === "aisdlc";
} catch {
  /* not a shared repo */
}
const SHARED_OWNS = new Set([
  ".gitignore",
  "CLAUDE.md",
  ".claude/settings.json",
  "config/workspace.yaml",
  "config/repositories.yaml",
  "config/integrations.yaml",
  "logs/.gitkeep",
  "tasks/.gitkeep",
]);

for (const [name, dir] of Object.entries(PARTS)) {
  if (only && only !== name) continue;
  const root = path.join(TEMPLATES, dir);
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const rel = path.relative(root, file);
    if (sharedRepo && SHARED_OWNS.has(rel.replace(/\\/g, "/"))) {
      report.skipped.push(`${rel} (owned by /aisdlc:init in the shared repo)`);
      continue;
    }
    const dest = path.join(target, rel);
    const content = fs.readFileSync(file);
    if (!fs.existsSync(dest)) {
      write(dest, content, "created");
    } else if (rel.replace(/\\/g, "/") === ".claude/settings.json") {
      // Additive merge: add our permission rules and enabled plugin, keep everything already there.
      const have = readJson(dest),
        want = JSON.parse(content.toString());
      const merged = {
        ...have,
        permissions: { ...(have.permissions || {}) },
        enabledPlugins: {
          ...(want.enabledPlugins || {}),
          ...(have.enabledPlugins || {}),
        },
      };
      for (const k of ["allow", "deny", "ask"]) {
        const list = [
          ...new Set([
            ...((have.permissions || {})[k] || []),
            ...((want.permissions || {})[k] || []),
          ]),
        ];
        if (list.length) merged.permissions[k] = list;
      }
      if (JSON.stringify(merged) !== JSON.stringify(have))
        write(dest, JSON.stringify(merged, null, 2) + "\n", "merged");
      else report.skipped.push(`${rel} (already up to date)`);
    } else if (path.basename(rel) === ".gitignore") {
      const have = fs.readFileSync(dest, "utf8");
      const lines = have.split(/\r?\n/);
      const missing = content
        .toString()
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.startsWith("#") && !lines.includes(l));
      if (missing.length)
        write(
          dest,
          have.trimEnd() + "\n\n# aisdlc-qa\n" + missing.join("\n") + "\n",
          "merged",
        );
      else report.skipped.push(`${rel} (already up to date)`);
    } else if (force && !content.equals(fs.readFileSync(dest))) {
      write(dest, content, "overwritten");
    } else {
      report.skipped.push(rel);
    }
  }
}

console.log(`${dryRun ? "[dry run] " : ""}aisdlc-qa init -> ${target}`);
for (const [k, v] of Object.entries(report))
  if (v.length) console.log(`${k} (${v.length}):\n  ${v.join("\n  ")}`);
console.log(
  "\nNext: fill in config/environments.yaml (QA/UAT base URLs, login) and config/integrations.yaml (Jira site URL).",
);
console.log(
  "Then, in this folder: npm install; npx playwright install chromium; npx playwright init-agents --loop=claude (around it: --mcp-backup / --mcp-merge).",
);
console.log(
  "Test a ticket: start Claude Code in this folder, then /aisdlc-qa:test <TICKET>.",
);
