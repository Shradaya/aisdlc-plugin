#!/usr/bin/env node
// PreToolUse enforcement hook (design plugin). The design workspace has one job: /aisdlc-design:sync commits a ticket's
// design under designs/<KEY>/. Rules enforced here:
//   - a commit must stage only files under one designs/<KEY>/ folder and read '<KEY>: <summary>' with the same KEY;
//   - no 'git commit -a'; no force push, history rewrite, or deleting main;
//   - .git, credentials and key files are protected; credential values must not be printed.
// There is no branch rule: commits go to the current branch (normally main).
// Reads the hook event JSON on stdin; exits 2 with a reason on stderr to block. No-op outside a design workspace.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { resolveRoot, workspaceKind } = require("../scripts/lib/root");
const ROOT = resolveRoot();
if (!ROOT) process.exit(0);
const KIND = workspaceKind(ROOT);
if (KIND && KIND !== "design" && KIND !== "aisdlc") process.exit(0); // another aisdlc plugin's workspace (config/workspace.yaml "kind")

const norm = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
function block(reason) { process.stderr.write("BLOCKED\nReason: " + reason + "\n"); process.exit(2); }

// Validate a git commit command. Blocks unless it is a valid design sync commit.
function checkCommit(cmd, dir) {
  const msgs = [...cmd.matchAll(/-m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]);
  if (/\s(-[a-zA-Z]*a[a-zA-Z]*|--all)(\s|$)/.test(cmd.replace(/-m\s+(?:"(?:[^"\\]|\\.)*"|'[^']*')/g, "")))
    block("Do not use 'git commit -a'; stage only designs/<KEY>/ and commit that.");
  let staged = [];
  try {
    staged = execSync("git diff --cached --name-only", { cwd: dir, encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
  } catch { block("Could not inspect the git index; commit blocked."); }
  const keys = new Set(staged.map((f) => (f.match(/^designs\/([A-Z][A-Z0-9]*-\d+)\//) || [])[1]));
  if (!staged.length || keys.has(undefined)) block("Commits here must stage only files under designs/<KEY>/ (use /aisdlc-design:sync).");
  if (keys.size !== 1) block("A commit may stage only one ticket folder (designs/<KEY>/); sync one ticket at a time.");
  if (msgs.length !== 1 || msgs[0].includes("\n")) block("Commit must have exactly one single-line -m message and no body.");
  const key = [...keys][0];
  const m = msgs[0].match(/^([A-Z][A-Z0-9]*-\d+): (\S.*)$/);
  if (!m) block("Design commit must read '<KEY>: <summary>'.");
  if (m[1] !== key) block(`Commit message ticket ${m[1]} does not match the staged folder designs/${key}/.`);
}

const raw = fs.readFileSync(0, "utf8");
let ev; try { ev = JSON.parse(raw); } catch { process.exit(0); }
const tool = ev.tool_name, input = ev.tool_input || {};
const cwd = ev.cwd || process.cwd();

if (["Write", "Edit", "NotebookEdit", "MultiEdit"].includes(tool)) {
  const n = norm(path.resolve(cwd, input.file_path || input.notebook_path || ""));
  if (/\/\.git\//.test(n + "/")) block(".git is protected.");
  if (/(^|\/)(credentials|secrets)\//.test(n) || /\.(pem|key)$/.test(n)) block("Protected path.");
  process.exit(0);
}

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(input.command || "");

  // dangerous operations
  if (/git\s+push\b.*(--force\b|--force-with-lease|\s-f\b|\s\+\S+)/.test(cmd)) block("Force push is disabled.");
  if (/git\s+(branch\s+-[dD]\s+main|push\s+\S+\s+:main|push\s+\S+\s+--delete\s+main)/.test(cmd)) block("Deleting main is disabled.");
  if (/git\s+reset\s+--hard/.test(cmd) && /\bmain\b/.test(cmd)) block("Destructive reset on main is disabled.");
  if (/git\s+(filter-branch|rebase\s+.*--root)/.test(cmd)) block("History rewrite is disabled.");
  if (/(printenv|\benv\b\s*$|get-childitem\s+env:|cat\s+.*\.(pem|key)\b|aws\s+secretsmanager\s+get-secret-value)/i.test(cmd)) block("Credential/secret extraction is disabled.");
  if (/\b(echo|write-output|write-host|printf|cat|type|out-file|set-content)\b[^|;&\n]*(BITBUCKET_API_TOKEN|JIRA_API_TOKEN)/i.test(cmd) || /^\s*\$env:(BITBUCKET_API_TOKEN|JIRA_API_TOKEN)\s*$/i.test(cmd))
    block("Integration credentials must not be printed or written; check only whether they are set.");

  if (/git\s+(-C\s+\S+\s+)?commit\b/.test(cmd)) {
    const dir = (cmd.match(/-C\s+("[^"]+"|\S+)/) || [])[1]?.replace(/"/g, "") || cwd;
    if (KIND === "aisdlc" && norm(dir) === norm(ROOT)) process.exit(0); // the aisdlc plugin's hook owns commits at the workspace root
    checkCommit(cmd, dir);
  }
}
process.exit(0);
