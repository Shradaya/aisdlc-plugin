#!/usr/bin/env node
// Jira helper for the QA plugin, over the Jira REST API v2 (wiki markup; client: scripts/lib/jira.js, vendored core).
// No MCP server needed. Credentials come from environment variables only (names in config/integrations.yaml,
// jira.credentials); values are never printed. The site URL comes from jira.base_url in config/integrations.yaml,
// or JIRA_URL.
//
//   issue   <T> [--comments]                   read-only: the ticket (summary, type, status, description, acceptance
//                                              criteria, labels, priority, components, versions, parent, linked
//                                              issues, attachment names; comments with --comments)
//   status  <T> [--since <iso-time>]           read-only: status, assignee, and comments posted after --since
//   check                                      read-only: verify the site URL and credentials
//   attach  <T> <file...>                      upload evidence files (files already uploaded for <T> are skipped)
//   comment <T> <wiki-file>                    post a comment
//   defect  <T> <wiki-file> <file...>          upload failure screenshots, then post the defect comment
//                                              (the comment can embed them with !<file-name>|thumbnail!)
//   reply   <T> <comment-id> <wiki-file>       post a follow-up that links to an earlier comment (Jira comments are
//                                              flat; the follow-up starts with a link to the comment it answers)
//   transition <T> defect_found|verified       move the ticket through the workflow transition named in
//                                              jira.write.status_transitions.<key>; refused when that key is not
//                                              configured or the ticket's status does not offer that transition
// Options: --dry-run (no network and no credentials needed: prints what would be sent), --mention-assignee
// (prefix the comment with an @mention of the ticket's assignee; also on when jira.write.mention_assignee is true).
// Writes are refused unless enabled in config/integrations.yaml (jira.write.add_comment / add_attachment /
// status_transitions). Each upload, comment and transition is recorded in tasks/<T>/task.yaml (jira.attachments /
// jira.comments / jira.transitions) via the state CLI.
//
// Corporate TLS inspection (Cloudflare WARP, Zscaler): set NODE_EXTRA_CA_CERTS to the corporate root certificate.
// Output: one JSON line. Exit codes: 0 ok, 1 error or writes disabled, 2 credentials or site URL missing.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const jira = require("../lib/jira");

// Finishing reliably on Windows: see plugins/aisdlc-dev/scripts/git-hosting/bitbucket-pr.js for the full story.
// out() records the result and unwinds; the finalizer writes one JSON line, sets process.exitCode (no hard exit while
// the fetch socket may be closing), closes undici's global dispatcher, and keeps an unref'd timer as a last resort.
class Done extends Error {}
let RESULT = null;
const out = (o, code = 0) => {
  RESULT = { payload: o, code };
  throw new Done();
};
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
const sinceIdx = argv.indexOf("--since");
const since = sinceIdx >= 0 ? argv[sinceIdx + 1] : null;
const positional = argv.filter((a, i) => !a.startsWith("--") && !(sinceIdx >= 0 && i === sinceIdx + 1));
const [cmd, ticket, ...rest] = positional;

const J = jira.jiraConfig(ROOT);
const write = J.write;
const base = J.base;
const mention = argv.includes("--mention-assignee") || write.mention_assignee === true;
const call = (method, urlPath, opts) => jira.request(J, method, urlPath, opts);

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const taskFile = () => path.join(ROOT, "tasks", ticket, "task.yaml");
const loadTask = () => (fs.existsSync(taskFile()) ? JSON.parse(fs.readFileSync(taskFile(), "utf8")) : null);
function record(dotted, value) {
  if (dryRun) return;
  spawnSync(process.execPath, [path.join(__dirname, "..", "state", "aisdlc-state.js"), "set", ticket, dotted, JSON.stringify(value)], {
    env: { ...process.env, AISDLC_ROOT: ROOT }, stdio: "ignore",
  });
}

