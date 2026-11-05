#!/usr/bin/env node
// Jira sync for the PM plugin, over the Jira REST API v2 (wiki markup; client: scripts/lib/jira.js, vendored core).
// Modelled on the QA plugin's scripts/jira/jira-attach.js (same Done/finish result handling, closeHttp, unref'd exit
// timer for Windows). Credentials come from environment variables only (names in config/integrations.yaml,
// jira.credentials); values are never printed, saved or returned. The site URL comes from jira.base_url
// (or JIRA_URL).
//
//   check                                                       read-only: verify the site URL and credentials
//   issue   <T> [--comments]                                    read-only: ticket summary, description, AC (fetchIssue)
//   preview <T> [--dry-run] [--allow-unlinked]                  read-only: render the managed block, diff against the
//           [--allow-secret-rule generic_assignment]            live description, write tasks/<T>/jira-sync-plan.json
//   apply   <T> --plan <planId> [--dry-run] [--allow-unlinked]  the ONLY write: PUT /rest/api/2/issue/<T> after a backup
//           [--allow-secret-rule generic_assignment]
//
// The requirements/acceptance-criteria are written into a delimited managed block of the Jira description (h6. BEGIN
// .. h6. END markers): idempotent, preserves text outside the block (in the wiki-markup view Jira returns; ADF content
// may be re-rendered by Jira's own round trip, which is why apply writes a pre-write backup file). The optional AC
// custom field is set in the same PUT only when jira.acceptance_criteria_field is configured AND
// jira.write.update_acceptance_criteria_field is exactly true.
//
// There is no atomic compare-and-set in Jira's REST API, so a human edit between apply's re-fetch and the PUT
// (milliseconds) could still be overwritten. This is accepted; the preview-to-apply gap is covered by the hash check.
//
// Corporate TLS inspection (Cloudflare WARP, Zscaler): set NODE_EXTRA_CA_CERTS to the corporate root certificate.
// Output: one JSON line. Exit codes: 0 ok, 1 error/refusal/writes disabled, 2 credentials or site URL missing.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const jira = require("../lib/jira");
const { toWiki } = require("../lib/md-wiki");
const { jiraWritePrecheck } = require("../lib/pm-server-check");

// ---- Done/finish, identical mechanics to jira-attach.js ------------------------------------------------------------
class Done extends Error {}
let RESULT = null;
const out = (o, code = 0) => { RESULT = { payload: o, code }; throw new Done(); };
async function finish(payload, code) {
  process.exitCode = code;
  await new Promise((resolve) => process.stdout.write(JSON.stringify(payload) + "\n", resolve));
  await jira.closeHttp();
  setTimeout(() => process.exit(code), 3000).unref();
}

const ROOT = resolveRoot();
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const withComments = argv.includes("--comments");
const allowUnlinked = argv.includes("--allow-unlinked");
// --plan <id>
const planIdx = argv.indexOf("--plan");
const planArg = planIdx >= 0 ? argv[planIdx + 1] : null;
// --allow-secret-rule <rule> (repeatable; only generic_assignment is accepted).
const allowedSecretRules = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === "--allow-secret-rule") allowedSecretRules.push(argv[i + 1]);
// Positional arguments: everything that is not a flag or a flag's value.
const flagValueIdx = new Set();
if (planIdx >= 0) flagValueIdx.add(planIdx + 1);
for (let i = 0; i < argv.length; i++) if (argv[i] === "--allow-secret-rule") flagValueIdx.add(i + 1);
const positional = argv.filter((a, i) => !a.startsWith("--") && !flagValueIdx.has(i));
const [cmd, ticket] = positional;

const J = jira.jiraConfig(ROOT);
const write = J.write;
const base = J.base;
const call = (method, urlPath, opts) => jira.request(J, method, urlPath, opts);
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// ---- paths ---------------------------------------------------------------------------------------------------------
const taskDir = (T) => path.join(ROOT, "tasks", T);
const reqPath = (T) => path.join(taskDir(T), "requirements.md");
const acPath = (T) => path.join(taskDir(T), "acceptance-criteria.md");
const planPath = (T) => path.join(taskDir(T), "jira-sync-plan.json");

// Record jira.pm_sync in task.yaml via the state CLI (best effort; failures are ignored).
function record(T, dotted, value) {
  if (dryRun) return;
  try {
    spawnSync(process.execPath, [path.join(__dirname, "..", "state", "aisdlc-state.js"), "set", T, dotted, JSON.stringify(value)],
      { env: { ...process.env, AISDLC_ROOT: ROOT }, stdio: "ignore" });
  } catch {}
}

