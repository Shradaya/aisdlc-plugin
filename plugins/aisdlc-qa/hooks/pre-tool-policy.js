#!/usr/bin/env node
// PreToolUse enforcement hook (QA plugin). Mirrors the design hook's layered gate, scoped to the QA lifecycle:
// - tests/** and specs/** are written only while a QA task is between SCENARIOS_APPROVED and COMMITTED and its
//   approved tasks/<T>/scenarios.md is unchanged (hash-pinned), so tests always follow QA-approved scenarios;
// - Jira writes go through scripts/jira/jira-attach.js only: defect comments while tests are executed / awaiting the
//   fix, final evidence only after sign-off;
// - Playwright never runs against a production host;
// - commits must match '<TICKET>: <summary>' on branch <TICKET> for a signed-off task; the usual dangerous-op and
//   secret blocks apply.
// Reads the hook event JSON on stdin; exits 2 with a reason on stderr to block. No-op outside a QA workspace.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const { resolveRoot, configPath, workspaceKind } = require("../scripts/lib/root");
const { readYaml } = require("../scripts/lib/yaml");
const ROOT = resolveRoot();
if (!ROOT || workspaceKind(ROOT) !== "qa") process.exit(0); // not a QA workspace (config/workspace.yaml "kind": "qa")
const { resolveEnv, blockedReason } = require("../scripts/qa/env");

const TYPES = readYaml(configPath(ROOT, "task-types.yaml"), {});
const LC = TYPES.qa || {};
const norm = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
const RROOT = norm(ROOT);

function block(reason) { process.stderr.write("BLOCKED\nReason: " + reason + "\n"); process.exit(2); }

function activeTasks() {
  const dir = path.join(ROOT, "tasks");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((t) => readYaml(path.join(dir, t, "task.yaml"), null))
    .filter((t) => t && !["COMPLETED", "CANCELLED"].includes(t.task.status));
}
const taskOf = (id) => activeTasks().find((x) => x.task.id === id);

function fileHash(f) {
  return fs.existsSync(f) ? "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex") : null;
}

// Is <gate> approved for task t, with its artifact unchanged since approval?
function gateOk(t, gate) {
  const a = t.approvals && t.approvals[gate];
  if (!a || a.status !== "approved") return false;
  const art = ((LC.gates || {})[gate] || {}).artifact;
  return !art || a.artifact_hash === fileHash(path.join(ROOT, "tasks", t.task.id, art));
}

// May tests/specs for QA ticket <id> be written right now? Returns a block reason or null.
function testWriteReason(id) {
  const t = taskOf(id);
  if (!t) return `No active QA task for '${id}'.`;
  const st = LC.states || [], i = st.indexOf(t.task.status);
  if (i < 0) return `QA task ${id} is in ${t.task.status}; resolve that first, then resume with /aisdlc-qa:test ${id}.`;
  if (i < st.indexOf(LC.source_edit_min_state) || i > st.indexOf(LC.source_edit_max_state))
    return `QA task ${id} is in ${t.task.status}; tests and specs may be written only from ${LC.source_edit_min_state} to ${LC.source_edit_max_state}.`;
  if (!gateOk(t, "scenarios")) return `Scenarios for ${id} are not approved, or tasks/${id}/scenarios.md changed after approval; reapproval required.`;
  return null;
}

