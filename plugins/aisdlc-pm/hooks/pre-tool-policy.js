#!/usr/bin/env node
// PreToolUse enforcement hook (pm plugin). Design sections 6.1-6.4. Active only in a pm workspace
// (config/workspace.yaml "kind": "pm"); elsewhere it exits 0 immediately so the dev/design/qa plugins own their own
// workspaces. Reads the hook event JSON on stdin; exit 2 with a reason on stderr BLOCKS; exit 0 with a
// hookSpecificOutput.permissionDecision:"ask" JSON on stdout ASKS the user (Claude Code then prompts).
//
// Layers:
//  6.1 secret guards   - never read/print the workspace credentials file, .env, or the JIRA_*/AISDLC_* environment;
//                        Jira is only ever reached through scripts/jira/jira-pm.js, never ad-hoc HTTP.
//  6.2 no approvals    - the agent cannot approve/reject: no approve command exists and calls to /approvals/ are blocked.
//  6.3 state integrity - task.yaml only via the state CLI; requirements.md/acceptance-criteria.md are editable only
//                        while the task is between source_edit_min_state and source_edit_max_state; dangerous git ops.
//  6.4 mirror + jira   - a local hand-off transition is refused unless the server's acceptance_criteria gate is
//                        approved (serverApproval); jira-pm.js apply must have a valid plan and triggers an "ask".
//
// The whole thing is wrapped in try/catch: on any crash the hook fails CLOSED for jira-pm (raw stdin contains
// "jira-pm" => ask) and fails OPEN otherwise (exit 0), so a bug never bricks unrelated tool calls.
const fs = require("fs");
const path = require("path");

const { resolveRoot, configPath, workspaceKind } = require("../scripts/lib/root");
const { readYaml } = require("../scripts/lib/yaml");
const ROOT = resolveRoot();
if (!ROOT || workspaceKind(ROOT) !== "pm") process.exit(0);
const { serverApproval } = require("../scripts/lib/pm-server-check");

const TYPES = readYaml(configPath(ROOT, "task-types.yaml"), {});
const LC = TYPES.pm || {};
const FAIL = TYPES.failure_states || [];
const norm = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
const RROOT = norm(ROOT);

function block(reason) { process.stderr.write("BLOCKED\nReason: " + reason + "\n"); process.exit(2); }
function ask(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } }));
  process.exit(0);
}

function activeTasks() {
  const dir = path.join(ROOT, "tasks");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((t) => readYaml(path.join(dir, t, "task.yaml"), null))
    .filter((t) => t && t.task && !["COMPLETED", "CANCELLED"].includes(t.task.status));
}
const taskOf = (id) => activeTasks().find((x) => x.task.id === id);

// Current state index for the artifact-edit window; in a failure state the resume_state's index is used.
function stateIndex(t) {
  const st = LC.states || [];
  let s = t.task.status;
  if (FAIL.includes(s)) s = t.task.resume_state || s;
  return st.indexOf(s);
}

// May tasks/<id>/{requirements,acceptance-criteria}.md be written right now? Returns a block reason or null.
function artifactWriteReason(id) {
  const t = taskOf(id);
  if (!t) return `No active PM task for '${id}'. Start it with /aisdlc-pm:requirements ${id}.`;
  const st = LC.states || [], i = stateIndex(t);
  const min = st.indexOf(LC.source_edit_min_state), max = st.indexOf(LC.source_edit_max_state);
  if (i < 0 || i < min || i > max) {
    const back = i > max
      ? ` After hand-off the files are pinned by the server approval; run a rework transition first (/aisdlc-pm:refine ${id} moves ${id} back to ACCEPTANCE_CRITERIA_DEFINED or REQUIREMENT_GATHERING), which also means re-approval is needed.`
      : "";
    return `PM task ${id} is in ${t.task.status}; requirements.md and acceptance-criteria.md may be written only from ${LC.source_edit_min_state} to ${LC.source_edit_max_state}.${back}`;
  }
  return null;
}