// ---- managed block -------------------------------------------------------------------------------------------------
const BEGIN = "h6. AISDLC:BEGIN requirements-and-acceptance-criteria v1 (managed by aisdlc-pm; edit in the PM workspace, not here)";
const END = "h6. AISDLC:END";
const MARKER_RE = /^\s*h6\.\s*AISDLC:(BEGIN|END)\b/;
const MAX_INPUT = 15000;    // each local file
const MAX_DESC = 32000;     // final Jira description (field limit is 32,767)

// Secret scan rules. The hard rules are never overridable; generic_assignment is soft (allowable per-run).
const SECRET_RULES = [
  { name: "private_key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "aws_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "github_token", re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { name: "slack_token", re: /\bxox[bp]-[A-Za-z0-9-]{10,}\b/ },
  { name: "atlassian_token", re: /\bATATT[A-Za-z0-9._-]{10,}\b/ },
  { name: "generic_assignment", re: /(token|secret|password|api[_-]?key)\s*[=:]\s*["']?(?=\S{16,})(?=\S*\d)(?=\S*[A-Za-z])\S+/i, soft: true },
];

function scanSecrets(text, label, allowed) {
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const rule of SECRET_RULES) {
      if (rule.re.test(lines[i])) {
        if (rule.soft && allowed.includes(rule.name)) continue;
        out({ ok: false, error: "secret_detected", rule: rule.name, file: label, line: i + 1, hint: "Remove the secret from the file (the value is not shown). Re-run preview." }, 1);
      }
    }
  }
}

// Read a required local file: exists, non-empty after trim, UTF-8, <= MAX_INPUT chars.
function readInput(T, file, label) {
  if (!fs.existsSync(file)) out({ ok: false, error: "files_missing", file: label, hint: `Draft ${label} first (/aisdlc-pm:requirements ${T} and /aisdlc-pm:acceptance-criteria ${T}).` }, 1);
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { out({ ok: false, error: "files_missing", file: label }, 1); }
  if (!text.trim()) out({ ok: false, error: "files_missing", file: label, hint: `${label} is empty.` }, 1);
  if (text.length > MAX_INPUT) out({ ok: false, error: "too_large", file: label, chars: text.length, limit: MAX_INPUT }, 1);
  return text;
}

// Drop a leading H1 (per design 5.2: the caller drops it), then convert.
function stripLeadingH1(md) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && /^\s*#\s+/.test(lines[i])) lines.splice(i, 1);
  return lines.join("\n");
}

// Build the managed block from the two local files.
function buildBlock(reqText, acText) {
  const req = toWiki(stripLeadingH1(reqText), { headings: "demote" });
  const ac = toWiki(stripLeadingH1(acText), { headings: "bold" });
  return [BEGIN, "h3. Requirements", req, "h3. Acceptance Criteria", ac, END].join("\n");
}

// The AC wiki text (for the optional AC custom field): no managed-block markers, bold headings.
function buildAcWiki(acText) {
  return toWiki(stripLeadingH1(acText), { headings: "bold" });
}

// Find a single well-formed managed block. Returns { action, start, end } or fails markers_corrupt.
function locateBlock(descLines) {
  const begins = [], ends = [];
  descLines.forEach((l, idx) => {
    const m = l.match(MARKER_RE);
    if (m && m[1] === "BEGIN") begins.push(idx);
    if (m && m[1] === "END") ends.push(idx);
  });
  if (begins.length === 0 && ends.length === 0) return { present: false };
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0])
    out({ ok: false, error: "markers_corrupt", hint: "The Jira description has a malformed AISDLC managed block (not exactly one BEGIN before one END). Fix it by hand; the script will not guess." }, 1);
  return { present: true, start: begins[0], end: ends[0] };
}

// Compose the new description: append the block (empty desc -> just the block) or replace the existing block lines.
function composeDescription(before, block) {
  const lines = before === "" ? [] : before.split("\n");
  const loc = locateBlock(lines);
  if (!loc.present) {
    const next = before === "" ? block : before + "\n\n" + block;
    return { action: "append", after: next };
  }
  const head = lines.slice(0, loc.start);
  const tail = lines.slice(loc.end + 1);
  const after = head.concat(block.split("\n"), tail).join("\n");
  return { action: "replace", after };
}

// Unmanaged-AC warning: an "Acceptance Criteria" start-rule line that appears before the BEGIN marker (so
// acFromDescription would start there, outside the block).
function unmanagedAcWarning(before) {
  const lines = before.split("\n");
  const begin = lines.findIndex((l) => MARKER_RE.test(l) && /BEGIN/.test(l));
  const scan = begin < 0 ? lines : lines.slice(0, begin);
  const AC_START_RE = require("../lib/md-wiki").AC_START_RE;
  return scan.some((l) => AC_START_RE.test(l));
}

