#!/usr/bin/env node
// Kiro PreToolUse gate for the aisdlc DEV lifecycle. Adapted from plugins/aisdlc-dev/hooks/pre-tool-policy.js
// to Kiro's hook contract (verified empirically):
//   - tool_name is a Kiro tool: file writes are fs_write | str_replace | fs_append (path in tool_input.path);
//     shell is execute_pwsh (command in tool_input.command).
//   - Exit 2 with a reason on stderr blocks the tool call (Kiro shows the reason and does NOT run the tool).
//   - Resolves the plugin core from AI_SDLC_PLUGIN_HOME (set by the user; see kiro/README.md).
// Does nothing outside an aisdlc dev workspace.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync, execFileSync } = require("child_process");

const HOME = process.env.AI_SDLC_PLUGIN_HOME;
if (!HOME) process.exit(0); // not configured: do not interfere
const DEV = path.join(HOME, "plugins", "aisdlc-dev");
let root, repoPaths, yaml, envBr;
try {
  root = require(path.join(DEV, "scripts", "lib", "root.js"));
  repoPaths = require(path.join(DEV, "scripts", "lib", "repo-paths.js"));
  yaml = require(path.join(DEV, "scripts", "lib", "yaml.js"));
  envBr = require(path.join(DEV, "scripts", "lib", "env-branches.js"));
} catch { process.exit(0); } // core not found: do not interfere

const ROOT = root.resolveRoot();
if (!ROOT) process.exit(0); // not inside an aisdlc workspace

const TYPES = yaml.readYaml(root.configPath(ROOT, "task-types.yaml", DEV), {});
const REPOS = (yaml.readYaml(path.join(ROOT, "config", "repositories.yaml"), { repositories: {} }).repositories) || {};
const POLICIES = yaml.readYaml(root.configPath(ROOT, "policies.yaml", DEV), {});
const { resolveRepoPath } = repoPaths;
const norm = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
const repoRoots = Object.entries(REPOS)
  .map(([name, r]) => ({ name, kind: r.kind, loc: resolveRepoPath(name, r, ROOT) }))
  .filter((r) => r.loc)
  .map((r) => ({ name: r.name, kind: r.kind, root: norm(r.loc.path), dir: r.loc.path }));
// A ticket's environment branches (<TICKET>-<env>), which promote creates to resolve conflicts with a target branch.
const HOSTING = envBr.gitHostingConfig(ROOT);
const BASE = envBr.baseBranch(ROOT);
const envBranchesOf = (ticket) => envBr.envBranches(HOSTING, ticket).map((e) => e.branch);
const repoOf = (p) => repoRoots.find((r) => norm(p) === r.root || norm(p).startsWith(r.root + "/"));

function block(reason) { process.stderr.write("BLOCKED\nReason: " + reason + "\n"); process.exit(2); }

function activeTasks() {
  const dir = path.join(ROOT, "tasks");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((t) => yaml.readYaml(path.join(dir, t, "task.yaml"), null))
    .filter((t) => t && !["COMPLETED", "CANCELLED"].includes(t.task.status));
}

function specHash(id) {
  const f = path.join(ROOT, "tasks", id, "specification.md");
  return fs.existsSync(f) ? "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex") : null;
}