// Classify a workspace path as one of the two gated PM artifacts (tasks/<T>/requirements.md|acceptance-criteria.md).
const TICKET = /^[a-z][a-z0-9]*-\d+$/;
function gatedArtifact(n) {
  if (!n.startsWith(RROOT + "/")) return null;
  const m = n.slice(RROOT.length + 1).match(/^tasks\/([^/]+)\/(requirements|acceptance-criteria)\.md$/);
  if (m && TICKET.test(m[1])) return { ticket: m[1].toUpperCase() };
  return null;
}

// ---- FEAT-003 seam -------------------------------------------------------------------------------------------------
// Decide what to do with a (non-dry-run) Jira "apply" segment: "block" | "ask" | null (fall through to the caller's
// default). The hook does a lightweight plan-file check only (ticket match, plan_id == --plan, expires_at in the
// future); it never re-hashes - jira-pm.js itself re-reads the description and re-renders the block and refuses on any
// drift (before_hash/section_hash). So a valid-looking plan => "ask" (Claude Code then prompts the user); anything
// else => "block" with "run preview first". This keeps the native confirmation prompt in front of every real write.
function jiraApplyDecision(segment, root) { // eslint-disable-line no-unused-vars
  const { T, planId } = applyArgs(segment);
  return planValid(T, planId) ? "ask" : "block";
}