// ---- diff (small LCS, 3 lines of context) --------------------------------------------------------------------------
function diffLines(a, b, context = 3) {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ t: " ", s: A[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ t: "-", s: A[i] }); i++; }
    else { ops.push({ t: "+", s: B[j] }); j++; }
  }
  while (i < n) { ops.push({ t: "-", s: A[i] }); i++; }
  while (j < m) { ops.push({ t: "+", s: B[j] }); j++; }
  // Keep only changed regions plus `context` lines of surrounding unchanged lines.
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, k) => {
    if (o.t !== " ") for (let d = -context; d <= context; d++) if (ops[k + d]) keep[k + d] = true;
  });
  const result = [];
  let lastKept = -2;
  ops.forEach((o, k) => {
    if (!keep[k]) return;
    if (k > lastKept + 1) result.push("@@");
    result.push(o.t + o.s);
    lastKept = k;
  });
  return result.join("\n");
}

// ---- plan file -----------------------------------------------------------------------------------------------------
function makePlan(T, beforeHash, sectionHash, acField) {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000); // 30 min TTL
  const body = {
    ticket: T,
    before_hash: beforeHash,
    section_hash: sectionHash,
    ac_field: acField,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    allowed_secret_rules: allowedSecretRules.slice(),
    allow_unlinked: allowUnlinked,
  };
  const planId = sha(Buffer.from(JSON.stringify(body))).slice(0, 16);
  return { plan_id: planId, ...body };
}

function writePlan(T, plan) {
  try {
    fs.writeFileSync(planPath(T), JSON.stringify(plan, null, 2));
  } catch (e) {
    out({ ok: false, error: "cannot write plan: " + String((e && e.code) || e.message || e) }, 1);
  }
}

function readPlan(T) {
  try { return JSON.parse(fs.readFileSync(planPath(T), "utf8")); } catch { return null; }
}

// ---- raw description read (never fetchIssue: it clips at MAX_TEXT and would truncate the description) ---------------
async function readRawDescription(T, acId) {
  const raw = await call("GET", `/rest/api/2/issue/${encodeURIComponent(T)}?fields=description${acId ? "," + acId : ""}`);
  if (!raw || !raw.fields) out({ ok: false, error: "description_unreadable", hint: "Jira returned no description field for this ticket." }, 1);
  const d = raw.fields.description;
  if (d !== null && d !== undefined && typeof d !== "string")
    out({ ok: false, error: "description_unreadable", hint: "The Jira description is not plain text (e.g. an ADF object); the script will not overwrite it." }, 1);
  return typeof d === "string" ? d : "";
}

// ---- resolve the AC custom field (configured only; never the name-discovery path here) -----------------------------
function acFieldConfig() {
  const id = J.acField || null;
  const switchOn = write.update_acceptance_criteria_field === true;
  return { id, switchOn };
}

// ====================================================================================================================
function usage() {
  return "usage: check | issue <T> [--comments] | preview <T> [--dry-run] [--allow-unlinked] [--allow-secret-rule generic_assignment] | apply <T> --plan <id> [--dry-run] [--allow-unlinked] [--allow-secret-rule generic_assignment]";
}

function validateSecretFlags() {
  for (const r of allowedSecretRules) {
    if (r !== "generic_assignment")
      out({ ok: false, error: `usage: --allow-secret-rule accepts only 'generic_assignment' (got '${r}'); specific rules are never overridable` }, 1);
  }
}

async function cmdCheck() {
  if (dryRun) out({ ok: true, dry_run: true, would: ["GET /rest/api/2/myself"] });
  out({ ok: true, connected: true, base_url: base, ...(await jira.checkConnection(J)) });
}

async function cmdIssue(T) {
  if (dryRun) out({ ok: true, dry_run: true, would: jira.issueRequests(J, T, { comments: withComments }) });
  out({ ok: true, ...(await jira.fetchIssue(J, T, { comments: withComments })) });
}

// Shared preparation for preview/apply: validate flags, read + scan the local files, build the block.
function prepareLocal(T) {
  validateSecretFlags();
  const reqText = readInput(T, reqPath(T), "requirements.md");
  const acText = readInput(T, acPath(T), "acceptance-criteria.md");
  scanSecrets(reqText, "requirements.md", allowedSecretRules);
  scanSecrets(acText, "acceptance-criteria.md", allowedSecretRules);
  const block = buildBlock(reqText, acText);
  const acWiki = buildAcWiki(acText);
  return { reqText, acText, block, acWiki };
}

