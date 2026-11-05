#!/usr/bin/env node
// Install the aisdlc Kiro skills (and, by default, the enforcing gate hook) into a workspace's .kiro/ directory.
// Skills carry the lifecycle procedures; the gate hook is a PreToolUse hook that hard-blocks disallowed actions
// (source edits before spec approval, bad commit format/branch, force-push, secret leakage), verified against
// Kiro's hook contract (exit 2 on PreToolUse blocks the tool). The state CLI remains the backstop either way.
//
// Usage:
//   node kiro/install-kiro-skills.js <target-workspace> [--set dev|design|all] [--dry-run] [--force] [--no-hooks]
//
//   <target-workspace>  the workspace folder to install into (.kiro/skills/ and .kiro/hooks/ are written)
//   --set               which to install: dev (default), design, or all
//   --dry-run           print what would be written; write nothing
//   --force             overwrite existing skill/hook files (default: skip existing)
//   --no-hooks          install only the skills, not the gate hook (guidance-only, scope b)
//
// The skills invoke the plugin's Node CLIs via the AI_SDLC_PLUGIN_HOME environment variable. The gate hook is
// written with the resolved absolute path to its policy script, so it does not depend on env-var expansion at
// hook-run time (but the policy script itself still reads AI_SDLC_PLUGIN_HOME to find the plugin core).
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "skills");
const HOOK_SRC = path.join(__dirname, "hooks");
const PLUGIN_HOME = path.resolve(__dirname, "..");

// Gate hook per set: the policy script and the hook id written into .kiro/hooks/.
const HOOKS = {
  dev: { script: "dev-pre-tool-policy.js", id: "aisdlc-dev-gate", name: "aisdlc-dev gate",
    description: "Enforce aisdlc dev lifecycle gates: source edits only after spec approval, commit format/branch, no force-push or secret leakage." },
  design: { script: "design-pre-tool-policy.js", id: "aisdlc-design-gate", name: "aisdlc-design gate",
    description: "Enforce aisdlc design lifecycle gates: prototype edits from DESIGN_BRIEF, hash-pin after approval, commit format/branch, no force-push or secret leakage." },
};

// Which skill folders belong to which set. The shared reference goes with every set.
const SETS = {
  dev: ["aisdlc-dev-feature", "aisdlc-dev-bug", "aisdlc-dev-investigate", "aisdlc-dev-init", "aisdlc-dev-status", "aisdlc-dev-resume", "aisdlc-dev-add-repo", "aisdlc-dev-pr-review", "aisdlc-lifecycle-reference"],
  design: ["aisdlc-design-design", "aisdlc-design-init", "aisdlc-design-commit", "aisdlc-lifecycle-reference"],
};
SETS.all = [...new Set([...SETS.dev, ...SETS.design])];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--set");

const target = positional[0] ? path.resolve(positional[0]) : null;
const set = opt("--set") || "dev";
const dryRun = flag("--dry-run");
const force = flag("--force");
const noHooks = flag("--no-hooks");

if (!target) { console.error("usage: node kiro/install-kiro-skills.js <target-workspace> [--set dev|design|all] [--dry-run] [--force] [--no-hooks]"); process.exit(2); }
if (!SETS[set]) { console.error(`--set must be one of: ${Object.keys(SETS).join(", ")}`); process.exit(2); }
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) { console.error(`Target workspace does not exist: ${target}`); process.exit(2); }

const destRoot = path.join(target, ".kiro", "skills");
const hooksDest = path.join(target, ".kiro", "hooks");
const report = { created: [], overwritten: [], skipped: [] };

// Build the gate-hook JSON for a set, with the resolved absolute path to the policy script.
function hookJson(h) {
  const scriptPath = path.join(HOOK_SRC, h.script);
  return JSON.stringify({
    version: "v1",
    hooks: [{
      name: h.name,
      trigger: "PreToolUse",
      description: h.description,
      matcher: "fs_write|str_replace|fs_append|execute_pwsh",
      action: { type: "command", command: `node "${scriptPath}"` },
    }],
  }, null, 2) + "\n";
}

function writeHook(setName) {
  const h = HOOKS[setName];
  if (!h) return;
  const dest = path.join(hooksDest, h.id + ".json");
  const rel = path.relative(target, dest);
  if (fs.existsSync(dest) && !force) { report.skipped.push(rel); return; }
  report[fs.existsSync(dest) ? "overwritten" : "created"].push(rel);
  if (dryRun) return;
  fs.mkdirSync(hooksDest, { recursive: true });
  fs.writeFileSync(dest, hookJson(h));
}

function copyFile(src, dest, bucket) {
  report[bucket].push(path.relative(target, dest));
  if (dryRun) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

for (const skill of SETS[set]) {
  const srcDir = path.join(SRC, skill);
  if (!fs.existsSync(srcDir)) { console.error(`WARNING: skill not found in source: ${skill}`); continue; }
  for (const entry of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, entry);
    const dest = path.join(destRoot, skill, entry);
    if (fs.existsSync(dest) && !force) { report.skipped.push(path.relative(target, dest)); continue; }
    copyFile(src, dest, fs.existsSync(dest) ? "overwritten" : "created");
  }
}

// Install the gate hook(s) unless opted out. dev set -> dev gate; design set -> design gate; all -> both.
if (!noHooks) {
  const hookSets = set === "all" ? ["dev", "design"] : [set];
  for (const s of hookSets) writeHook(s);
}

console.log(`${dryRun ? "[dry run] " : ""}aisdlc Kiro skills${noHooks ? "" : " + gate hook"} (${set}) -> ${path.join(target, ".kiro")}`);
for (const [k, v] of Object.entries(report)) if (v.length) console.log(`${k} (${v.length}):\n  ${v.join("\n  ")}`);
if (!dryRun) {
  console.log("\nNext: set AI_SDLC_PLUGIN_HOME to the plugin repo root so the skills and gate hook can find the plugin core, e.g.:");
  console.log(`  setx AI_SDLC_PLUGIN_HOME "${PLUGIN_HOME}"   (Windows, new shells)`);
  console.log("Then reload Kiro so it picks up the new workspace skills and hooks.");
  if (!noHooks) console.log("The gate hook enforces the lifecycle (exit-2 PreToolUse block). Use --no-hooks for guidance-only.");
}