function requireWrite(...keys) {
  const off = keys.filter((k) => write[k] !== true);
  if (off.length && !dryRun)
    out({ ok: false, error: `Jira writes are disabled: set jira.write.${off.join(" and jira.write.")} to true in config/integrations.yaml` }, 1);
}

function readText(file) {
  if (!file || !fs.existsSync(file)) out({ ok: false, error: `file not found: ${file}` }, 1);
  return fs.readFileSync(file, "utf8");
}

async function withMention(text) {
  if (!mention) return text;
  if (dryRun) return `[~accountid:<assignee>] ${text}`;
  const issue = await call("GET", `/rest/api/2/issue/${encodeURIComponent(ticket)}?fields=assignee`);
  const id = issue.fields && issue.fields.assignee && issue.fields.assignee.accountId;
  return id ? `[~accountid:${id}] ${text}` : text;
}

// Upload files not yet uploaded for this ticket (dedup by content hash recorded in task state).
async function upload(files) {
  const known = ((loadTask() || {}).jira || {}).attachments || {};
  const uploaded = [], skipped = [];
  for (const f of files) {
    if (!fs.existsSync(f)) out({ ok: false, error: `file not found: ${f}` }, 1);
    const buf = fs.readFileSync(f);
    const key = sha(buf).slice(0, 16);
    const name = path.basename(f);
    if (known[key]) { skipped.push({ file: f, name, id: known[key].id, reason: "already uploaded" }); continue; }
    if (dryRun) { uploaded.push({ file: f, name, bytes: buf.length, would: `POST /rest/api/2/issue/${ticket}/attachments` }); continue; }
    const form = new FormData();
    form.append("file", new Blob([buf]), name);
    const res = await call("POST", `/rest/api/2/issue/${encodeURIComponent(ticket)}/attachments`, { form });
    const a = Array.isArray(res) ? res[0] : res;
    const entry = { id: String(a.id), name: a.filename || name, bytes: buf.length, uploaded_at: new Date().toISOString() };
    record(`jira.attachments.${key}`, entry);
    uploaded.push({ file: f, ...entry });
  }
  return { uploaded, skipped };
}

async function postComment(kind, text) {
  const body = await withMention(text);
  if (dryRun) return { would: `POST /rest/api/2/issue/${ticket}/comment`, kind, chars: body.length, preview: body.slice(0, 300) };
  const c = await call("POST", `/rest/api/2/issue/${encodeURIComponent(ticket)}/comment`, { json: { body } });
  const url = `${base}/browse/${ticket}?focusedCommentId=${c.id}`;
  record(`jira.comments.${c.id}`, { kind, url, posted_at: new Date().toISOString() });
  return { comment_id: String(c.id), url };
}

const TRANSITION_KEYS = ["defect_found", "verified"];

