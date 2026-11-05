#!/usr/bin/env node
// Jira helper for the design plugin, over the Jira REST API v2 (wiki markup; client: scripts/lib/jira.js, vendored
// core). No MCP server needed. Credentials come from environment variables only (names in config/integrations.yaml,
// jira.credentials); values are never printed. The site URL comes from jira.base_url in config/integrations.yaml,
// or JIRA_URL.
//
//   check                                      read-only: verify the site URL and credentials
//   attach  <T> <file...>                      upload files to the ticket (files already uploaded for <T> are skipped)
//   comment <T> <wiki-file>                    post a comment (body read from the given wiki-markup file)
//   post    <T> <wiki-file> <file...>          upload the design files, then post a comment that lists/embeds them
//                                              (image files are embedded as !<name>|thumbnail!; others are linked by
//                                              name). This is what /aisdlc-design:comment uses to publish a version.
//
// Options: --dry-run (no network and no credentials needed: prints what would be sent).
// Writes are refused unless enabled in config/integrations.yaml (jira.write.add_comment / add_attachment). Each
// upload and comment is recorded in tasks/<T>/task.yaml (jira.attachments / jira.comments) via the state CLI.
//
// Corporate TLS inspection (Cloudflare WARP, Zscaler): set NODE_EXTRA_CA_CERTS to the corporate root certificate.
// Output: one JSON line. Exit codes: 0 ok, 1 error or writes disabled, 2 credentials or site URL missing.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const jira = require("../lib/jira");

// Finishing reliably on Windows: out() records the result and unwinds; the finalizer writes one JSON line, sets
// process.exitCode (no hard exit while the fetch socket may be closing), closes undici's global dispatcher, and keeps
// an unref'd timer as a last resort.
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
const positional = argv.filter((a) => !a.startsWith("--"));
const [cmd, ticket, ...rest] = positional;

const J = jira.jiraConfig(ROOT);
const write = J.write;
const base = J.base;
const call = (method, urlPath, opts) => jira.request(J, method, urlPath, opts);

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
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

// Expand any directories in the file list to the files they contain (recursively), so a caller can pass a version
// folder and get every design file in it. Returns absolute paths, de-duplicated, in a stable order.
function expandFiles(inputs) {
  const seen = new Set();
  const acc = [];
  const walk = (p) => {
    const abs = path.resolve(p);
    let st;
    try { st = fs.statSync(abs); } catch { out({ ok: false, error: `file not found: ${p}` }, 1); }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(abs).sort()) walk(path.join(abs, name));
    } else if (st.isFile()) {
      if (!seen.has(abs)) { seen.add(abs); acc.push(abs); }
    }
  };
  for (const p of inputs) walk(p);
  if (!acc.length) out({ ok: false, error: "no files to upload" }, 1);
  return acc;
}

// Upload files not yet uploaded for this ticket (dedup by content hash recorded in task state).
async function upload(files) {
  const known = ((loadTask() || {}).jira || {}).attachments || {};
  const uploaded = [], skipped = [];
  for (const f of files) {
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
  if (dryRun) return { would: `POST /rest/api/2/issue/${ticket}/comment`, kind, chars: text.length, preview: text.slice(0, 300) };
  const c = await call("POST", `/rest/api/2/issue/${encodeURIComponent(ticket)}/comment`, { json: { body: text } });
  const url = `${base}/browse/${ticket}?focusedCommentId=${c.id}`;
  record(`jira.comments.${c.id}`, { kind, url, posted_at: new Date().toISOString() });
  return { comment_id: String(c.id), url };
}

// A wiki-markup block that lists the uploaded files: images embedded as thumbnails, others as a bulleted name list.
function filesBlock(files) {
  const names = files.map((f) => (f.name || path.basename(f.file)));
  const images = names.filter((n) => IMAGE_EXT.has(path.extname(n).slice(1).toLowerCase()));
  const others = names.filter((n) => !IMAGE_EXT.has(path.extname(n).slice(1).toLowerCase()));
  const lines = [];
  if (images.length) lines.push(images.map((n) => `!${n}|thumbnail!`).join(" "));
  for (const n of others) lines.push(`* [^${n}]`);
  return lines.join("\n");
}

async function main() {
  if (!ROOT) out({ ok: false, error: NOT_WORKSPACE }, 2);
  const usage = "usage: attach|comment|post <TICKET> ... | check   [--dry-run]";
  if (!cmd || (cmd !== "check" && !/^[A-Z][A-Z0-9]*-\d+$/.test(ticket || ""))) out({ ok: false, error: usage }, 1);
  if (!dryRun && J.missing()) out({ ok: false, error: J.missing() }, 2);

  if (cmd === "check") {
    if (dryRun) out({ ok: true, dry_run: true, would: ["GET /rest/api/2/myself"] });
    out({ ok: true, connected: true, base_url: base, ...(await jira.checkConnection(J)) });
  } else if (cmd === "attach") {
    requireWrite("add_attachment");
    if (!rest.length) out({ ok: false, error: "usage: attach <TICKET> <file...>" }, 1);
    out({ ok: true, ticket, dry_run: dryRun, ...(await upload(expandFiles(rest))) });
  } else if (cmd === "comment") {
    requireWrite("add_comment");
    if (!rest[0]) out({ ok: false, error: "usage: comment <TICKET> <wiki-file>" }, 1);
    out({ ok: true, ticket, dry_run: dryRun, ...(await postComment("design", readText(rest[0]))) });
  } else if (cmd === "post") {
    const [wikiFile, ...fileArgs] = rest;
    if (!wikiFile || !fileArgs.length) out({ ok: false, error: "usage: post <TICKET> <wiki-file> <file...>" }, 1);
    requireWrite("add_comment", "add_attachment");
    const header = readText(wikiFile);
    const files = expandFiles(fileArgs);
    const up = await upload(files);
    // The comment embeds/links every file in this version, whether just uploaded or already present on the ticket.
    const all = [...up.uploaded, ...up.skipped];
    const body = `${header.trim()}\n\n${filesBlock(all)}`.trim();
    out({ ok: true, ticket, dry_run: dryRun, ...up, ...(await postComment("design", body)) });
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