async function cmdPreview(T) {
  const writesEnabled = write.update_description === true;
  const { block, acWiki } = prepareLocal(T);
  const sectionHash = sha(Buffer.from(block));
  const acCfg = acFieldConfig();
  const acOn = writesEnabled && acCfg.id && acCfg.switchOn;
  const acFieldInfo = acCfg.id ? { id: acCfg.id, action: acOn ? "set" : "skipped" } : null;

  // Server check (read-only; never fails preview).
  const serverCheck = jiraWritePrecheck(ROOT, T, { allowUnlinked });

  if (dryRun) {
    // No network, no credentials, no plan file.
    out({
      ok: true, ticket: T, dry_run: true, writes_enabled: writesEnabled,
      ...(writesEnabled ? {} : { hint: "set jira.write.update_description to true before apply" }),
      plan_id: null, rendered_block: block,
      would: [`GET /rest/api/2/issue/${T}?fields=description${acCfg.id ? "," + acCfg.id : ""}`],
      ac_field: acFieldInfo, server_check: serverCheck, allow_unlinked: allowUnlinked,
    });
  }

  if (!dryRun && J.missing()) out({ ok: false, error: J.missing() }, 2);
  const before = await readRawDescription(T, acCfg.id);
  const beforeHash = sha(Buffer.from(before));
  const { action, after } = composeDescription(before, block);
  if (after.length > MAX_DESC) out({ ok: false, error: "too_large", chars: after.length, limit: MAX_DESC, hint: "The managed block plus the existing description exceeds Jira's field limit." }, 1);
  const warnings = [];
  if (unmanagedAcWarning(before)) warnings.push("unmanaged_ac_heading");
  const diff = action === "unchanged" ? "" : diffLines(before, after, 3);
  const realAction = before !== "" && after === before ? "unchanged" : action;

  let planId = null;
  if (writesEnabled && realAction !== "unchanged") {
    const plan = makePlan(T, beforeHash, sectionHash, acOn ? { id: acCfg.id, hash: sha(Buffer.from(acWiki)) } : null);
    writePlan(T, plan);
    planId = plan.plan_id;
  }

  out({
    ok: true, ticket: T, writes_enabled: writesEnabled,
    ...(writesEnabled ? {} : { hint: "set jira.write.update_description to true before apply" }),
    plan_id: planId, action: realAction, warnings,
    description: { before_chars: before.length, after_chars: after.length },
    ac_field: acFieldInfo, server_check: serverCheck, allow_unlinked: allowUnlinked,
    diff,
  });
}

