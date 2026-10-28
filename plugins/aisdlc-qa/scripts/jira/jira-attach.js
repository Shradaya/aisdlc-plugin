#!/usr/bin/env node
// Jira helper for the QA plugin (REST API v2, Jira wiki markup). Credentials come from environment variables only
// (names in config/integrations.yaml, jira.credentials); values are never printed. The site URL comes from
// jira.base_url in config/integrations.yaml, or JIRA_URL.
//
//   status  <T> [--since <iso-time>]           read-only: status, assignee, and comments posted after --since
//   attach  <T> <file...>                      upload evidence files (files already uploaded for <T> are skipped)
//   comment <T> <wiki-file>                    post a comment
//   defect  <T> <wiki-file> <file...>          upload failure screenshots, then post the defect comment
//                                              (the comment can embed them with !<file-name>|thumbnail!)
//   reply   <T> <comment-id> <wiki-file>       post a follow-up that links to an earlier comment (Jira comments are
//                                              flat; the follow-up starts with a link to the comment it answers)
// Options: --dry-run (no network and no credentials needed: prints what would be sent), --mention-assignee
// (prefix the comment with an @mention of the ticket's assignee; also on when jira.write.mention_assignee is true).
// Writes are refused unless enabled in config/integrations.yaml (jira.write.add_comment / add_attachment).
// Each upload and comment is recorded in tasks/<T>/task.yaml (jira.attachments / jira.comments) via the state CLI.
//
// Output: one JSON line. Exit codes: 0 ok, 1 error or writes disabled, 2 credentials or site URL missing.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const { readYaml } = require("../lib/yaml");

// Finishing reliably on Windows: see plugins/aisdlc-dev/scripts/git-hosting/bitbucket-pr.js for the full story.
// out() records the result and unwinds; the finalizer writes one JSON line, sets process.exitCode (no hard exit while
// the fetch socket may be closing), closes undici's global dispatcher, and keeps an unref'd timer as a last resort.
class Done extends Error {}
let RESULT = null;
const out = (o, code = 0) => {
  RESULT = { payload: o, code };
  throw new Done();
};
async function closeHttp() {
  try {
    const sym = Object.getOwnPropertySymbols(globalThis).find((s) => s.description === "undici.globalDispatcher.1");
    const dispatcher = sym && globalThis[sym];
    if (dispatcher && typeof dispatcher.close === "function") await dispatcher.close();
  } catch {}
}
async function finish(payload, code) {
  process.exitCode = code;
  await new Promise((resolve) => process.stdout.write(JSON.stringify(payload) + "\n", resolve));
  await closeHttp();
  setTimeout(() => process.exit(code), 3000).unref();
}

const ROOT = resolveRoot();
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const sinceIdx = argv.indexOf("--since");
const since = sinceIdx >= 0 ? argv[sinceIdx + 1] : null;
const positional = argv.filter((a, i) => !a.startsWith("--") && !(sinceIdx >= 0 && i === sinceIdx + 1));
const [cmd, ticket, ...rest] = positional;

const cfg = ((ROOT && readYaml(path.join(ROOT, "config", "integrations.yaml"), {})) || {}).jira || {};
const write = cfg.write || {};
const creds = cfg.credentials || {};
const emailVar = creds.email_env || "JIRA_EMAIL";
const tokenVar = creds.api_token_env || "JIRA_API_TOKEN";
const scheme = cfg.auth_scheme || "basic"; // "basic" (Jira Cloud: email + API token) or "bearer" (Data Center PAT)
const base = String(cfg.base_url || process.env.JIRA_URL || "").replace(/\/+$/, "");
const mention = argv.includes("--mention-assignee") || write.mention_assignee === true;

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const taskFile = () => path.join(ROOT, "tasks", ticket, "task.yaml");
const loadTask = () => (fs.existsSync(taskFile()) ? JSON.parse(fs.readFileSync(taskFile(), "utf8")) : null);
function record(dotted, value) {
  if (dryRun) return;
  spawnSync(process.execPath, [path.join(__dirname, "..", "state", "aisdlc-state.js"), "set", ticket, dotted, JSON.stringify(value)], {
    env: { ...process.env, AISDLC_ROOT: ROOT }, stdio: "ignore",
  });
}

function auth() {
  const token = process.env[tokenVar];
  if (scheme === "bearer") return token ? `Bearer ${token}` : null;
  const email = process.env[emailVar];
  return email && token ? "Basic " + Buffer.from(`${email}:${token}`).toString("base64") : null;
}

async function call(method, urlPath, { json, form } = {}) {
  const r = await fetch(base + urlPath, {
    method,
    keepalive: false,
    headers: {
      Authorization: auth(),
      Accept: "application/json",
      Connection: "close",
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(form ? { "X-Atlassian-Token": "no-check" } : {}),
    },
    body: json ? JSON.stringify(json) : form,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (body.errorMessages || []).concat(Object.values(body.errors || {})).join("; ") || "request failed";
    out({ ok: false, status: r.status, error: String(msg).slice(0, 300) }, 1);
  }
  return body;
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

async function main() {
  if (!ROOT) out({ ok: false, error: NOT_WORKSPACE }, 2);
  const usage = "usage: status|attach|comment|defect|reply <TICKET> ... [--dry-run] [--since <iso>] [--mention-assignee]";
  if (!cmd || !/^[A-Z][A-Z0-9]*-\d+$/.test(ticket || "")) out({ ok: false, error: usage }, 1);
  if (!dryRun) {
    if (!base) out({ ok: false, error: "Jira site URL missing: set jira.base_url in config/integrations.yaml (or JIRA_URL)" }, 2);
    if (!auth()) out({ ok: false, error: scheme === "bearer" ? `${tokenVar} must be set` : `${emailVar} and ${tokenVar} must both be set` }, 2);
  }

  if (cmd === "status") {
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
  } else out({ ok: false, error: `unknown command ${cmd}. ${usage}` }, 1);
}

main()
  .then(() => {
    if (!RESULT) RESULT = { payload: { ok: false, error: "no result produced" }, code: 1 };
  })
  .catch((e) => {
    if (e instanceof Done) return;
    RESULT = { payload: { ok: false, error: String(e.message || e).slice(0, 300) }, code: 1 };
  })
  .finally(() => {
    finish(RESULT.payload, RESULT.code);
  });
