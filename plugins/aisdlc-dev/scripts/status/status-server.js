#!/usr/bin/env node
// Live status page for an aisdlc dev workspace: a read-only local web server (no dependencies).
// Shows registered repositories and their knowledge freshness, every task with its place in its lifecycle
// (past states with times, the current state, the states still ahead), approvals, the suggested next step,
// the task's audit history, and every document in tasks/<ticket>/.
// Usage: node status-server.js [--port <n>] [--json]
//   --port  default 4317; 0 picks a free port. If an aisdlc status server for this workspace already runs on the
//           port, prints its URL and exits 0.
//   --json  print the /api/status payload once and exit (no server).
// Safety: binds 127.0.0.1 only, answers only Host localhost/127.0.0.1 (DNS-rebinding guard), never writes,
// never runs a state command; serves files only from inside tasks/<ticket>/ and never env/key files.
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");

const { resolveRoot, configPath, NOT_WORKSPACE } = require("../lib/root");
const { stripComments } = require("../lib/yaml");
const { resolveRepoPath } = require("../lib/repo-paths");

const ROOT = resolveRoot();
if (!ROOT) {
  console.error(NOT_WORKSPACE);
  process.exit(1);
}
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const PORT = Number(opt("--port", 4317));
const PAGE = path.join(__dirname, "status-page.html");
const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;
const CREDENTIALS = ["JIRA_EMAIL", "JIRA_API_TOKEN", "BITBUCKET_EMAIL", "BITBUCKET_API_TOKEN"];
const BLOCKING = ["BLOCKED", "CONFLICTED", "FAILED", "CI_FAILED", "JIRA_CHANGED", "WAITING_FOR_INPUT", "SPEC_REVIEW_REQUIRED"];
const APPROVAL_RE = /^AWAITING_.*APPROVAL$|^WAITING_FOR_APPROVAL$|^SPEC_REVIEW_REQUIRED$/;
// Gate artifacts of the built-in lifecycles (aisdlc-state.js); lifecycles with "gates" name their own.
const GATE_ARTIFACT = { specification: "specification.md", design: "design.md" };
const DOC_DENY = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)(\.pub)?|\.lock|.*\.tmp)$/i;
const TEXT_EXT = new Set(["md", "markdown", "txt", "yaml", "yml", "json", "jsonl", "log", "diff", "patch", "csv", "sql", "xml", "html", "ts", "tsx", "js", "jsx", "py", "java", "cs", "go", "sh", "ps1", "feature"]);
const IMAGE_TYPE = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
const MAX_DOC_BYTES = 2 * 1024 * 1024;