async function cmdApply(T) {
  // 1. usage: --plan required and well-formed.
  if (!planArg || !/^[0-9a-f]{16}$/.test(planArg)) out({ ok: false, error: "usage: apply <T> --plan <16-hex plan id> [--dry-run] [--allow-unlinked] [--allow-secret-rule generic_assignment]" }, 1);
  validateSecretFlags();

  // 2. writes_disabled (checked before the plan and any network call).
  const writesEnabled = write.update_description === true;
  if (!writesEnabled && !dryRun)
    out({ ok: false, error: "writes_disabled", hint: "Jira writes are disabled: set jira.write.update_description to true in config/integrations.yaml" }, 1);

  // 3. credentials/base_url present (unless --dry-run).
  if (!dryRun && J.missing()) out({ ok: false, error: J.missing() }, 2);

  // 4. plan lookup / ticket / expiry / flags.
  const plan = readPlan(T);
  if (!plan) out({ ok: false, error: "plan_not_found", hint: `Run preview first (/aisdlc-pm:jira-sync ${T}).` }, 1);
  if (plan.ticket !== T || plan.plan_id !== planArg) out({ ok: false, error: "plan_not_found", hint: "The plan does not match this ticket/id; run preview again." }, 1);
  if (!(Date.parse(plan.expires_at) > Date.now())) out({ ok: false, error: "plan_expired", hint: `Run preview again (/aisdlc-pm:jira-sync ${T}).` }, 1);
  const planRules = (plan.allowed_secret_rules || []).slice().sort();
  const myRules = allowedSecretRules.slice().sort();
  if (JSON.stringify(planRules) !== JSON.stringify(myRules) || Boolean(plan.allow_unlinked) !== allowUnlinked)
    out({ ok: false, error: "plan_flags_mismatch", hint: "Run preview again with the same --allow-unlinked / --allow-secret-rule flags." }, 1);

  // 5. local files + secret scan + build block.
  const { block, acWiki } = prepareLocal(T);
  const sectionHash = sha(Buffer.from(block));
  const acCfg = acFieldConfig();
  const acOn = writesEnabled && acCfg.id && acCfg.switchOn;

  // 6. server check: apply without --dry-run refuses (before the backup and any PUT).
  const serverCheck = jiraWritePrecheck(ROOT, T, { allowUnlinked });
  if (!dryRun && !serverCheck.ok)
    out({ ok: false, error: serverCheck.reason, hint: serverCheck.hint, server_check: serverCheck }, 1);

  if (dryRun) {
    // Validate plan/files/hashes against a raw read ONLY if we have network; dry-run needs no network.
    out({
      ok: true, ticket: T, dry_run: true, updated: false, writes_enabled: writesEnabled,
      action: "would-apply", server_check: serverCheck,
      would: { method: "PUT", path: `/rest/api/2/issue/${T}`, fields: ["description"].concat(acOn ? [acCfg.id] : []), description_chars: "(computed at apply time)" },
    });
  }

  // 7. raw read + description_unreadable / markers / hash re-checks.
  const before = await readRawDescription(T, acCfg.id);
  const beforeHash = sha(Buffer.from(before));
  if (beforeHash !== plan.before_hash) out({ ok: false, error: "description_changed", hint: `The Jira description changed since preview; run preview again (/aisdlc-pm:jira-sync ${T}).` }, 1);
  if (sectionHash !== plan.section_hash) out({ ok: false, error: "local_files_changed", hint: `requirements.md or acceptance-criteria.md changed since preview; run preview again (/aisdlc-pm:jira-sync ${T}).` }, 1);

  const { action, after } = composeDescription(before, block);
  const realAction = before !== "" && after === before ? "unchanged" : action;
  if (after.length > MAX_DESC) out({ ok: false, error: "too_large", chars: after.length, limit: MAX_DESC }, 1);

  if (realAction === "unchanged") {
    // No PUT; delete the plan and report.
    try { fs.unlinkSync(planPath(T)); } catch {}
    out({ ok: true, ticket: T, updated: false, action: "unchanged", backup: null, fields: [], url: `${base}/browse/${T}` });
  }

  // 8. pre-PUT backup (refuse on failure; nothing sent).
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const backupRel = `tasks/${T}/jira-description-backup-${ts}.txt`;
  const backupAbs = path.join(ROOT, backupRel);
  try {
    fs.writeFileSync(backupAbs, before, "utf8");
  } catch (e) {
    out({ ok: false, error: "backup_failed", hint: `Could not write the pre-write backup (${String((e && e.code) || e.message || e)}); nothing was sent to Jira.` }, 1);
  }

  // 9. the single PUT (description, and the AC field only when both switches are on).
  const fields = { description: after, ...(acOn ? { [acCfg.id]: acWiki } : {}) };
  await call("PUT", `/rest/api/2/issue/${encodeURIComponent(T)}`, { json: { fields } });

  // 10. success: delete the plan, best-effort record jira.pm_sync.
  try { fs.unlinkSync(planPath(T)); } catch {}
  const fieldNames = ["description"].concat(acOn ? [acCfg.id] : []);
  record(T, "jira.pm_sync", { section_hash: sectionHash, at: new Date().toISOString(), fields: fieldNames });

  out({ ok: true, ticket: T, updated: true, action: realAction, backup: backupRel, fields: fieldNames, url: `${base}/browse/${T}` });
}

async function main() {
  if (!ROOT) out({ ok: false, error: NOT_WORKSPACE }, 2);
  if (!cmd) out({ ok: false, error: usage() }, 1);
  if (cmd === "check") { await cmdCheck(); return; }
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(ticket || "")) out({ ok: false, error: usage() }, 1);
  if (cmd === "issue") { await cmdIssue(ticket); return; }
  if (cmd === "preview") { await cmdPreview(ticket); return; }
  if (cmd === "apply") { await cmdApply(ticket); return; }
  out({ ok: false, error: `unknown command ${cmd}. ${usage()}` }, 1);
}

main()
  .then(() => { if (!RESULT) RESULT = { payload: { ok: false, error: "no result produced" }, code: 1 }; })
  .catch((e) => {
    if (e instanceof Done) return;
    if (e instanceof jira.JiraError) RESULT = { payload: e.payload, code: e.code };
    else RESULT = { payload: { ok: false, error: String(e.message || e).slice(0, 300) }, code: 1 };
  })
  .finally(() => { finish(RESULT.payload, RESULT.code); });