// Conflict resolution on a ticket's environment branch: on <TICKET>-<env>, a merge in progress (MERGE_HEAD), and a task
// in PR_CREATED (source edits are otherwise blocked from there; still allowed at COMMITTED). Nothing else on that
// branch, and nothing on the ticket branch itself, gets this.
function envBranchMergeAllowed(repo) {
  const r = repoRoots.find((x) => x.name === repo);
  if (!r) return false;
  const g = (...args) => execFileSync("git", args, { cwd: r.dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  let parsed;
  try {
    parsed = envBr.parseEnvBranch(HOSTING, g("rev-parse", "--abbrev-ref", "HEAD"));
    if (!parsed) return false;
    // The merge in progress must be one promote starts: the target branch into the env branch, or the task branch into it.
    const head = g("rev-parse", "-q", "--verify", "MERGE_HEAD");
    const sameCommit = (ref) => { try { return g("rev-parse", "-q", "--verify", `${ref}^{commit}`) === head; } catch { return false; } };
    if (![`origin/${parsed.target}`, parsed.ticket].some(sameCommit)) return false;
  } catch { return false; }
  return activeTasks().some((t) => t.task.id === parsed.ticket && (t.repositories || []).includes(repo) && t.task.status === "PR_CREATED");
}

// Post-release sync (/aisdlc-dev:sync-main) is repository maintenance, not ticket work, so there is no task to
// check. The same narrow rule applies as for environment branches: the repo is on a sync branch
// (<base>-<env>-<date>) and the merge in progress is exactly the one the skill starts, the target branch.
function syncBranchMergeAllowed(repo) {
  const r = repoRoots.find((x) => x.name === repo);
  if (!r) return false;
  const g = (...args) => execFileSync("git", args, { cwd: r.dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const parsed = envBr.parseSyncBranch(HOSTING, BASE, g("rev-parse", "--abbrev-ref", "HEAD"));
    if (!parsed) return false;
    return g("rev-parse", "-q", "--verify", `origin/${parsed.target}^{commit}`) === g("rev-parse", "-q", "--verify", "MERGE_HEAD");
  } catch { return false; }
}

function sourceWriteReason(repo) {
  const reason = taskSourceWriteReason(repo);
  return reason && (envBranchMergeAllowed(repo) || syncBranchMergeAllowed(repo)) ? null : reason;
}

// A task that spans two or more repositories (or has trace_required set because a shared contract changes) must have a
// completed cross-repository trace before source is edited (policies.yaml require_trace_for_cross_repo, honoured only
// when exactly true so a workspace policies.yaml written before the key existed is unaffected).
function traceReason(t) {
  const family = (t.task.lifecycle || t.task.type) === "bug" ? "bug" : "feature";
  if ((POLICIES[family] || {}).require_trace_for_cross_repo !== true) return null;
  const n = (t.repositories || []).length;
  if (n < 2 && t.trace_required !== true) return null;
  const done = t.workflow && t.workflow.trace === "completed" && fs.existsSync(path.join(ROOT, "tasks", t.task.id, "trace.md"));
  return done ? null : `Task ${t.task.id} ${n >= 2 ? `spans ${n} repositories` : "changes a shared contract"} and has no completed cross-repository trace; run the cross-repo-trace skill (it writes tasks/${t.task.id}/trace.md) before editing source.`;
}

function taskSourceWriteReason(repo) {
  const tasks = activeTasks().filter((t) => (t.repositories || []).includes(repo));
  if (!tasks.length) return `No active aisdlc task lists repository '${repo}'.`;
  let reason = "Feature specification has not been approved.";
  for (const t of tasks) {
    const lc = TYPES[t.task.lifecycle || t.task.type] || TYPES.feature;
    if (!lc.source_edit_min_state) { reason = `${t.task.type} tasks are read-only.`; continue; }
    const eff = t.task.status === "CI_FAILED" ? "IMPLEMENTING" : t.task.status;
    const st = lc.states, i = st.indexOf(eff);
    if (i < st.indexOf(lc.source_edit_min_state) || i > st.indexOf(lc.source_edit_max_state)) {
      reason = `Task ${t.task.id} is in ${t.task.status}; source edits are not allowed in this state.`; continue;
    }
    if (t.task.type !== "bug") {
      const a = t.approvals.specification;
      if (a.status !== "approved") continue;
      if (a.spec_hash !== specHash(t.task.id)) { reason = `Specification for ${t.task.id} changed after approval; reapproval required.`; continue; }
    }
    const traceBlock = traceReason(t);
    if (traceBlock) { reason = traceBlock; continue; }
    return null;
  }
  return reason;
}

// Commands the workspace marks as touching real systems (config/workspace.yaml "real_systems"): not blocked, but the
// developer is asked to confirm, with the rule's reason. A malformed list asks about every command rather than
// quietly switching the rule off. Output format: PreToolUse "ask" (exit 0 with a hookSpecificOutput decision).
const realSystems = require(path.join(DEV, "scripts", "lib", "real-systems.js"));
const REAL_SYSTEMS = (yaml.readYaml(path.join(ROOT, "config", "workspace.yaml"), {}) || {}).real_systems;
function askReasons(cmd, cwd, posix) {
  const problems = realSystems.validate(REAL_SYSTEMS);
  if (problems.length) return [`config/workspace.yaml real_systems is invalid (${problems.join("; ")}); fix it so the list applies.`];
  const hits = realSystems.check(cmd, REAL_SYSTEMS, { posix, cwd, repoOf: (dir) => (repoOf(dir) || {}).name || null });
  return [...new Set(hits.map((h) => `${h.rule.reason} (matches real_systems "${h.rule.command}")`))];
}
function ask(reasons) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reasons.join(" | ") } }) + "\n");
  process.exit(0);
}