// Does this command invoke "jira-pm ... apply"? (normalised: backslashes to slashes, lowercased).
const JIRA_APPLY_RE = /\/?jira-pm(\.js)?["']?\s+apply\b/;
// A valid plan file for ticket T whose plan_id matches --plan and which has not expired (the hook does not re-hash).
function planValid(T, planId) {
  if (!T || !planId) return false;
  try {
    const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "tasks", T, "jira-sync-plan.json"), "utf8"));
    return plan && plan.ticket === T && plan.plan_id === planId && Date.parse(plan.expires_at) > Date.now();
  } catch { return false; }
}
// Split a command into shell segments (&&, ||, ;, |, newline) so an apply exemption is decided per segment.
const splitSegments = (cmd) => cmd.split(/&&|\|\||[;|\n]/);
// Pull T, --plan and whether --dry-run is an argument of THIS segment.
function applyArgs(segment) {
  const toks = segment.trim().split(/\s+/).map((s) => s.replace(/^["']|["']$/g, ""));
  const i = toks.findIndex((x) => /jira-pm(\.js)?$/i.test(x));
  const after = i >= 0 ? toks.slice(i + 1) : toks;
  const pi = after.indexOf("apply");
  const rest = pi >= 0 ? after.slice(pi + 1) : after;
  const T = (rest.find((x) => /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(x)) || "").toUpperCase();
  const planIdx = rest.indexOf("--plan");
  const planId = planIdx >= 0 ? rest[planIdx + 1] : null;
  const dryRun = rest.includes("--dry-run");
  return { T, planId, dryRun };
}

// Handle any jira-pm apply in the command: block, ask, or pass. Returns true if it decided (exited); false otherwise.
function handleJira(cmd) {
  const lc = cmd.replace(/\\/g, "/").replace(/\s+/g, " ").toLowerCase();
  // node -e / -p / --eval one-liners that mention jira-pm, or that require the vendored jira.js together with a PUT:
  // run jira-pm.js directly so the user can confirm, never from an eval wrapper.
  if (/\bnode\b[^\n]*(-e|-p|--eval)\b[^\n]*jira-pm/.test(lc) ||
      (/require\(/.test(lc) && /jira(\.js)?["']/.test(lc) && /\bput\b/.test(lc)))
    block("Run scripts/jira/jira-pm.js apply directly (so the user can confirm), not from a node -e wrapper.");
  if (!JIRA_APPLY_RE.test(lc)) return false;
  // Per-segment: an apply segment is exempt only if THIS segment also carries --dry-run.
  const segments = splitSegments(cmd).filter((s) => JIRA_APPLY_RE.test(s.replace(/\\/g, "/").toLowerCase()));
  let needsPrompt = false, T = null;
  for (const seg of segments) {
    const a = applyArgs(seg);
    if (a.dryRun) continue; // --dry-run never writes; no prompt
    needsPrompt = true; T = a.T;
    // FEAT-003 seam: "block" (no valid plan) | "ask" | null (fall through to the plan check below).
    const decision = jiraApplyDecision(seg, ROOT);
    if (decision === "block" || (decision == null && !planValid(a.T, a.planId)))
      block(`No valid Jira plan for ${a.T || "this ticket"}; run preview first (/aisdlc-pm:jira-sync ${a.T || "<T>"}).`);
  }
  if (needsPrompt)
    ask(`Write the requirements and acceptance criteria into the Jira description of ${T || "this ticket"}? Review the preview diff first.`);
  return true; // every apply segment was a --dry-run: pass
}

// .env / .env.<name> (not .env.example) as a file argument, and commands that print/search file content.
const DOT_ENV = /(^|[\s"'=/\\])\.env(?!\.example\b)(\.[\w-]+)?(?=$|[\s"'|;&)])/i;
const READ_CMD = /(^|[|;&(]\s*|\s)(cat|type|get-content|gc|more|less|head|tail|select-string|sls|findstr|grep|rg|sed|awk|strings|copy-item|cp)\b/i;
const CRED_JSON = /aisdlc[\\/]credentials\.json/i;
const isSecretReadPath = (n) => /\/\.env(\.(?!example$)[\w.-]+)?$/.test(n) || /\/aisdlc\/credentials\.json$/.test(n);
const EXEC_EXT = /\.(js|mjs|cjs|ps1|sh|cmd|bat)$/i;

function run() {
  const raw = fs.readFileSync(0, "utf8");
  let ev;
  try { ev = JSON.parse(raw); }
  catch {
    // Fail closed for jira-pm: an unparseable event that mentions jira-pm still asks; otherwise pass.
    if (/jira-pm/i.test(raw)) ask("Confirm the Jira write for this ticket? Review the preview diff first.");
    process.exit(0);
  }
  const tool = ev.tool_name, input = ev.tool_input || {};
  const cwd = ev.cwd || process.cwd();

  // ---- 6.1 reads --------------------------------------------------------------------------------------------------
  if (tool === "Read" || tool === "Grep") {
    const target = input.file_path || input.path;
    if (target && isSecretReadPath(norm(path.resolve(cwd, target))))
      block(".env and the client credentials file hold secrets; do not read them.");
    process.exit(0);
  }

  // ---- 6.1 / 6.3 writes -------------------------------------------------------------------------------------------
  if (["Write", "Edit", "NotebookEdit", "MultiEdit"].includes(tool)) {
    const target = path.resolve(cwd, input.file_path || input.notebook_path || "");
    const n = norm(target);
    if (/\/\.env(\.(?!example$)[\w.-]+)?$/.test(n)) block(".env holds credentials; it is edited by hand, outside the agent.");
    if (/\/tasks\/[^/]+\/task\.yaml$/.test(n)) block("task.yaml may only be changed through scripts/state/aisdlc-state.js.");
    if (/\/\.git\//.test(n + "/")) block(".git is protected.");
    if (/(^|\/)(credentials|secrets)\//.test(n) || /(^|\/)aisdlc\/credentials\.json$/.test(n) || /\.(pem|key)$/.test(n)) block("Protected path.");
    // Client-owned files: forging them would defeat the server mirror guard.
    if (n.startsWith(RROOT + "/.aisdlc/")) block(".aisdlc/ is written only by the AISDLC client (push/pull); it is not edited here.");
    if (/\/tasks\/[^/]+\/server-ticket\.json$/.test(n)) block("server-ticket.json is written only by /aisdlc-pm:pull; it is not edited here.");
    // Content scan (executable files only): a script that would run a jira-pm apply must not be written to dodge the
    // apply confirmation. PM notes / README / markdown mentioning jira-pm are fine.
    const content = input.content ?? input.new_string ?? (input.edits || []).map((e) => e.new_string).join("\n");
    if (EXEC_EXT.test(n) && /jira-pm/i.test(String(content)) && /\bapply\b/i.test(String(content)))
      block("A script that runs jira-pm apply is not allowed; run scripts/jira/jira-pm.js apply directly so the user can confirm.");
    // Gate the two PM artifacts by the local state window.
    const g = gatedArtifact(n);
    if (g) { const r = artifactWriteReason(g.ticket); if (r) block(r); }
    process.exit(0);
  }

  // ---- 6.1-6.4 shell ----------------------------------------------------------------------------------------------
  if (tool === "Bash" || tool === "PowerShell") {
    const cmd = String(input.command || "");

    // 6.3 dangerous operations
    if (/git\s+push\b.*(--force\b|--force-with-lease|\s-f\b|\s\+\S+)/.test(cmd)) block("Force push is disabled.");
    if (/git\s+(branch\s+-[dD]\s+main|push\s+\S+\s+:main|push\s+\S+\s+--delete\s+main)/.test(cmd)) block("Deleting main is disabled.");
    if (/git\s+reset\s+--hard/.test(cmd) && /\bmain\b/.test(cmd)) block("Destructive reset on main is disabled.");
    if (/git\s+(filter-branch|rebase\s+.*--root)/.test(cmd)) block("History rewrite is disabled.");

    // 6.1 environment dumps and credential prints
    if (/(^|[|;&]\s*)(printenv|env)\s*($|[|;&>])/i.test(cmd) || /(^|[|;&]\s*)printenv\b/i.test(cmd) ||
        /(get-childitem|gci)\s+env:|\[environment\]::getenvironmentvariable\(/i.test(cmd) ||
        /cat\s+.*\.(pem|key)\b/i.test(cmd) || CRED_JSON.test(cmd) || /aws\s+secretsmanager\s+get-secret-value/i.test(cmd))
      block("Credential/secret extraction is disabled.");
    // Any print/write/copy/search verb naming an AISDLC_*/JIRA_* variable in any form ($VAR, ${VAR}, %VAR%, $env:VAR, process.env.VAR).
    if (/\b(echo|write-output|write-host|printf|cat|type|out-file|set-content|select-string|findstr)\b[^|;&\n]*(\$\{?(AISDLC_[A-Z_]*|JIRA_[A-Z_]*)\}?|%(AISDLC_[A-Z_]*|JIRA_[A-Z_]*)%|\$env:(AISDLC_[A-Z_]*|JIRA_[A-Z_]*)|process\.env\.(AISDLC_[A-Z_]*|JIRA_[A-Z_]*))/i.test(cmd) ||
        /^\s*\$env:(AISDLC_[A-Z_]*|JIRA_[A-Z_]*)\s*$/i.test(cmd))
      block("Credentials must not be printed or written; check only whether they are set.");
    // Reading commands together with .env or the credentials file.
    if (READ_CMD.test(cmd) && (DOT_ENV.test(cmd) || CRED_JSON.test(cmd)))
      block(".env and the client credentials file hold secrets; do not read them.");
    // node -e / -p env dumps that mention process.env with JIRA_ or AISDLC_.
    if (/\bnode\b[^\n]*(-e|-p|--eval)\b[^\n]*process\.env/.test(cmd) && /(JIRA_|AISDLC_)/.test(cmd))
      block("Do not dump JIRA_*/AISDLC_* environment variables.");

    // 6.1 Jira only through jira-pm.js
    if (/\b(curl|wget|invoke-restmethod|invoke-webrequest|irm|iwr)\b[^|;&\n]*(atlassian\.net|\/rest\/api\/)/i.test(cmd))
      block("Call Jira through scripts/jira/jira-pm.js, not ad-hoc HTTP.");

    // 6.2 approvals are human-only
    if (/aisdlc-state\.js\b[^|;&\n]*\b(approve|reject)\b/.test(cmd))
      block("Approvals are human decisions in the AISDLC web UI. This plugin has no approval gate.");
    if (/\/approvals\//.test(cmd) && /\b(curl|wget|iwr|irm|invoke-restmethod|invoke-webrequest)\b/i.test(cmd))
      block("Approvals are never made from a workspace; approve in the AISDLC web UI.");
    if (/\bnode\b[^\n]*(-e|-p|--eval)\b[^\n]*fetch\(/.test(cmd) && /\/approvals\//.test(cmd))
      block("Approvals are never made from a workspace; approve in the AISDLC web UI.");

    // 6.3 task.yaml only via the state CLI (redirects and writing commands naming it).
    if (!/aisdlc-state\.js/.test(cmd) && (
      />>?\s*["']?[^\s|;&>"']*task\.yaml/i.test(cmd) ||
      /(^|[|;&(]\s*|\s)(sed\s+-i|tee|set-content|add-content|out-file|clear-content|rm|del|remove-item|ri|mv|move-item|cp|copy-item|truncate|vi|vim|nano|notepad|code)\b[^|;&\n]*task\.yaml/i.test(cmd)))
      block("task.yaml may only be changed through scripts/state/aisdlc-state.js.");

    // 6.4 mirror guard: a local hand-off transition needs the server's acceptance_criteria gate approved.
    const trans = cmd.match(/aisdlc-state\.js\s+transition\s+["']?([A-Za-z][A-Za-z0-9]*-\d+)["']?\s+(HANDED_OFF_TO_DESIGN|HANDED_OFF_TO_DEV)\b/);
    if (trans) {
      const a = serverApproval(ROOT, trans[1].toUpperCase());
      if (!a.ok) {
        const why = a.reason === "no_server_ticket" ? `pull ${trans[1]} first (/aisdlc-pm:pull ${trans[1]})`
          : a.reason === "no_ac_gate" ? "the server ticket has no acceptance_criteria gate"
          : `the acceptance_criteria gate is not approved on the server (${a.gateStatus || "not approved"})`;
        block(`Cannot hand off ${trans[1]}: ${why}. A human approves the acceptance criteria in the AISDLC web UI, then /aisdlc-pm:pull ${trans[1]}.`);
      }
    }

    // 6.4 Jira apply: valid plan + user confirmation (also blocks node -e jira-pm). Decides and exits when it applies.
    handleJira(cmd);

    // 6.3 shell writes into the gated artifacts follow the same window as Write/Edit.
    const isStateTool = /aisdlc-state\.js/.test(cmd);
    const writeish = /(>>?\s|sed\s+-i|set-content|add-content|out-file|\btee\b|new-item|copy-item|move-item|\bmv\b|\bcp\b)/i;
    if (!isStateTool && writeish.test(cmd)) {
      const lc = cmd.replace(/\\/g, "/");
      for (const m of lc.matchAll(/(?:^|[\s"'=(])((?:\.\/)?tasks\/[^\s"'/|;&)]+\/(?:requirements|acceptance-criteria)\.md)/gi)) {
        const p = m[1].replace(/^\.\//, "");
        const g = gatedArtifact(norm(path.resolve(cwd, p)));
        if (!g) continue;
        const r = artifactWriteReason(g.ticket);
        if (r) block(r);
      }
    }
  }
  process.exit(0);
}

try {
  run();
} catch (e) {
  // Fail closed for jira-pm, fail open otherwise.
  let raw = "";
  try { raw = fs.readFileSync(0, "utf8"); } catch {}
  if (/jira-pm/i.test(raw)) ask("Confirm the Jira write for this ticket? Review the preview diff first.");
  process.exit(0);
}
