#!/usr/bin/env node
// PreToolUse enforcement hook (spec §19, §29.3, §30.3-30.5, §42.11).
// Reads the hook event JSON on stdin; exits 2 with a reason on stderr to block.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync, execFileSync } = require("child_process");

const ROOT = require("../scripts/lib/root").resolveRoot();
if (!ROOT) process.exit(0); // installed user-wide: do nothing outside an aisdlc workspace
const KIND = require("../scripts/lib/root").workspaceKind(ROOT);
if (KIND && KIND !== "dev") process.exit(0); // another aisdlc plugin's workspace (config/workspace.yaml "kind")
const readJson = (f, d) => {
  try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^\s*#.*$/gm, "")); } catch { return d; }
};
const TYPES = readJson(require("../scripts/lib/root").configPath(ROOT, "task-types.yaml"), {});
const REPOS = readJson(path.join(ROOT, "config", "repositories.yaml"), { repositories: {} }).repositories || {};

const { resolveRepoPath } = require("../scripts/lib/repo-paths");
const norm = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
const repoRoots = Object.entries(REPOS)
  .map(([name, r]) => ({ name, loc: resolveRepoPath(name, r, ROOT) }))
  .filter((r) => r.loc)
  .map((r) => ({ name: r.name, root: norm(r.loc.path), dir: r.loc.path }));
// A ticket's environment branches (<TICKET>-<env>), which /aisdlc-dev:promote creates to resolve conflicts with a target.
const envBr = require("../scripts/lib/env-branches");
const HOSTING = envBr.gitHostingConfig(ROOT);
const BASE = envBr.baseBranch(ROOT);
const envBranchesOf = (ticket) => envBr.envBranches(HOSTING, ticket).map((e) => e.branch);
const repoOf = (p) => repoRoots.find((r) => norm(p) === r.root || norm(p).startsWith(r.root + "/"));

function block(reason) { process.stderr.write("BLOCKED\nReason: " + reason + "\n"); process.exit(2); }

function activeTasks() {
  const dir = path.join(ROOT, "tasks");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((t) => readJson(path.join(dir, t, "task.yaml"), null))
    .filter((t) => t && !["COMPLETED", "CANCELLED"].includes(t.task.status));
}

function specHash(id) {
  const f = path.join(ROOT, "tasks", id, "specification.md");
  return fs.existsSync(f) ? "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex") : null;
}

// Conflict resolution on a ticket's environment branch: the repo is on <TICKET>-<env>, a merge is in progress
// (MERGE_HEAD), and the task is in PR_CREATED, where source edits are otherwise blocked (they are still allowed at
// COMMITTED, so nothing is needed there). Nothing else on that branch, and nothing on the ticket branch itself, gets
// this allowance.
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

// May application source in `repo` be modified right now? Returns a block reason or null.
function sourceWriteReason(repo) {
  const reason = taskSourceWriteReason(repo);
  return reason && (envBranchMergeAllowed(repo) || syncBranchMergeAllowed(repo)) ? null : reason;
}

function taskSourceWriteReason(repo) {
  const tasks = activeTasks().filter((t) => (t.repositories || []).includes(repo));
  if (!tasks.length) return `No active aisdlc task lists repository '${repo}'.`;
  let reason = "Feature specification has not been approved.";
  for (const t of tasks) {
    const lc = TYPES[t.task.lifecycle || t.task.type] || TYPES.feature;
    if (!lc.source_edit_min_state) { reason = `${t.task.type} tasks are read-only.`; continue; }
    // CI_FAILED fix cycles follow the same rules as normal work (spec §40); other failure states stay blocked.
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
    return null;
  }
  return reason;
}

const PROTECTED_ARTIFACTS = ["jira.md","requirements.md","impact-analysis.md","knowledge-manifest.yaml","specification.md","implementation-plan.md","validation.md","code-review.md","documentation.md","repository-preparation.yaml","knowledge-consolidation.yaml","release.yaml"];

function deletionAllowed(ticket) {
  const t = readJson(path.join(ROOT, "tasks", ticket, "task.yaml"), null);
  const k = t && t.knowledge_consolidation;
  return !!(t && t.task.status === "KNOWLEDGE_CONSOLIDATED" && k && k.consolidation_commit && k.validated === true && (k.unresolved_reconciliation || 0) === 0);
}

const raw = fs.readFileSync(0, "utf8");
let ev; try { ev = JSON.parse(raw); } catch { process.exit(0); }
const tool = ev.tool_name, input = ev.tool_input || {};
const cwd = ev.cwd || process.cwd();

