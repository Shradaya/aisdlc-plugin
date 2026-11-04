#!/usr/bin/env node
// Keep plugin versions and changelogs honest.
// Usage: node scripts/version-check.js [--base <git-ref>] [--root <repo>]
// For every plugins/<name>/:
//   - .claude-plugin/plugin.json must have a MAJOR.MINOR.PATCH version
//   - CHANGELOG.md must exist and its newest "## X.Y.Z" heading must equal that version
// With --base <ref>: if the plugin's behavior changed since the merge-base with <ref>, its version must be higher
// than at that base. Not behavior (no bump needed): README.md, CHANGELOG.md, scripts/validation/**, templates/web/docs/**.
// Versions: major when people must act, minor for something new, patch for fixes.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const EXEMPT = [/^README\.md$/, /^CHANGELOG\.md$/, /^scripts\/validation\//, /^templates\/web\/docs\//];

const cmp = (a, b) => {
  const x = SEMVER.exec(a), y = SEMVER.exec(b);
  for (let i = 1; i <= 3; i++) if (+x[i] !== +y[i]) return +x[i] < +y[i] ? -1 : 1;
  return 0;
};
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function changelogTop(file) {
  const m = /^##\s+v?(\d+\.\d+\.\d+)\b/m.exec(fs.readFileSync(file, "utf8"));
  return m ? m[1] : null;
}

function check(root, base) {
  const problems = [];
  const pluginsDir = path.join(root, "plugins");
  const names = fs.existsSync(pluginsDir)
    ? fs.readdirSync(pluginsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : [];
  if (!names.length) problems.push("no plugins found under plugins/");
  let changed = null;
  let mergeBase = null;
  if (base) {
    try {
      mergeBase = git(root, "merge-base", base, "HEAD").trim();
      changed = git(root, "diff", "--name-only", mergeBase, "HEAD").split("\n").filter(Boolean);
    } catch (e) {
      problems.push(`cannot compare with base "${base}": ${String(e.stderr || e.message).trim()}`);
    }
  }
  for (const name of names) {
    const pj = path.join(pluginsDir, name, ".claude-plugin", "plugin.json");
    let version;
    try { version = readJson(pj).version; } catch { problems.push(`${name}: cannot read .claude-plugin/plugin.json`); continue; }
    if (!SEMVER.test(String(version))) { problems.push(`${name}: version "${version}" is not MAJOR.MINOR.PATCH`); continue; }
    const cl = path.join(pluginsDir, name, "CHANGELOG.md");
    if (!fs.existsSync(cl)) problems.push(`${name}: CHANGELOG.md is missing`);
    else {
      const top = changelogTop(cl);
      if (top !== version) problems.push(`${name}: plugin.json is ${version} but the newest CHANGELOG.md heading is ${top ? top : "missing"}`);
    }
    if (changed) {
      const prefix = `plugins/${name}/`;
      const behavior = changed.filter((f) => f.startsWith(prefix) && !EXEMPT.some((re) => re.test(f.slice(prefix.length))));
      if (behavior.length) {
        let old = null;
        try { old = readJson_str(git(root, "show", `${mergeBase}:plugins/${name}/.claude-plugin/plugin.json`)).version; } catch {}
        if (old && SEMVER.test(old) && cmp(version, old) <= 0) {
          problems.push(`${name}: behavior changed (${behavior.length} file${behavior.length === 1 ? "" : "s"}, e.g. ${behavior[0]}) but version is still ${version} (base ${old}). Bump plugin.json and add a CHANGELOG.md entry.`);
        }
      }
    }
  }
  return problems;
}
function readJson_str(s) { return JSON.parse(s); }

module.exports = { check, cmp, changelogTop };

if (require.main === module) {
  const a = process.argv.slice(2);
  const opt = (n) => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
  const root = path.resolve(opt("--root") || path.join(__dirname, ".."));
  const base = opt("--base");
  const problems = check(root, base);
  if (problems.length) {
    console.error("version check failed:\n" + problems.map((p) => "  - " + p).join("\n"));
    process.exit(1);
  }
  console.log(`version check ok${base ? ` (against ${base})` : ""}`);
}
