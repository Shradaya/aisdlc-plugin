#!/usr/bin/env node
// PostToolUse audit hook (spec §30.7). Records metadata only; command text is redacted.
const fs = require("fs");
const path = require("path");
const ROOT = require("../scripts/lib/root").resolveRoot();
if (!ROOT) process.exit(0); // installed user-wide: do nothing outside an aisdlc workspace
const KIND = require("../scripts/lib/root").workspaceKind(ROOT);
if (KIND && KIND !== "dev") process.exit(0); // another aisdlc plugin's workspace (config/workspace.yaml "kind")
let ev; try { ev = JSON.parse(fs.readFileSync(0, "utf8")); } catch { process.exit(0); }
const SECRET = /(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:token|secret|password|passwd|api[_-]?key)\s*[=:]\s*\S+|xox[bp]-\S+|ghp_\w+)/gi;
const input = ev.tool_input || {};
const cmd = String(input.command || "");
const cls = /git\s+commit/.test(cmd) ? "git-commit" : /git\s+push/.test(cmd) ? "git-push" : /git\b/.test(cmd) ? "git" : ev.tool_name;
const rec = {
  timestamp: new Date().toISOString(),
  session: ev.session_id || null,
  tool: ev.tool_name,
  class: cls,
  target: input.file_path ? path.basename(String(input.file_path)) : undefined,
  command: cmd ? cmd.slice(0, 200).replace(SECRET, "[REDACTED]") : undefined,
  success: ev.tool_response ? !(ev.tool_response.is_error || ev.tool_response.error) : null,
};
try {
  fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  fs.appendFileSync(path.join(ROOT, "logs", "audit.jsonl"), JSON.stringify(rec) + "\n");
} catch {}
process.exit(0);