const PROTECTED_ARTIFACTS = ["jira.md","requirements.md","impact-analysis.md","knowledge-manifest.yaml","specification.md","implementation-plan.md","validation.md","code-review.md","documentation.md","trace.md","repository-preparation.yaml","knowledge-consolidation.yaml","release.yaml"];

function deletionAllowed(ticket) {
  const t = yaml.readYaml(path.join(ROOT, "tasks", ticket, "task.yaml"), null);
  const k = t && t.knowledge_consolidation;
  return !!(t && t.task.status === "KNOWLEDGE_CONSOLIDATED" && k && k.consolidation_commit && k.validated === true && (k.unresolved_reconciliation || 0) === 0);
}

let ev; try { ev = JSON.parse(fs.readFileSync(0, "utf8")); } catch { process.exit(0); }
const tool = ev.tool_name, input = ev.tool_input || {};
const cwd = ev.cwd || process.cwd();

// File-writing tools: path is in tool_input.path.
if (["fs_write", "str_replace", "fs_append"].includes(tool)) {
  const target = path.resolve(cwd, input.path || "");
  const n = norm(target);
  if (/\/tasks\/[^/]+\/task\.yaml$/.test(n)) block("task.yaml may only be changed through scripts/state/aisdlc-state.js.");
  if (/\/\.git\//.test(n + "/")) block(".git is protected.");
  if (/(^|\/)(credentials|secrets)\//.test(n) || /\.(pem|key)$/.test(n)) block("Protected path.");
  const repo = repoOf(target);
  if (repo) { const r = sourceWriteReason(repo.name); if (r) block(r); }
  process.exit(0);
}

// Shell tool: command is in tool_input.command.
if (tool === "execute_pwsh") {
  const cmd = String(input.command || "");
  const lc = cmd.toLowerCase();

  if (/git\s+push\b.*(--force\b|--force-with-lease|\s-f\b|\s\+\S+)/.test(cmd)) block("Force push is disabled.");
  if (/git\s+(branch\s+-[dD]\s+main|push\s+\S+\s+:main|push\s+\S+\s+--delete\s+main)/.test(cmd)) block("Deleting main is disabled.");
  if (/git\s+reset\s+--hard/.test(cmd) && /\bmain\b/.test(cmd)) block("Destructive reset on main is disabled.");
  if (/git\s+(filter-branch|rebase\s+.*--root)/.test(cmd)) block("History rewrite is disabled.");
  if (/(printenv|\benv\b\s*$|get-childitem\s+env:|cat\s+.*\.(pem|key)\b|aws\s+secretsmanager\s+get-secret-value)/i.test(cmd)) block("Credential/secret extraction is disabled.");
  if (/\b(echo|write-output|write-host|printf|cat|type|out-file|set-content)\b[^|;&\n]*(BITBUCKET_API_TOKEN|JIRA_API_TOKEN)/i.test(cmd) || /^\s*\$env:(BITBUCKET_API_TOKEN|JIRA_API_TOKEN)\s*$/i.test(cmd))
    block("Integration credentials must not be printed or written; check only whether they are set.");
  if (/\b(curl|wget|invoke-restmethod|invoke-webrequest|irm|iwr)\b[^|;&\n]*(atlassian\.net|\/rest\/api\/)/i.test(cmd))
    block("Call Jira through scripts/jira/jira-fetch.js, not ad-hoc HTTP.");

  if (/task\.yaml/.test(cmd) && /(>|sed\s+-i|set-content|out-file|add-content|tee\b|rm\b|remove-item|mv\b|move-item)/i.test(cmd) && !/aisdlc-state\.js/.test(cmd))
    block("task.yaml may only be changed through scripts/state/aisdlc-state.js.");

  if (/(\brm\b|remove-item|\bdel\b|git\s+rm)/i.test(cmd)) {
    for (const m of cmd.matchAll(/tasks[\\/]([A-Z][A-Z0-9]*-\d+)[\\/]?([\w.\-]*)/g)) {
      if ((!m[2] || PROTECTED_ARTIFACTS.includes(m[2])) && !deletionAllowed(m[1]))
        block(`Temporary artifacts of ${m[1]} may be deleted only after validated product-knowledge consolidation.`);
    }
  }

  if (/git\s+(-C\s+\S+\s+)?commit\b/.test(cmd)) {
    const msgs = [...cmd.matchAll(/-m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]);
    let branch = "";
    const dir = (cmd.match(/-C\s+("[^"]+"|\S+)/) || [])[1]?.replace(/"/g, "") || cwd;
    try { branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: dir, encoding: "utf8" }).trim(); } catch {}
    // Post-release sync is not ticket work: its branch names the base and target, so it has its own message rule.
    const syncParsed = envBr.parseSyncBranch(HOSTING, BASE, branch);
    if (syncParsed) {
      if (msgs.length !== 1 || msgs[0].includes("\n")) block("Commit must have exactly one single-line -m message and no body.");
      const prefix = `Sync ${BASE} into ${syncParsed.target}: `;
      if (!msgs[0].startsWith(prefix) || !msgs[0].slice(prefix.length).trim())
        block(`On ${branch}, the commit message must start with '${prefix}' followed by a summary.`);
    } else {
      const tasks = activeTasks();
      if (!tasks.length) block("No active aisdlc task; commits are not allowed.");
      if (msgs.length !== 1 || msgs[0].includes("\n")) block("Commit must have exactly one single-line -m message and no body.");
      const ids = tasks.map((t) => t.task.id);
      const m = msgs[0].match(/^([A-Z][A-Z0-9]*-\d+): (\S.*)$/);
      if (!m || !ids.includes(m[1])) block(`Commit message must match '<ticket-number>: <changes summary>' for an active task (${ids.join(", ")}).`);
      // The task branch is exactly the ticket; the one other branch its commits may land on is an environment branch.
      if (branch !== m[1] && !envBranchesOf(m[1]).includes(branch))
        block(`Active aisdlc task requires branch ${m[1]}${envBranchesOf(m[1]).length ? ` (or one of its environment branches: ${envBranchesOf(m[1]).join(", ")})` : ""} (current: ${branch || "unknown"}).`);
    }
  }
  const isStateTool = /aisdlc-state\.js/.test(cmd);
  const writeish = /(>>?\s|sed\s+-i|set-content|add-content|out-file|\btee\b|new-item|copy-item|move-item|\bmv\b|\bcp\b|git\s+(apply|checkout\s+--|restore))/i;
  if (!isStateTool && writeish.test(cmd)) {
    for (const r of repoRoots) {
      const base = path.basename(r.root);
      const mentions = lc.replace(/\\/g, "/").includes(r.root) || (cwd && repoOf(cwd)?.name === r.name);
      if (mentions || lc.includes(base)) {
        const reason = sourceWriteReason(r.name);
        if (reason) block(reason);
      }
    }
  }

  // Everything above only blocks. Last: commands marked as touching real systems ask first.
  const asks = askReasons(cmd, cwd, false);
  if (asks.length) ask(asks);
}
process.exit(0);
