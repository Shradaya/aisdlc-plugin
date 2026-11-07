#!/usr/bin/env node
// Kiro PreToolUse gate for the aisdlc DESIGN lifecycle. Adapted from plugins/aisdlc-design/hooks/pre-tool-policy.js
// to Kiro's hook contract: file writes are fs_write | str_replace | fs_append (path in tool_input.path); shell is
// execute_pwsh (command in tool_input.command). Exit 2 with a reason on stderr blocks the tool call.
// Resolves the plugin core from AI_SDLC_PLUGIN_HOME. Does nothing outside an aisdlc design workspace.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const HOME = process.env.AI_SDLC_PLUGIN_HOME;
if (!HOME) process.exit(0);
const DESIGN = path.join(HOME, "plugins", "aisdlc-design");
let root, yaml;
try {
  root = require(path.join(DESIGN, "scripts", "lib", "root.js"));
  yaml = require(path.join(DESIGN, "scripts", "lib", "yaml.js"));
} catch {
  process.exit(0);
}

const ROOT = root.resolveRoot();
if (!ROOT) process.exit(0);

const TYPES = yaml.readYaml(
  root.configPath(ROOT, "task-types.yaml", DESIGN),
  {},
);
const norm = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();

function block(reason) {
  process.stderr.write("BLOCKED\nReason: " + reason + "\n");
  process.exit(2);
}

function activeTasks() {
  const dir = path.join(ROOT, "tasks");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((t) => yaml.readYaml(path.join(dir, t, "task.yaml"), null))
    .filter((t) => t && !["COMPLETED", "CANCELLED"].includes(t.task.status));
}

function designHash(id) {
  const f = path.join(ROOT, "tasks", id, "design.md");
  return fs.existsSync(f)
    ? "sha256:" +
        crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")
    : null;
}

function designWriteReason(id) {
  const t = activeTasks().find((x) => x.task.id === id);
  if (!t) return `No active aisdlc design task for '${id}'.`;
  const lc = TYPES[t.task.lifecycle || t.task.type] || TYPES.design;
  const st = lc.states,
    i = st.indexOf(t.task.status);
  if (
    i < st.indexOf(lc.source_edit_min_state) ||
    i > st.indexOf(lc.source_edit_max_state)
  )
    return `Design task ${id} is in ${t.task.status}; prototype edits are not allowed in this state (allowed ${lc.source_edit_min_state}..${lc.source_edit_max_state}).`;
  if (i < st.indexOf("DESIGN_APPROVED")) return null; // author freely during drafting
  const a = t.approvals && t.approvals.design;
  if (!a || a.status !== "approved") return "Design has not been approved.";
  if (a.artifact_hash !== designHash(id))
    return `Design for ${id} changed after approval; reapproval required.`;
  return null;
}

const designTicketOf = (n) => {
  const m = n.match(/\/designs\/([a-z][a-z0-9]*-\d+)(\/|$)/);
  return m ? m[1].toUpperCase() : null;
};