async function main() {
  if (!ROOT) out({ ok: false, error: NOT_WORKSPACE }, 2);
  const usage = "usage: issue|status|attach|comment|defect|reply|transition <TICKET> ... | check   [--dry-run] [--comments] [--since <iso>] [--mention-assignee]";
  if (!cmd || (cmd !== "check" && !/^[A-Z][A-Z0-9]*-\d+$/.test(ticket || ""))) out({ ok: false, error: usage }, 1);
  if (!dryRun && J.missing()) out({ ok: false, error: J.missing() }, 2);

  if (cmd === "check") {
    if (dryRun) out({ ok: true, dry_run: true, would: ["GET /rest/api/2/myself"] });
    out({ ok: true, connected: true, base_url: base, ...(await jira.checkConnection(J)) });
  } else if (cmd === "issue") {
    if (dryRun) out({ ok: true, dry_run: true, would: jira.issueRequests(J, ticket, { comments: withComments }) });
    out({ ok: true, ...(await jira.fetchIssue(J, ticket, { comments: withComments })) });
  } else if (cmd === "status") {
    if (dryRun) out({ ok: true, dry_run: true, would: [`GET /rest/api/2/issue/${ticket}?fields=status,assignee,updated`, `GET /rest/api/2/issue/${ticket}/comment`] });
    const issue = await call("GET", `/rest/api/2/issue/${encodeURIComponent(ticket)}?fields=status,assignee,updated`);
    const list = await call("GET", `/rest/api/2/issue/${encodeURIComponent(ticket)}/comment?orderBy=created&maxResults=100`);
    const after = since ? Date.parse(since) : 0;
    const comments = (list.comments || [])
      .filter((c) => Date.parse(c.created) > after)
      .map((c) => ({ id: String(c.id), author: (c.author || {}).displayName || null, created: c.created, text: String(c.body || "").slice(0, 800) }));
    out({
      ok: true, ticket,
      status: ((issue.fields || {}).status || {}).name || null,
      assignee: ((issue.fields || {}).assignee || {}).displayName || null,
      updated: (issue.fields || {}).updated || null,
      comments_since: since, comments,
    });
  } else if (cmd === "attach") {
    requireWrite("add_attachment");
    if (!rest.length) out({ ok: false, error: "usage: attach <TICKET> <file...>" }, 1);
    out({ ok: true, ticket, dry_run: dryRun, ...(await upload(rest)) });
  } else if (cmd === "comment") {
    requireWrite("add_comment");
    out({ ok: true, ticket, dry_run: dryRun, ...(await postComment("results", readText(rest[0]))) });
  } else if (cmd === "defect") {
    const [file, ...shots] = rest;
    requireWrite("add_comment", ...(shots.length ? ["add_attachment"] : []));
    const text = readText(file);
    const files = await upload(shots);
    out({ ok: true, ticket, dry_run: dryRun, ...files, ...(await postComment("defect", text)) });
  } else if (cmd === "reply") {
    const [commentId, file] = rest;
    if (!/^\d+$/.test(commentId || "")) out({ ok: false, error: "usage: reply <TICKET> <comment-id> <wiki-file>" }, 1);
    requireWrite("add_comment");
    const text = `In reply to [this comment|${base}/browse/${ticket}?focusedCommentId=${commentId}]:\n\n${readText(file)}`;
    out({ ok: true, ticket, dry_run: dryRun, in_reply_to: commentId, ...(await postComment("reply", text)) });
  } else if (cmd === "transition") {
    const key = rest[0];
    if (!TRANSITION_KEYS.includes(key)) out({ ok: false, error: `usage: transition <TICKET> ${TRANSITION_KEYS.join("|")}` }, 1);
    // Only explicitly configured transitions, never a guessed mapping (not even in a dry run).
    const target = (write.status_transitions || {})[key];
    if (!target || typeof target !== "string")
      out({ ok: false, error: `no transition configured: set jira.write.status_transitions.${key} to the exact Jira transition name in config/integrations.yaml` }, 1);
    if (dryRun) out({ ok: true, ticket, dry_run: true, key, transition: target, would: [`GET /rest/api/2/issue/${ticket}/transitions`, `POST /rest/api/2/issue/${ticket}/transitions`] });
    const t = await jira.transitionIssue(J, ticket, target);
    record(`jira.transitions.${key}`, { name: t.name, from: t.from, to: t.to, at: new Date().toISOString() });
    out({ ok: true, ticket, key, transition: t.name, from: t.from, to: t.to });
  } else out({ ok: false, error: `unknown command ${cmd}. ${usage}` }, 1);
}

main()
  .then(() => {
    if (!RESULT) RESULT = { payload: { ok: false, error: "no result produced" }, code: 1 };
  })
  .catch((e) => {
    if (e instanceof Done) return;
    if (e instanceof jira.JiraError) RESULT = { payload: e.payload, code: e.code };
    else RESULT = { payload: { ok: false, error: String(e.message || e).slice(0, 300) }, code: 1 };
  })
  .finally(() => {
    finish(RESULT.payload, RESULT.code);
  });
