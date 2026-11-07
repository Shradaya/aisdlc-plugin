#!/usr/bin/env node
// Status page for the shared aisdlc repo: every ticket's flow across roles (PM, Design, Dev, QA), its hand-offs and open
// change requests, and the ticket's documents (requirements, acceptance criteria, specification, design pages ...) to
// read in the page. Read-only, localhost only, no dependencies.
//
//   node status-server.js [--port 4320]                    serve http://localhost:4320 (refreshes every few seconds)
//   node status-server.js --json [TICKET]                  print the status (or one ticket's detail) as JSON and exit
//   node status-server.js --export file.html [--with-docs] write a self-contained snapshot page and exit
//
// Data: flow.js (tasks/<TICKET>/task.<role>.yaml, handoffs/*.json, designs/<TICKET>/), execution-log.<role>.jsonl, and the
// markdown documents and design pages under tasks/<TICKET>/ and designs/<TICKET>/. Nothing is ever written.
const fs = require("fs");
const http = require("http");
const path = require("path");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const { readYaml } = require("../lib/yaml");
const flow = require("../flow/flow");
const auditlog = require("../lib/auditlog");
const crypto = require("crypto");

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const ROOT = resolveRoot();
if (!ROOT) { console.error(NOT_WORKSPACE); process.exit(2); }

const PORT = Number(opt("--port", 4320));
const PAGE = path.join(__dirname, "status-page.html");
const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;
const CREDENTIALS = ["JIRA_EMAIL", "JIRA_API_TOKEN", "BITBUCKET_EMAIL", "BITBUCKET_API_TOKEN", "QA_USERNAME", "QA_PASSWORD"];
const DOC_DENY = /(^|\/)(\.env(\..*)?|\.auth|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)(\.pub)?|\.lock.*|.*\.tmp|support\.js)(\/|$)/i;
const TEXT_EXT = new Set(["md", "markdown", "txt", "yaml", "yml", "json", "jsonl", "log", "diff", "patch", "csv", "sql", "xml", "html", "css", "ts", "tsx", "js", "jsx", "py", "java", "cs", "go", "sh", "ps1"]);
const IMAGE_TYPE = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
const DESIGN_TYPE = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf" };
const MAX_DOC_BYTES = 2 * 1024 * 1024;
// Hand-off events are shown in the History card, not as documents.
const NOT_DOCS = /(^|\/)handoffs(\/|$)/;
const BLOCKING = ["BLOCKED", "CONFLICTED", "FAILED", "WAITING_FOR_INPUT"];

const workspaceName = () => { const w = readYaml(path.join(ROOT, "config", "workspace.yaml"), {}); return (w.workspace && w.workspace.name) || path.basename(ROOT); };
const myRole = () => { try { return flow.resolveRole(ROOT); } catch { return null; } };
const taskDir = (id) => path.join(ROOT, "tasks", id);
const designDir = (id) => path.join(ROOT, "designs", id);

