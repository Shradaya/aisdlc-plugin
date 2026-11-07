#!/usr/bin/env node
// PreToolUse enforcement hook (aisdlc plugin). Active only in a shared aisdlc repo (config/workspace.yaml kind "aisdlc").
// It owns commits made at the repo root; the role plugins' hooks keep their own gates (write windows, task integrity).
//   - a root commit stages only tasks/ designs/ system/ repositories/ config/ and reads '<TICKET>: <summary>';
//     no 'git commit -a'; nothing from QA's local tests, env files or logs;
//   - hand-off events and changes.md are written only by /aisdlc:handoff and /aisdlc:return (flow.js);
//   - no force push, history rewrite or deleting main; .git, credentials and key files are protected.
// Reads the hook event JSON on stdin; exits 2 with a reason on stderr to block.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { resolveRoot, workspaceKind } = require("../scripts/lib/root");
const ROOT = resolveRoot();
if (!ROOT || workspaceKind(ROOT) !== "aisdlc") process.exit(0);

const norm = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
const block = (reason) => {
  process.stderr.write("BLOCKED\nReason: " + reason + "\n");
  process.exit(2);
};
const ALLOWED = /^(tasks|designs|system|repositories|config)\//;

function checkCommit(cmd, dir) {
  const msgs = [...cmd.matchAll(/-m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g)].map(
    (m) => m[1] ?? m[2],
  );
  if (
    /\s(-[a-zA-Z]*a[a-zA-Z]*|--all)(\s|$)/.test(
      cmd.replace(/-m\s+(?:"(?:[^"\\]|\\.)*"|'[^']*')/g, ""),
    )
  )
    block(
      "Do not use 'git commit -a'; use /aisdlc:push, which stages only the workflow folders.",
    );
  let staged = [];
  try {
    staged = execSync("git diff --cached --name-only", {
      cwd: dir,
      encoding: "utf8",
    })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    block("Could not inspect the git index; commit blocked.");
  }
  const bad = staged.filter((f) => !ALLOWED.test(f));
  if (!staged.length || bad.length)
    block(
      `Commits here may stage only tasks/, designs/, system/, repositories/ and config/ (use /aisdlc:push). Not allowed: ${bad.slice(0, 3).join(", ") || "nothing staged"}.`,
    );
  if (msgs.length !== 1 || msgs[0].includes("\n"))
    block("Commit must have exactly one single-line -m message and no body.");
  if (!/^[A-Z][A-Z0-9]*-\d+: \S/.test(msgs[0]))
    block(
      "Commit message must read '<TICKET>: <summary>' (for example EL-101: Add acceptance criteria).",
    );
}

let ev;
try {
  ev = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const tool = ev.tool_name,
  input = ev.tool_input || {};
const cwd = ev.cwd || process.cwd();

if (["Write", "Edit", "NotebookEdit", "MultiEdit"].includes(tool)) {
  const n = norm(
    path.resolve(cwd, input.file_path || input.notebook_path || ""),
  );
  if (/\/\.git\//.test(n + "/")) block(".git is protected.");
  if (/(^|\/)(credentials|secrets)\//.test(n) || /\.(pem|key)$/.test(n))
    block("Protected path.");
  if (/\/tasks\/[^/]+\/execution-log(\.[a-z]+)?\.jsonl$/.test(n))
    block(
      "Execution logs are written only by aisdlc-state.js (audit <ticket> <event> [json]); each line is hash-chained, so they cannot be edited by hand.",
    );
  if (
    /\/tasks\/[^/]+\/handoffs\//.test(n) ||
    /\/tasks\/[^/]+\/changes\.md$/.test(n)
  )
    block(
      "Hand-offs and change requests are recorded only through /aisdlc:handoff and /aisdlc:return.",
    );
  process.exit(0);
}

if (tool === "Bash" || tool === "PowerShell") {
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
    )
  )
    block(
      "Integration credentials must not be printed or written; check only whether they are set.",
    );
  if (
    /git\s+add\b[^|;&\n]*(\.auth\b|claude\.env|\.env\b|(^|\s)tests?\b|fixtures)/i.test(
      cmd,
    )
  )
    block(
      "Env files, saved logins and QA tests are never committed; use /aisdlc:push.",
    );
  if (
    /(>>?|\bsed\s+-i|\btee\b|set-content|add-content|out-file|\brm\b|\bdel\b|remove-item|\bmv\b|move-item|\bcp\b|copy-item|truncate)[^|;&\n]*execution-log/i.test(
      cmd,
    )
  )
    block(
      "Execution logs are written only by aisdlc-state.js (audit <ticket> <event> [json]); each line is hash-chained, so they cannot be edited by hand.",
    );
  if (/git\s+(-C\s+\S+\s+)?commit\b/.test(cmd)) {
    const dir =
      (cmd.match(/-C\s+("[^"]+"|\S+)/) || [])[1]?.replace(/"/g, "") || cwd;
    if (norm(dir) === norm(ROOT)) checkCommit(cmd, dir);
  }
}
process.exit(0);