if (["Write", "Edit", "NotebookEdit", "MultiEdit"].includes(tool)) {
  const target = path.resolve(cwd, input.file_path || input.notebook_path || "");
  const n = norm(target);
  if (/\/tasks\/[^/]+\/task\.yaml$/.test(n)) block("task.yaml may only be changed through scripts/state/aisdlc-state.js.");
  if (/\/\.git\//.test(n + "/") ) block(".git is protected.");
  if (/(^|\/)(credentials|secrets)\//.test(n) || /\.(pem|key)$/.test(n)) block("Protected path.");
  const repo = repoOf(target);
  if (repo) { const r = sourceWriteReason(repo.name); if (r) block(r); }
  process.exit(0);
}

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(input.command || "");
  const lc = cmd.toLowerCase();

  // dangerous operations (§30.5)
  if (/git\s+push\b.*(--force\b|--force-with-lease|\s-f\b|\s\+\S+)/.test(cmd)) block("Force push is disabled.");
  if (/git\s+(branch\s+-[dD]\s+main|push\s+\S+\s+:main|push\s+\S+\s+--delete\s+main)/.test(cmd)) block("Deleting main is disabled.");
  if (/git\s+reset\s+--hard/.test(cmd) && /\bmain\b/.test(cmd)) block("Destructive reset on main is disabled.");
  if (/git\s+(filter-branch|rebase\s+.*--root|commit\s+.*--amend\s+.*--no-edit\s+.*push)/.test(cmd)) block("History rewrite is disabled.");
  if (/(printenv|\benv\b\s*$|get-childitem\s+env:|cat\s+.*\.(pem|key)\b|aws\s+secretsmanager\s+get-secret-value)/i.test(cmd)) block("Credential/secret extraction is disabled.");

  // never print integration credentials (presence checks such as `if ($env:X)` are fine)
  if (/\b(echo|write-output|write-host|printf|cat|type|out-file|set-content)\b[^|;&\n]*(BITBUCKET_API_TOKEN|JIRA_API_TOKEN)/i.test(cmd) || /^\s*\$env:(BITBUCKET_API_TOKEN|JIRA_API_TOKEN)\s*$/i.test(cmd))
    block("Integration credentials must not be printed or written; check only whether they are set.");

  // Jira is read only through the REST helper, which keeps credentials out of command lines and output
  if (/\b(curl|wget|invoke-restmethod|invoke-webrequest|irm|iwr)\b[^|;&\n]*(atlassian\.net|\/rest\/api\/)/i.test(cmd))
    block("Call Jira through scripts/jira/jira-fetch.js, not ad-hoc HTTP.");

  // task state integrity
  if (/task\.yaml/.test(cmd) && /(>|sed\s+-i|set-content|out-file|add-content|tee\b|rm\b|remove-item|mv\b|move-item)/i.test(cmd) && !/aisdlc-state\.js/.test(cmd))
    block("task.yaml may only be changed through scripts/state/aisdlc-state.js.");

  // temporary-artifact deletion (§42.11)
  if (/(\brm\b|remove-item|\bdel\b|git\s+rm)/i.test(cmd)) {
    for (const m of cmd.matchAll(/tasks[\\/]([A-Z][A-Z0-9]*-\d+)[\\/]?([\w.\-]*)/g)) {
      if ((!m[2] || PROTECTED_ARTIFACTS.includes(m[2])) && !deletionAllowed(m[1]))
        block(`Temporary artifacts of ${m[1]} may be deleted only after validated product-knowledge consolidation.`);
    }
  }

  // git commit policy (§29.3, §30.4)
  if (/git\s+(-C\s+\S+\s+)?commit\b/.test(cmd)) {
    const msgs = [...cmd.matchAll(/-m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]);
    let branch = "";
    const dir = (cmd.match(/-C\s+("[^"]+"|\S+)/) || [])[1]?.replace(/"/g, "") || cwd;
    try { branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: dir, encoding: "utf8" }).trim(); } catch {}
    // Post-release sync (/aisdlc-dev:sync-main) is not ticket work: its branch names the base and target, not a
    // ticket, so it follows its own message rule instead of "<ticket>: <summary>".
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
      // The task branch is exactly the ticket; the one other branch a ticket's commits may land on is its environment
      // branch (<TICKET>-<env>), which /aisdlc-dev:promote creates to resolve conflicts with a target branch.
      if (branch !== m[1] && !(envBranchesOf(m[1]).includes(branch)))
        block(`Active aisdlc task requires branch ${m[1]}${envBranchesOf(m[1]).length ? ` (or one of its environment branches: ${envBranchesOf(m[1]).join(", ")})` : ""} (current: ${branch || "unknown"}).`);
    }
  }

  // shell writes into registered repositories (bypass guard for the implementation gate).
  // aisdlc-state.js is the trusted state mutator; naming a repository in its arguments is
  // not a source write, so exempt it to avoid a chicken-and-egg block on `set <t> repositories`.
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
}
process.exit(0);
