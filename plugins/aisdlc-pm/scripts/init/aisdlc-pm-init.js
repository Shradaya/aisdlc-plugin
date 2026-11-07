#!/usr/bin/env node
// Scaffold a PM (project-manager) workspace into a folder: the workspace itself (config/, tasks/, logs/, CLAUDE.md,
// claude.env.example, .gitignore, .claude/settings.json). The PM drafts requirements and acceptance criteria here.
// Usage:
//   node aisdlc-pm-init.js [target-dir] [--only workspace] [--dry-run] [--force]
//   node aisdlc-pm-init.js [target-dir] --from-dev [dev-workspace] [--dry-run]
//        reuse Jira connection settings from an aisdlc-dev workspace's config/integrations.yaml (found next to or
//        above the target when no path is given): jira.base_url, auth_scheme, acceptance_criteria_field and
//        credential variable NAMES only, each only when ours is unset or default. Never reads .env, claude.env or
//        .mcp.json; never copies values; never turns a write switch on (template switches stay false).
// Templates ship in <plugin>/templates/workspace. Existing files are never overwritten unless --force; .gitignore is
// merged line by line (missing lines appended) and .claude/settings.json additively. Never runs npm; never creates
// claude.env, .env, .mcp.json or node_modules.
const fs = require("fs");
const path = require("path");

const TEMPLATES = path.resolve(__dirname, "..", "..", "templates");
const PARTS = { workspace: "workspace" };
const SKIP = new Set(["node_modules"]);

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

// Reuse Jira settings from an aisdlc-dev workspace (names and non-secret connection settings only).
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
  // Jira is reached over REST (scripts/jira/jira-pm.js), so only connection settings are copied, from the dev
  // workspace's own config/integrations.yaml; no MCP server, .env or claude.env is read or copied.
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
    // The write switches are NEVER copied on as true: they stay whatever the template shipped (false).
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
          have.trimEnd() + "\n\n# aisdlc-pm\n" + missing.join("\n") + "\n",
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

console.log(`${dryRun ? "[dry run] " : ""}aisdlc-pm init -> ${target}`);
for (const [k, v] of Object.entries(report))
  if (v.length) console.log(`${k} (${v.length}):\n  ${v.join("\n  ")}`);
console.log(
  "\nNext: set jira.base_url in config/integrations.yaml; set JIRA_EMAIL / JIRA_API_TOKEN as environment variables (never in a file).",
);
console.log(
  "Turn on jira.write.update_description (and the AC-field switch) only when your token has write:issue:jira, after reviewing a preview.",
);
console.log(
  "Link to the server: /aisdlc-pm:server init --server <url> --project <name>. Then restart Claude Code.",
);
console.log(
  "Draft a ticket: start Claude Code in this folder, or set AISDLC_ROOT to it, then /aisdlc-pm:requirements <TICKET>.",
);