function title(id) {
  for (const f of ["jira.md", "requirements.md"]) {
    try {
      const md = fs.readFileSync(path.join(taskDir(id), f), "utf8");
      const field = md.match(/^\s*(?:[-*]\s*)?\**(?:title|summary)\**\s*[:|]\s*\**\s*(.+?)\s*\**\s*\|?\s*$/im);
      if (field) return field[1].replace(/\*+/g, "").trim();
      const h = md.match(/^#\s+(.+)$/m);
      if (h) { const t = h[1].replace(new RegExp("^" + id + "\\s*[:-]?\\s*"), "").trim(); if (t) return t; }
    } catch { /* next */ }
  }
  return null;
}

function readLog(file, role) {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => { try { return { ...JSON.parse(l), role }; } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
function audit(id, order) {
  const ev = [];
  for (const r of order) ev.push(...readLog(path.join(taskDir(id), `execution-log.${r}.jsonl`), r));
  return ev.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

// Approval checklist: every gate the flow config lists for a role (pending until approved), plus any other gate that has been
// decided. "changed" means the pinned file no longer matches what was approved.
function gatesOf(id, f) {
  const out = [];
  const cfg = f.gates || {};
  for (const r of f.order) {
    const st = readYaml(path.join(taskDir(id), `task.${r}.yaml`), null);
    const approvals = (st && st.approvals) || {};
    const defs = [...(cfg[r] || [])];
    for (const g of Object.keys(approvals)) if (!defs.some((d) => d.gate === g) && approvals[g].status !== "pending") defs.push({ gate: g, label: g });
    for (const d of defs) {
      const a = approvals[d.gate] || {};
      let changed = false;
      if (a.status === "approved" && a.artifact_hash && d.artifact) {
        try { changed = "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(path.join(taskDir(id), d.artifact))).digest("hex") !== a.artifact_hash; } catch { changed = false; }
      }
      let status = a.status || "pending";
      if (status === "pending" && d.optional && st && (d.skipped_from || []).includes(st.task.status)) status = "skipped"; // e.g. no plan for a ticket that is not a major feature
      out.push({ role: r, gate: d.gate, label: d.label || d.gate, status, approved_by: a.approved_by || null, approved_at: a.approved_at || null, version: a.version || null, changed });
    }
  }
  return out;
}

// Hash-chain check of each role's execution log and seal check of its state file (lib/auditlog.js).
function integrityOf(id, f) {
  const out = [];
  for (const r of f.order) {
    const logFile = path.join(taskDir(id), `execution-log.${r}.jsonl`);
    const stateFile = path.join(taskDir(id), `task.${r}.yaml`);
    const hasLog = fs.existsSync(logFile), hasState = fs.existsSync(stateFile);
    if (!hasLog && !hasState) continue;
    const log = hasLog ? auditlog.verify(logFile, id) : { ok: true, entries: 0, legacy: 0, unsigned: 0, macChecked: false, brokenAt: null, reason: null };
    const state = hasState ? auditlog.verifyStateFile(stateFile, logFile, id) : null;
    out.push({ role: r, ...log, has_log: hasLog, state });
  }
  return out;
}

function documents(id) {
  const out = [];
  const walk = (base, rel, prefix) => {
    let entries = [];
    try { entries = fs.readdirSync(path.join(base, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? rel + "/" + e.name : e.name;
      if (DOC_DENY.test(r) || NOT_DOCS.test(r) || e.isSymbolicLink() || e.name === ".gitkeep") continue;
      if (e.isDirectory()) walk(base, r, prefix);
      else if (e.isFile()) {
        const st = fs.statSync(path.join(base, r));
        const ext = path.extname(e.name).slice(1).toLowerCase();
        const isMd = ext === "md" || ext === "markdown";
        const isPage = prefix === "designs" && ext === "html";
        if (!isMd && !isPage) continue; // the document viewer shows markdown documents and the design pages only
        out.push({ path: prefix + "/" + id + "/" + r, size: st.size, modified: st.mtime.toISOString(), kind: "text", preview: isPage });
      }
    }
  };
  walk(taskDir(id), "", "tasks");
  walk(designDir(id), "", "designs");
  return out.sort((a, b) => b.modified.localeCompare(a.modified) || a.path.localeCompare(b.path));
}

// Safe lookup of a document under tasks/<id>/ or designs/<id>/ (no traversal, no symlinks out, no secrets).
function docFile(id, rel) {
  if (!TICKET_RE.test(id) || !rel || rel.includes("\0") || path.isAbsolute(rel)) return null;
  const norm = rel.replace(/\\/g, "/");
  const m = norm.match(/^(tasks|designs)\/([^/]+)\/(.+)$/);
  if (!m || m[2] !== id || m[3].split("/").some((p) => p === ".." || p === "") || DOC_DENY.test(m[3]) || NOT_DOCS.test(m[3]) || !(/\.(md|markdown)$/i.test(m[3]) || (m[1] === "designs" && /\.html$/i.test(m[3])))) return null;
  try {
    const base = fs.realpathSync(path.join(ROOT, m[1], id));
    const file = fs.realpathSync(path.join(base, m[3]));
    return file.startsWith(base + path.sep) && fs.statSync(file).isFile() ? file : null;
  } catch { return null; }
}

function nextStep(d, me) {
  const changes = d.roles.find((r) => r.status === "changes requested");
  const active = d.roles.filter((r) => r.status === "active");
  const pick = changes || active.find((r) => r.role === me) || active[0];
  if (!pick) return { role: null, text: d.roles.every((r) => ["done", "not needed", "waiting"].includes(r.status)) && d.roles.some((r) => r.status === "done") ? "Handed off; nothing active" : "Not started" };
  const text = pick.status === "changes requested" ? `${pick.label}: ${pick.open.length} change request(s) to resolve` : `${pick.label} is working${pick.state ? " (" + pick.state + ")" : pick.step !== null ? " (" + pick.steps[pick.step] + ")" : ""}`;
  return { role: pick.role, text, you: pick.role === me };
}

function updatedAt(id, d) {
  let t = "";
  for (const r of d.roles) { const f = path.join(taskDir(id), `task.${r.role}.yaml`); try { const m = fs.statSync(f).mtime.toISOString(); if (m > t) t = m; } catch { /* none */ } }
  for (const e of d.history) if (e.at > t) t = e.at;
  try { for (const x of fs.readdirSync(designDir(id))) { const m = fs.statSync(path.join(designDir(id), x)).mtime.toISOString(); if (m > t) t = m; } } catch { /* none */ }
  return t || null;
}

function summaryOf(id, f) {
  const d = flow.derive(ROOT, id, f);
  const me = myRole();
  const n = nextStep(d, me);
  const failure = d.roles.some((r) => r.problem);
  const gates = gatesOf(id, f);
  const logs = integrityOf(id, f);
  return { id, title: title(id), approvals: { done: gates.filter((g) => g.status === "approved").length, total: gates.filter((g) => g.status !== "skipped").length }, log_ok: logs.every((l) => l.ok && (!l.state || l.state.ok)), unsealed: logs.filter((l) => l.state && l.state.ok && !l.state.sealed).map((l) => l.role), roles: d.roles.map((r) => ({ role: r.role, label: r.label, status: r.status, state: r.state, problem: r.problem, open: r.open.length, step: r.step, steps: r.steps })), next: n, failure, updated_at: updatedAt(id, d),
    changes_open: d.roles.reduce((a, r) => a + r.open.length, 0), finished: d.roles.some((r) => r.status === "done") && !d.roles.some((r) => ["active", "changes requested"].includes(r.status)) && d.roles.filter((r) => r.role === "qa" || r.role === "dev").every((r) => ["done", "not needed", "waiting"].includes(r.status)) };
}

function status() {
  const f = flow.loadFlow(ROOT);
  const tasks = flow.tickets(ROOT).map((id) => summaryOf(id, f));
  const me = myRole();
  const issues = [];
  for (const t of tasks) for (const r of t.roles) if (r.problem) issues.push({ ref: t.id, text: `${r.label} is ${r.problem}` });
  for (const t of tasks) if (!t.log_ok) issues.push({ ref: t.id, text: "an execution log or a task state file failed its hash check (edited outside the plugin); see History" });
  return {
    generated_at: new Date().toISOString(),
    workspace: { name: workspaceName(), role: me },
    order: f.order,
    tasks,
    waiting_on_you: tasks.filter((t) => t.roles.some((r) => r.role === me && ["active", "changes requested"].includes(r.status))).length,
    issues,
    credentials: CREDENTIALS.map((name) => ({ name, set: Boolean(process.env[name]) })),
  };
}

function designPages(id) {
  try { return fs.readdirSync(designDir(id)).filter((n) => n.endsWith(".html") && n !== "viewer.html"); } catch { return []; }
}

function detail(id) {
  if (!TICKET_RE.test(id) || !(fs.existsSync(taskDir(id)) || fs.existsSync(designDir(id)))) return null;
  const f = flow.loadFlow(ROOT);
  const d = flow.derive(ROOT, id, f);
  const sum = summaryOf(id, f);
  return { summary: sum, roles: d.roles, history: d.history, audit: audit(id, f.order), gates: gatesOf(id, f), log_integrity: integrityOf(id, f), documents: documents(id), design_pages: designPages(id) };
}

if (args.includes("--json")) {
  const t = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--port" && args[i - 1] !== "--export");
  console.log(JSON.stringify(t ? detail(t) : status(), null, 2));
  process.exit(0);
}

// ---------- snapshot export ----------
function snapshot(withDocs) {
  const st = status();
  st.credentials = [];
  const out = { generated_at: st.generated_at, with_documents: withDocs, status: st, tasks: {}, docs: {} };
  for (const t of st.tasks) {
    const d = detail(t.id);
    if (!d) continue;
    out.tasks[t.id] = d;
    if (!withDocs) continue;
    out.docs[t.id] = {};
    for (const doc of d.documents) {
      if (doc.kind !== "text" || doc.size > MAX_DOC_BYTES) continue;
      const file = docFile(t.id, doc.path);
      if (file) out.docs[t.id][doc.path] = fs.readFileSync(file, "utf8");
    }
  }
  return out;
}

const SNAPSHOT_SHIM = `(function () {
  var S = JSON.parse(document.getElementById("aisdlc-snapshot").textContent);
  window.AISDLC_SNAPSHOT = { generated_at: S.generated_at, with_documents: S.with_documents };
  function reply(body, status, type) {
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status: status, headers: { "Content-Type": type || "application/json" } }));
  }
  window.fetch = function (url) {
    var u = new URL(String(url), "http://snapshot.local"), p = u.pathname;
    if (p === "/api/status") return reply(S.status, 200);
    var m = p.match(/^\\/api\\/tasks\\/([^/]+)(\\/doc)?$/);
    if (!m) return reply({ error: "not found" }, 404);
    var id = decodeURIComponent(m[1]);
    if (!Object.prototype.hasOwnProperty.call(S.tasks, id)) return reply({ error: "no such task" }, 404);
    if (!m[2]) return reply(S.tasks[id], 200);
    var docs = S.docs[id] || {}, rel = u.searchParams.get("path");
    if (Object.prototype.hasOwnProperty.call(docs, rel)) return reply(docs[rel], 200, "text/plain; charset=utf-8");
    return reply({ error: S.with_documents ? "this document is not included in the snapshot" : "documents are not included in this snapshot (export with --with-docs)" }, 404);
  };
})();`;

function exportHtml(withDocs) {
  const html = fs.readFileSync(PAGE, "utf8");
  const at = html.indexOf("<script>");
  if (at < 0) throw new Error("status-page.html has no <script>");
  const data = JSON.stringify(snapshot(withDocs)).replace(/</g, "\u003c").split(String.fromCharCode(0x2028)).join("\u2028").split(String.fromCharCode(0x2029)).join("\u2029");
  return html.slice(0, at) + `<script id="aisdlc-snapshot" type="application/json">${data}</script>\n<script id="aisdlc-snapshot-shim">${SNAPSHOT_SHIM}</script>\n` + html.slice(at);
}

if (opt("--export")) {
  const out = path.resolve(opt("--export"));
  fs.writeFileSync(out, exportHtml(args.includes("--with-docs")));
  console.log(`wrote ${out}${args.includes("--with-docs") ? " (with documents)" : " (without documents; add --with-docs to include them)"}`);
  process.exit(0);
}

// ---------- server ----------
const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const PAGE_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'";
// Design pages run in a sandbox without same-origin access, so they cannot reach the status page or its API. The Claude
// Design runtime fetches the page's own HTML, which from a sandboxed (opaque-origin) frame needs a CORS answer: it is given
// only to requests whose Origin is "null" and only for these static design files.
const DESIGN_CSP = "sandbox allow-scripts; default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'";

const server = http.createServer((req, res) => {
  const host = String(req.headers.host || "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return send(res, 403, { error: "forbidden host" });
  if (req.method !== "GET") return send(res, 405, { error: "read-only" }, "application/json; charset=utf-8", { Allow: "GET" });
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/" || p === "/index.html") return send(res, 200, fs.readFileSync(PAGE), "text/html; charset=utf-8", { "Content-Security-Policy": PAGE_CSP });
    if (p === "/api/ping") return send(res, 200, { app: "aisdlc-status", root: ROOT });
    if (p === "/api/status") return send(res, 200, status());
    const m = p.match(/^\/api\/tasks\/([^/]+)(\/doc)?$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const d = TICKET_RE.test(id) ? detail(id) : null;
      if (!d) return send(res, 404, { error: "no such ticket" });
      if (!m[2]) return send(res, 200, d);
      const file = docFile(id, url.searchParams.get("path"));
      if (!file) return send(res, 404, { error: "no such document" });
      const ext = path.extname(file).slice(1).toLowerCase();
      if (fs.statSync(file).size > MAX_DOC_BYTES && !IMAGE_TYPE[ext]) return send(res, 413, { error: "document too large to show; open it from the repository" });
      const sandbox = { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" };
      if (IMAGE_TYPE[ext]) return send(res, 200, fs.readFileSync(file), IMAGE_TYPE[ext], sandbox);
      if (TEXT_EXT.has(ext)) return send(res, 200, fs.readFileSync(file), "text/plain; charset=utf-8", sandbox);
      return send(res, 200, fs.readFileSync(file), "application/octet-stream", { ...sandbox, "Content-Disposition": `attachment; filename="${path.basename(file).replace(/"/g, "")}"` });
    }
    const dm = p.match(/^\/design\/([^/]+)\/(.+)$/);
    if (dm) {
      const id = decodeURIComponent(dm[1]);
      const rel = decodeURIComponent(dm[2]);
      const base = TICKET_RE.test(id) ? path.join(ROOT, "designs", id) : null;
      let file = null;
      if (base && fs.existsSync(base) && !rel.split("/").some((s) => s === ".." || s === "") && !/(^|\/)(\.env.*|.*\.(pem|key))$/i.test(rel)) {
        try { const b = fs.realpathSync(base), f = fs.realpathSync(path.join(base, rel)); if (f.startsWith(b + path.sep) && fs.statSync(f).isFile()) file = f; } catch { /* not found */ }
      }
      const ext = file ? path.extname(file).slice(1).toLowerCase() : "";
      if (!file || !DESIGN_TYPE[ext]) return send(res, 404, { error: "no such design file" });
      const cors = req.headers.origin === "null" ? { "Access-Control-Allow-Origin": "null", Vary: "Origin" } : { Vary: "Origin" };
      return send(res, 200, fs.readFileSync(file), DESIGN_TYPE[ext], { "Content-Security-Policy": DESIGN_CSP, ...cors });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
});

server.on("error", (e) => {
  if (e.code !== "EADDRINUSE") { console.error(`status page failed: ${e.message}`); process.exit(1); }
  http.get({ host: "127.0.0.1", port: PORT, path: "/api/ping", headers: { Host: "localhost" }, timeout: 2000 }, (r) => {
    let body = "";
    r.on("data", (c) => (body += c));
    r.on("end", () => {
      try { const j = JSON.parse(body); if (j.app === "aisdlc-status" && path.resolve(j.root) === path.resolve(ROOT)) { console.log(`Status page already running: http://localhost:${PORT}/`); process.exit(0); } } catch { /* fall through */ }
      console.error(`Port ${PORT} is in use by something else. Use --port <n>.`);
      process.exit(1);
    });
  }).on("error", () => { console.error(`Port ${PORT} is in use. Use --port <n>.`); process.exit(1); });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`aisdlc status page: http://localhost:${server.address().port}/  (workspace ${ROOT}; read-only; Ctrl+C to stop)`);
});