const readJsonYaml = (file) => {
  try {
    return JSON.parse(stripComments(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
};
const types = () => readJsonYaml(configPath(ROOT, "task-types.yaml")) || {};
const lifecycleName = (T, type) => (T[type] && T[type].states ? type : T.other_types_use);
const taskDir = (id) => path.join(ROOT, "tasks", id);

function loadTask(id) {
  const t = readJsonYaml(path.join(taskDir(id), "task.yaml"));
  return t && t.task ? t : null;
}

// Same rule as aisdlc-state.js nextHint: failure states first, then type-specific, then default.
function nextStep(T, task) {
  const { id, type, status } = task.task;
  const ns = T.next_steps || {};
  const failure = (T.failure_states || []).includes(status);
  const entry = failure ? (ns.failure || {})[status] : (ns[type] || {})[status] || (ns.default || {})[status];
  if (!entry) return null;
  return { who: entry[0], text: String(entry[1]).split("{T}").join(id) };
}

function title(id) {
  try {
    const md = fs.readFileSync(path.join(taskDir(id), "jira.md"), "utf8");
    const field = md.match(/^\s*(?:[-*]\s*)?\**(?:title|summary)\**\s*[:|]\s*\**\s*(.+?)\s*\**\s*\|?\s*$/im);
    if (field) return field[1].replace(/\*+/g, "").trim();
    const h = md.match(/^#\s+(.+)$/m);
    return h ? h[1].replace(new RegExp("^" + id + "\\s*[:-]?\\s*"), "").trim() || null : null;
  } catch {
    return null;
  }
}

function history(id) {
  let text = "";
  try {
    text = fs.readFileSync(path.join(taskDir(id), "execution-log.jsonl"), "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const keep = { timestamp: e.timestamp, event: e.event };
      for (const k of ["from", "to", "gate", "type", "reason", "approver", "repository", "branch", "commit", "pr", "result"])
        if (e[k] !== undefined && typeof e[k] !== "object") keep[k] = e[k];
      out.push(keep);
    } catch {}
  }
  return out;
}

// Every lifecycle state with what happened to it: done (entered and left), current, future, or skipped
// (behind the current state but never entered). Visits record each entry time, so loops show up.
function timeline(T, task, hist) {
  const lc = T[lifecycleName(T, task.task.type)] || { states: [] };
  const failure = (T.failure_states || []).includes(task.task.status);
  const at = failure ? task.task.resume_state || null : task.task.status;
  const visits = {};
  const enter = (state, ts) => (visits[state] = visits[state] || []).push(ts);
  const created = hist.find((e) => e.event === "task-created");
  enter("CREATED", (created && created.timestamp) || task.task.created_at || null);
  for (const e of hist) if (e.event === "state-transition" && e.to) enter(e.to, e.timestamp);
  const cur = lc.states.indexOf(at);
  return lc.states.map((s, i) => ({
    state: s,
    gate: /^AWAITING_.*APPROVAL$/.test(s),
    status: i === cur ? (failure ? "interrupted" : "current") : cur >= 0 && i < cur ? (visits[s] ? "done" : "skipped") : visits[s] ? "revisited" : "future",
    visits: visits[s] || [],
  }));
}

function approvals(id, task) {
  const T = types();
  const gates = (T[lifecycleName(T, task.task.type)] || {}).gates;
  return Object.entries(task.approvals || {}).map(([gate, a]) => {
    const file = gates ? gates[gate] && gates[gate].artifact : GATE_ARTIFACT[gate];
    let changed = null;
    if (file && a && a.status === "approved" && a.artifact_hash) {
      try {
        const h = "sha256:" + require("crypto").createHash("sha256").update(fs.readFileSync(path.join(taskDir(id), file))).digest("hex");
        changed = h !== a.artifact_hash;
      } catch {
        changed = true;
      }
    }
    return { gate, artifact: file || null, changed_since_approval: changed, ...a };
  });
}

function documents(id) {
  const base = taskDir(id);
  const out = [];
  const walk = (dir, rel) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? rel + "/" + e.name : e.name;
      if (DOC_DENY.test(r) || e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.isFile()) {
        const st = fs.statSync(path.join(dir, e.name));
        const ext = path.extname(e.name).slice(1).toLowerCase();
        out.push({ path: r, size: st.size, modified: st.mtime.toISOString(), kind: IMAGE_TYPE[ext] ? "image" : TEXT_EXT.has(ext) ? "text" : "binary" });
      }
    }
  };
  walk(base, "");
  return out.sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
}

let repoCache = { at: 0, data: null };
function git(dir, ...a) {
  try {
    return execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}
function repositories() {
  if (repoCache.data && Date.now() - repoCache.at < 15000) return repoCache.data;
  const reg = readJsonYaml(path.join(ROOT, "config", "repositories.yaml")) || {};
  let repos = reg.repositories || {};
  if (Array.isArray(repos)) repos = Object.fromEntries(repos.filter((r) => r && r.name).map((r) => [r.name, r]));
  const data = Object.entries(repos).map(([name, def]) => {
    def = def && typeof def === "object" ? def : {};
    const kdir = path.join(ROOT, "repositories", name);
    const meta = readJsonYaml(path.join(kdir, "metadata.json")) || {};
    const ry = readJsonYaml(path.join(kdir, "repository.yaml")) || {};
    const pick = (k) => [meta, ry, meta.repository, ry.repository, meta.provenance, ry.provenance].map((o) => o && o[k]).find((v) => v != null && typeof v !== "object");
    const analyzed = pick("analyzed_commit") || null;
    const loc = resolveRepoPath(name, def, ROOT);
    const exists = Boolean(loc && fs.existsSync(loc.path));
    const head = exists ? git(loc.path, "rev-parse", "HEAD") : null;
    const branch = exists ? git(loc.path, "rev-parse", "--abbrev-ref", "HEAD") : null;
    const hasPackage = fs.existsSync(kdir);
    const freshness = !hasPackage ? "no-knowledge-package" : !head || !analyzed ? "unknown" : head.startsWith(analyzed) || String(analyzed).startsWith(head) ? "current" : "needs-refresh";
    return {
      name,
      role: def.role || null,
      domains: def.domains || [],
      base_branch: def.base_branch || null,
      non_compliant: def.base_branch !== undefined && def.base_branch !== "main",
      path_found: exists,
      branch,
      head: head && head.slice(0, 12),
      analyzed_commit: analyzed && String(analyzed).slice(0, 12),
      analyzed_at: pick("analyzed_at") || null,
      confidence: pick("confidence") || null,
      freshness,
    };
  });
  repoCache = { at: Date.now(), data };
  return data;
}

function summary(T, id, task) {
  const lc = T[lifecycleName(T, task.task.type)] || { states: [] };
  const failure = (T.failure_states || []).includes(task.task.status);
  const at = failure ? task.task.resume_state : task.task.status;
  return {
    id,
    title: title(id),
    type: task.task.type,
    lifecycle: lifecycleName(T, task.task.type),
    status: task.task.status,
    failure,
    resume_state: task.task.resume_state || null,
    reason: task.task.reason || null,
    position: lc.states.indexOf(at) + 1,
    total: lc.states.length,
    repositories: task.repositories || [],
    created_at: task.task.created_at || null,
    updated_at: task.task.updated_at || null,
    next: nextStep(T, task),
  };
}

function status() {
  const T = types();
  const ws = (readJsonYaml(path.join(ROOT, "config", "workspace.yaml")) || {}).workspace || {};
  const tasks = [];
  let dirs = [];
  try {
    dirs = fs.readdirSync(path.join(ROOT, "tasks"), { withFileTypes: true });
  } catch {}
  for (const d of dirs) {
    if (!d.isDirectory() || !TICKET_RE.test(d.name)) continue;
    const task = loadTask(d.name);
    if (task) tasks.push(summary(T, d.name, task));
    else if (fs.existsSync(path.join(taskDir(d.name), "task.yaml"))) tasks.push({ id: d.name, status: "(unreadable)", unreadable: true });
  }
  tasks.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  const repos = repositories();
  const active = tasks.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status));
  const issues = [];
  for (const r of repos) {
    if (r.non_compliant) issues.push({ kind: "repository", ref: r.name, text: `base_branch is "${r.base_branch}"; managed repositories must use "main".` });
    if (r.freshness === "no-knowledge-package") issues.push({ kind: "repository", ref: r.name, text: "no knowledge package; run /aisdlc-dev:refresh-repo " + r.name + "." });
    else if (r.freshness === "needs-refresh") issues.push({ kind: "repository", ref: r.name, text: "knowledge describes an older commit; run /aisdlc-dev:refresh-repo " + r.name + "." });
    if (!r.path_found) issues.push({ kind: "repository", ref: r.name, text: "local clone not found (set its path in claude.env)." });
  }
  for (const t of active) if (BLOCKING.includes(t.status) || t.unreadable) issues.push({ kind: "task", ref: t.id, text: t.unreadable ? "task.yaml cannot be read." : `${t.status}${t.reason ? ": " + t.reason : ""}` });
  return {
    workspace: { name: ws.name || path.basename(ROOT), root: ROOT },
    generated_at: new Date().toISOString(),
    repositories: repos,
    tasks,
    pending_approvals: active.filter((t) => APPROVAL_RE.test(t.status)).map((t) => t.id),
    issues,
    credentials: CREDENTIALS.map((name) => ({ name, set: Boolean(process.env[name]) })),
  };
}

function taskDetail(id) {
  const task = loadTask(id);
  if (!task) return null;
  const T = types();
  const hist = history(id);
  return {
    summary: summary(T, id, task),
    task,
    lifecycle: { name: lifecycleName(T, task.task.type), failure_states: T.failure_states || [] },
    timeline: timeline(T, task, hist),
    approvals: approvals(id, task),
    history: hist,
    documents: documents(id),
  };
}

// Resolves a document path inside tasks/<id>/; null for anything outside it, denied, or a symlink escape.
function docFile(id, rel) {
  if (!rel || rel.includes("\0") || path.isAbsolute(rel)) return null;
  const norm = rel.replace(/\\/g, "/");
  if (norm.split("/").some((p) => p === ".." || p === "") || DOC_DENY.test(norm)) return null;
  const base = fs.realpathSync(taskDir(id));
  let file;
  try {
    file = fs.realpathSync(path.join(base, norm));
  } catch {
    return null;
  }
  return file.startsWith(base + path.sep) && fs.statSync(file).isFile() ? file : null;
}

if (args.includes("--json")) {
  console.log(JSON.stringify(status(), null, 2));
  process.exit(0);
}

const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const host = String(req.headers.host || "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1"].includes(host)) return send(res, 403, { error: "forbidden host" });
  if (req.method !== "GET") return send(res, 405, { error: "read-only" });
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/" || p === "/index.html")
      return send(res, 200, fs.readFileSync(PAGE), "text/html; charset=utf-8", { "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" });
    if (p === "/api/ping") return send(res, 200, { app: "aisdlc-status", root: ROOT });
    if (p === "/api/status") return send(res, 200, status());
    const m = p.match(/^\/api\/tasks\/([^/]+)(\/doc)?$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!TICKET_RE.test(id) || !fs.existsSync(taskDir(id))) return send(res, 404, { error: "no such task" });
      if (!m[2]) {
        const d = taskDetail(id);
        return d ? send(res, 200, d) : send(res, 404, { error: "no task record" });
      }
      const file = docFile(id, url.searchParams.get("path"));
      if (!file) return send(res, 404, { error: "no such document" });
      const ext = path.extname(file).slice(1).toLowerCase();
      if (fs.statSync(file).size > MAX_DOC_BYTES && !IMAGE_TYPE[ext]) return send(res, 413, { error: "document too large to show; open it from the workspace" });
      const sandbox = { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" };
      if (IMAGE_TYPE[ext]) return send(res, 200, fs.readFileSync(file), IMAGE_TYPE[ext], sandbox);
      if (TEXT_EXT.has(ext)) return send(res, 200, fs.readFileSync(file), "text/plain; charset=utf-8", sandbox);
      return send(res, 200, fs.readFileSync(file), "application/octet-stream", { ...sandbox, "Content-Disposition": `attachment; filename="${path.basename(file).replace(/"/g, "")}"` });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
});

server.on("error", (e) => {
  if (e.code !== "EADDRINUSE") {
    console.error(`status page failed: ${e.message}`);
    process.exit(1);
  }
  http
    .get({ host: "127.0.0.1", port: PORT, path: "/api/ping", headers: { Host: "localhost" }, timeout: 2000 }, (r) => {
      let body = "";
      r.on("data", (c) => (body += c));
      r.on("end", () => {
        try {
          const j = JSON.parse(body);
          if (j.app === "aisdlc-status" && path.resolve(j.root) === path.resolve(ROOT)) {
            console.log(`Status page already running: http://localhost:${PORT}/`);
            process.exit(0);
          }
        } catch {}
        console.error(`Port ${PORT} is in use by something else. Use --port <n>.`);
        process.exit(1);
      });
    })
    .on("error", () => {
      console.error(`Port ${PORT} is in use. Use --port <n>.`);
      process.exit(1);
    });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Status page: http://localhost:${server.address().port}/  (workspace ${ROOT}; read-only; Ctrl+C to stop)`);
});