// Classify a workspace path: specs/<T>.md, other specs/, or tests/** (setup and seed files are workspace plumbing).
function gatedPath(n) {
  if (!n.startsWith(RROOT + "/")) return null;
  const rel = n.slice(RROOT.length + 1);
  const spec = rel.match(/^specs\/([a-z][a-z0-9]*-\d+)\.md$/);
  if (spec) return { ticket: spec[1].toUpperCase() };
  if (/^specs\/readme\.md$/.test(rel)) return null;
  if (/^specs\//.test(rel)) return { ticket: null };
  if (/^tests\//.test(rel) && !/^tests\/(auth\.setup|seed\.spec)\.ts$/.test(rel)) return { ticket: null };
  return null;
}

// Tickets a test file belongs to: its @<T>, @<T>-S<n>, @<T>-AC<n> tags and its "// spec: specs/<T>.md" header.
function ticketsIn(text) {
  const s = String(text || "");
  const ids = [...s.matchAll(/@([A-Z][A-Z0-9]*-\d+)(?:-(?:S|AC)\d+)?\b/g), ...s.matchAll(/specs\/([A-Z][A-Z0-9]*-\d+)\.md/g)].map((m) => m[1]);
  return [...new Set(ids)];
}

// Every active ticket the file (old or new content) belongs to must be ready; tickets whose tasks are finished are
// ignored (regression tests keep their old tags). With no active ticket, some QA task must be ready: test changes
// always happen under a ticket whose scenarios QA approved.
function checkTestWrite(file, content) {
  const g = gatedPath(norm(file));
  if (!g) return;
  if (g.ticket) { const r = testWriteReason(g.ticket); if (r) block(r); return; }
  const own = ticketsIn(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const active = [...new Set([...ticketsIn(content), ...own])].filter((id) => taskOf(id));
  for (const id of active) { const r = testWriteReason(id); if (r) block(r); }
  if (!active.length && !activeTasks().some((t) => !testWriteReason(t.task.id)))
    block("No QA task is ready for test writing (scenarios approved and unchanged, state SCENARIOS_APPROVED..COMMITTED). Tag tests with @<TICKET>.");
}

// .env / .env.<name> (not .env.example) as a file argument, and commands that print or search file content.
const DOT_ENV = /(^|[\s"'=/\\])\.env(?!\.example\b)(\.[\w-]+)?(?=$|[\s"'|;&)])/i;
const READ_CMD = /(^|[|;&(]\s*|\s)(cat|type|get-content|gc|more|less|head|tail|select-string|sls|findstr|grep|rg|sed|awk|strings|copy-item|cp|import-csv)\b/i;
const isSecretFile = (n) => /\/\.env(\.(?!example$)[\w.-]+)?$/.test(n) || n.startsWith(RROOT + "/.auth/");

const raw = fs.readFileSync(0, "utf8");
let ev; try { ev = JSON.parse(raw); } catch { process.exit(0); }
const tool = ev.tool_name, input = ev.tool_input || {};
const cwd = ev.cwd || process.cwd();

if (tool === "Read" || tool === "Grep") {
  // Claude never reads the workspace's .env (QA credentials) or .auth/ (saved login sessions).
  const target = input.file_path || input.path;
  if (target && isSecretFile(norm(path.resolve(cwd, target))))
    block(".env and .auth/ hold credentials and sessions; check credentials with scripts/qa/cred-check.js instead.");
  process.exit(0);
}

if (["Write", "Edit", "NotebookEdit", "MultiEdit"].includes(tool)) {
  const target = path.resolve(cwd, input.file_path || input.notebook_path || "");
  const n = norm(target);
  if (/\/\.env(\.(?!example$)[\w.-]+)?$/.test(n)) block(".env holds the QA's credentials; the QA edits it by hand.");
  if (/\/tasks\/[^/]+\/task\.yaml$/.test(n)) block("task.yaml may only be changed through scripts/state/aisdlc-state.js.");
  if (/\/\.git\//.test(n + "/")) block(".git is protected.");
  if (/(^|\/)(credentials|secrets)\//.test(n) || /\.(pem|key)$/.test(n)) block("Protected path.");
  if (n.startsWith(RROOT + "/.auth/")) block(".auth/ holds saved login sessions; it is written only by the Playwright setup project.");
  const content = input.content ?? input.new_string ?? (input.edits || []).map((e) => e.new_string).join("\n");
  checkTestWrite(target, content);
  process.exit(0);
}

if (tool === "mcp__playwright-test__generator_write_test" || tool === "mcp__playwright-test__planner_save_plan") {
  // The Playwright generator and planner write files through their MCP server ({ fileName, code } / { fileName, ... },
  // relative to the workspace root); the same gate applies. A plan saved under specs/ before approval is blocked.
  const file = input.fileName || (tool.endsWith("save_plan") ? "specs/plan.md" : "tests/generated.spec.ts");
  checkTestWrite(path.resolve(ROOT, file), input.code || "");
  process.exit(0);
}

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(input.command || "");

  // dangerous operations
  if (/git\s+push\b.*(--force\b|--force-with-lease|\s-f\b|\s\+\S+)/.test(cmd)) block("Force push is disabled.");
  if (/git\s+(branch\s+-[dD]\s+main|push\s+\S+\s+:main|push\s+\S+\s+--delete\s+main)/.test(cmd)) block("Deleting main is disabled.");
  if (/git\s+reset\s+--hard/.test(cmd) && /\bmain\b/.test(cmd)) block("Destructive reset on main is disabled.");
  if (/git\s+(filter-branch|rebase\s+.*--root)/.test(cmd)) block("History rewrite is disabled.");
  // `env` / `printenv` as commands (start of command or after | ; &), not a file name such as `.env` at the end.
  if (/(^|[|;&]\s*)(printenv|env)\s*($|[|;&>])/i.test(cmd) || /(^|[|;&]\s*)printenv\b/i.test(cmd) ||
      /(get-childitem|gci|dir|ls)\s+env:|cat\s+.*\.(pem|key)\b|aws\s+secretsmanager\s+get-secret-value/i.test(cmd))
    block("Credential/secret extraction is disabled.");
  if (READ_CMD.test(cmd) && DOT_ENV.test(cmd)) block(".env holds credentials; read whether a credential is set with scripts/qa/cred-check.js, never the file.");
  if (/\b(echo|write-output|write-host|printf|cat|type|out-file|set-content)\b[^|;&\n]*(BITBUCKET_API_TOKEN|JIRA_API_TOKEN|QA_PASSWORD)/i.test(cmd) || /^\s*\$env:(BITBUCKET_API_TOKEN|JIRA_API_TOKEN|QA_PASSWORD)\s*$/i.test(cmd))
    block("Credentials must not be printed or written; check only whether they are set.");
  if (/(\bcat\b|\btype\b|get-content|\bgc\b|\bmore\b|\bless\b)[^|;&\n]*\.auth[\\/]/i.test(cmd)) block(".auth/ holds saved login sessions; do not print it.");
  if (/git\s+add\b[^|;&\n]*(\.auth\b|claude\.env)/i.test(cmd)) block("Saved login sessions (.auth/) and claude.env are never committed.");

  // task state integrity
  if (/task\.yaml/.test(cmd) && /(>|sed\s+-i|set-content|out-file|add-content|tee\b|rm\b|remove-item|mv\b|move-item)/i.test(cmd) && !/aisdlc-state\.js/.test(cmd))
    block("task.yaml may only be changed through scripts/state/aisdlc-state.js.");

  // Jira: only through jira-attach.js, and only at the right point in the lifecycle.
  if (/\b(curl|wget|invoke-restmethod|invoke-webrequest|irm|iwr)\b[^|;&\n]*(atlassian\.net|\/rest\/api\/)/i.test(cmd))
    block("Call Jira through scripts/jira/jira-attach.js (or the Jira MCP adapter for reads), not ad-hoc HTTP.");
  const jira = cmd.match(/jira-attach\.js["']?\s+(\w+)\s+["']?([A-Za-z][A-Za-z0-9]*-\d+)/);
  if (jira && !/--dry-run\b/.test(cmd)) {
    const [, sub, id] = jira;
    const t = taskOf(id.toUpperCase());
    const s = t && t.task.status;
    if (sub === "defect" && !["TESTS_EXECUTED", "AWAITING_DEV_FIX"].includes(s))
      block(`A defect comment is posted only after a test run, while ${id} is in TESTS_EXECUTED or AWAITING_DEV_FIX (now ${s || "no active task"}).`);
    if (sub === "reply" && !["TESTS_EXECUTED", "AWAITING_DEV_FIX", "AWAITING_RESULTS_SIGNOFF"].includes(s))
      block(`A defect follow-up is posted only while ${id} is between TESTS_EXECUTED and AWAITING_RESULTS_SIGNOFF (now ${s || "no active task"}).`);
    if ((sub === "attach" || sub === "comment") && !(t && gateOk(t, "signoff")))
      block(`Evidence is attached to ${id} only after QA sign-off (approved, and tasks/${id}/results.md unchanged since).`);
  }

  // Playwright never runs against production.
  if (/(playwright(\.cmd)?|cli\.js|pw\.js)["']?\s+test\b/.test(cmd) && !/--list\b/.test(cmd)) {
    const named = (cmd.match(/QA_ENV\s*=\s*["']?([\w-]+)/i) || [])[1];
    const env = resolveEnv(ROOT, named);
    if (!env.ok) block(`Playwright target environment refused: ${env.reason}`);
  }
  for (const m of cmd.matchAll(/playwright(?:\.cmd)?["']?\s+(?:codegen|open|cr|ff|wk)\b[^|;&\n]*?(https?:\/\/[^\s"']+)/gi)) {
    let host = ""; try { host = new URL(m[1]).hostname.toLowerCase(); } catch {}
    const r = host && blockedReason(ROOT, host);
    if (r) block(r);
  }

  // git commit policy: <TICKET>: <summary> on branch <TICKET>, for a signed-off QA task
  const commitDir = (cmd.match(/-C\s+("[^"]+"|\S+)/) || [])[1]?.replace(/"/g, "") || cwd;
  let hasHead = true;
  if (/git\s+(-C\s+\S+\s+)?commit\b/.test(cmd)) {
    try { execSync("git rev-parse --verify -q HEAD", { cwd: commitDir, stdio: "ignore" }); } catch { hasHead = false; }
  }
  // The very first commit of a new QA repository (the scaffolded workspace) has no ticket to belong to.
  if (/git\s+(-C\s+\S+\s+)?commit\b/.test(cmd) && hasHead) {
    const msgs = [...cmd.matchAll(/-m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]);
    const tasks = activeTasks();
    if (!tasks.length) block("No active QA task; commits are not allowed.");
    if (msgs.length !== 1 || msgs[0].includes("\n")) block("Commit must have exactly one single-line -m message and no body.");
    const ids = tasks.map((t) => t.task.id);
    const m = msgs[0].match(/^([A-Z][A-Z0-9]*-\d+): (\S.*)$/);
    if (!m || !ids.includes(m[1])) block(`Commit message must match '<ticket>: <summary>' for an active QA task (${ids.join(", ")}).`);
    const t = tasks.find((x) => x.task.id === m[1]);
    if (!gateOk(t, "scenarios") || !gateOk(t, "signoff")) block(`QA results for ${m[1]} are not signed off; cannot commit.`);
    let branch = "";
    try { branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: commitDir, encoding: "utf8" }).trim(); } catch {}
    if (branch !== m[1]) block(`Active QA task requires branch ${m[1]} (current: ${branch || "unknown"}).`);
  }

  // shell writes into tests/ or specs/ follow the same gate as Write/Edit.
  const isStateTool = /aisdlc-state\.js/.test(cmd);
  const writeish = /(>>?\s|sed\s+-i|set-content|add-content|out-file|\btee\b|new-item|copy-item|move-item|\bmv\b|\bcp\b)/i;
  if (!isStateTool && writeish.test(cmd)) {
    const lc = cmd.replace(/\\/g, "/");
    for (const m of lc.matchAll(/specs\/([a-z][a-z0-9]*-\d+)\.md/gi)) { const r = testWriteReason(m[1].toUpperCase()); if (r) block(r); }
    if (/(^|[\s"'=/])tests\/(?!auth\.setup\.ts|seed\.spec\.ts)\S/.test(lc)) {
      const ids = ticketsIn(cmd).filter((id) => taskOf(id));
      for (const id of ids) { const r = testWriteReason(id); if (r) block(r); }
      if (!ids.length && !activeTasks().some((t) => !testWriteReason(t.task.id))) block("No QA task is ready for test writing (scenarios approved and unchanged).");
    }
  }
}
process.exit(0);