let ev;
try {
  ev = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const tool = ev.tool_name,
  input = ev.tool_input || {};
const cwd = ev.cwd || process.cwd();

if (["fs_write", "str_replace", "fs_append"].includes(tool)) {
  const target = path.resolve(cwd, input.path || "");
  const n = norm(target);
  if (/\/tasks\/[^/]+\/task\.yaml$/.test(n))
    block(
      "task.yaml may only be changed through scripts/state/aisdlc-state.js.",
    );
  if (/\/\.git\//.test(n + "/")) block(".git is protected.");
  if (/(^|\/)(credentials|secrets)\//.test(n) || /\.(pem|key)$/.test(n))
    block("Protected path.");
  const ticket = designTicketOf(n);
  if (ticket && /\/designs\/[a-z][a-z0-9]*-\d+\/prototype\//.test(n)) {
    const r = designWriteReason(ticket);
    if (r) block(r);
  }
  process.exit(0);
}

if (tool === "execute_pwsh") {
  const cmd = String(input.command || "");

  if (/git\s+push\b.*(--force\b|--force-with-lease|\s-f\b|\s\+\S+)/.test(cmd))
    block("Force push is disabled.");
  if (
    /git\s+(branch\s+-[dD]\s+main|push\s+\S+\s+:main|push\s+\S+\s+--delete\s+main)/.test(
      cmd,
    )
  )
    block("Deleting main is disabled.");
  if (/git\s+reset\s+--hard/.test(cmd) && /\bmain\b/.test(cmd))
    block("Destructive reset on main is disabled.");
  if (/git\s+(filter-branch|rebase\s+.*--root)/.test(cmd))
    block("History rewrite is disabled.");
  if (
    /(printenv|\benv\b\s*$|get-childitem\s+env:|cat\s+.*\.(pem|key)\b|aws\s+secretsmanager\s+get-secret-value)/i.test(
      cmd,
    )
  )
    block("Credential/secret extraction is disabled.");
  if (
    /\b(echo|write-output|write-host|printf|cat|type|out-file|set-content)\b[^|;&\n]*(BITBUCKET_API_TOKEN|JIRA_API_TOKEN)/i.test(
      cmd,
    ) ||
    /^\s*\$env:(BITBUCKET_API_TOKEN|JIRA_API_TOKEN)\s*$/i.test(cmd)
  )
    block(
      "Integration credentials must not be printed or written; check only whether they are set.",
    );

  if (
    /task\.yaml/.test(cmd) &&
    /(>|sed\s+-i|set-content|out-file|add-content|tee\b|rm\b|remove-item|mv\b|move-item)/i.test(
      cmd,
    ) &&
    !/aisdlc-state\.js/.test(cmd)
  )
    block(
      "task.yaml may only be changed through scripts/state/aisdlc-state.js.",
    );

  if (/git\s+(-C\s+\S+\s+)?commit\b/.test(cmd)) {
    const msgs = [
      ...cmd.matchAll(/-m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g),
    ].map((m) => m[1] ?? m[2]);
    const tasks = activeTasks();
    if (!tasks.length)
      block("No active aisdlc design task; commits are not allowed.");
    if (msgs.length !== 1 || msgs[0].includes("\n"))
      block("Commit must have exactly one single-line -m message and no body.");
    const ids = tasks.map((t) => t.task.id);
    const m = msgs[0].match(/^([A-Z][A-Z0-9]*-\d+): (\S.*)$/);
    if (!m || !ids.includes(m[1]))
      block(
        `Commit message must match '<design-ticket>: <summary>' for an active design task (${ids.join(", ")}).`,
      );
    const t = tasks.find((x) => x.task.id === m[1]);
    if (
      !t.approvals ||
      !t.approvals.design ||
      t.approvals.design.status !== "approved"
    )
      block(`Design ${m[1]} is not approved; cannot commit.`);
    let branch = "";
    const dir =
      (cmd.match(/-C\s+("[^"]+"|\S+)/) || [])[1]?.replace(/"/g, "") || cwd;
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: dir,
        encoding: "utf8",
      }).trim();
    } catch {}
    if (branch !== m[1])
      block(
        `Active aisdlc design task requires branch ${m[1]} (current: ${branch || "unknown"}).`,
      );
  }

  const isStateTool = /aisdlc-state\.js/.test(cmd);
  const writeish =
    /(>>?\s|sed\s+-i|set-content|add-content|out-file|\btee\b|new-item|copy-item|move-item|\bmv\b|\bcp\b)/i;
  if (!isStateTool && writeish.test(cmd)) {
    const lc = cmd.replace(/\\/g, "/");
    for (const m of lc.matchAll(
      /designs\/([a-z][a-z0-9]*-\d+)\/prototype\//gi,
    )) {
      const r = designWriteReason(m[1].toUpperCase());
      if (r) block(r);
    }
  }
}
process.exit(0);
