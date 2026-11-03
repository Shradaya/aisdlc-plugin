#!/usr/bin/env node
// Live status page for an aisdlc QA workspace: a read-only local web server (no dependencies). QA counterpart of
// aisdlc-dev's status page (plugins cannot share code, so this is its own copy, adapted to the qa lifecycle).
// Shows every QA ticket with its place in the lifecycle (past states with times, the current state, the states still
// ahead), approvals, defects, every test run with its results and step screenshots, the Playwright HTML report of
// each run, the audit history and every document in tasks/<ticket>/; plus environments and credentials (names only).
// Usage: node status-server.js [--port <n>] [--json]
//   --port  default 4318 (aisdlc-dev's page uses 4317); 0 picks a free port. If an aisdlc QA status server for this
//           workspace already runs on the port, prints its URL and exits 0.
//   --json  print the /api/status payload once and exit (no server).
// Safety: binds 127.0.0.1 only, answers only Host localhost/127.0.0.1 (DNS-rebinding guard), never writes, never runs
// a state, Playwright or Jira command; serves files only from inside tasks/<ticket>/ and never .env, .auth or key files.
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const { resolveRoot, configPath, workspaceKind, NOT_WORKSPACE } = require("../lib/root");
const { stripComments } = require("../lib/yaml");
const { credentialStatus, environmentsConfig } = require("../qa/env");

const ROOT = resolveRoot();
if (!ROOT) {
  console.error(NOT_WORKSPACE);
  process.exit(1);
}
if (workspaceKind(ROOT) !== "qa") {
  console.error(`${ROOT} is not an aisdlc QA workspace (config/workspace.yaml "kind" is not "qa"). Use /aisdlc-dev:status-page in a dev workspace.`);
  process.exit(1);
}
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const PORT = Number(opt("--port", 4318));
const PAGE = path.join(__dirname, "status-page.html");
const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;
const CREDENTIALS = ["QA_USERNAME", "QA_PASSWORD", "JIRA_EMAIL", "JIRA_API_TOKEN"];
const BLOCKING = ["BLOCKED", "CONFLICTED", "FAILED", "JIRA_CHANGED", "WAITING_FOR_INPUT", "SCENARIO_REVIEW_REQUIRED"];
// The QA engineer's two hash-pinned decisions, and the state each one waits in.
const GATE_WAIT = { AWAITING_SCENARIO_APPROVAL: "scenarios", AWAITING_RESULTS_SIGNOFF: "signoff" };
const DOC_DENY = /(^|\/)(\.env(\..*)?|\.auth|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)(\.pub)?|\.lock|.*\.tmp)(\/|$)/i;
// Evidence internals are shown as runs, screenshots and the report; the documents list leaves them out.
const EVIDENCE_INTERNALS = /^evidence\/run-\d+\/(report|artifacts|screenshots)\//;
const TEXT_EXT = new Set(["md", "markdown", "txt", "yaml", "yml", "json", "jsonl", "log", "diff", "patch", "csv", "xml", "ts", "tsx", "js", "jsx", "feature"]);
const MEDIA_TYPE = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", webm: "video/webm" };
const REPORT_TYPE = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", zip: "application/zip", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2", webmanifest: "application/manifest+json", webm: "video/webm", txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8" };
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
const toTaskRel = (id, p) => (p ? String(p).replace(/\\/g, "/").replace(new RegExp(`^tasks/${id}/`), "") : null);

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
      for (const k of ["from", "to", "gate", "type", "reason", "approver", "run", "defect", "scenario", "result"])
        if (e[k] !== undefined && typeof e[k] !== "object") keep[k] = e[k];
      out.push(keep);
    } catch {}
  }
  return out;
}

// Every lifecycle state with what happened to it: done (entered and left), current, interrupted (failure state),
// future, skipped (behind the current state but never entered) or revisited (ahead of the current state, but entered
// before a loop went back). Visits record each entry time, so loops (heal, re-run, re-verify) show up.
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
    gate: Boolean(GATE_WAIT[s]),
    status: i === cur ? (failure ? "interrupted" : "current") : cur >= 0 && i < cur ? (visits[s] ? "done" : "skipped") : visits[s] ? "revisited" : "future",
    visits: visits[s] || [],
  }));
}

function approvals(id, task) {
  const T = types();
  const gates = (T[lifecycleName(T, task.task.type)] || {}).gates || {};
  return Object.entries(task.approvals || {}).map(([gate, a]) => {
    const file = gates[gate] && gates[gate].artifact;
    let changed = null;
    if (file && a && a.status === "approved" && a.artifact_hash) {
      try {
        changed = "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(path.join(taskDir(id), file))).digest("hex") !== a.artifact_hash;
      } catch {
        changed = true;
      }
    }
    return { gate, artifact: file || null, changed_since_approval: changed, ...a };
  });
}

function defects(task) {
  const d = task.defects && typeof task.defects === "object" ? task.defects : {};
  return Object.entries(d)
    .map(([k, v]) => ({ id: (v && v.id) || k, ...(v && typeof v === "object" ? v : {}) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// One evidence folder: run.json + summary.json (written by run-tests.js), the task state's runs.<N> record, and the
// step screenshots on disk (screenshots/<TICKET>-S<n>/<nn>-<step>.png), grouped by scenario in step order.
function runs(id, task) {
  const ev = path.join(taskDir(id), "evidence");
  const nums = listFiles(ev).map((e) => e.isDirectory() && (e.name.match(/^run-(\d+)$/) || [])[1]).filter(Boolean).map(Number);
  const recorded = (task.runs && typeof task.runs === "object" && task.runs) || {};
  return nums.sort((a, b) => b - a).map((n) => {
    const dir = path.join(ev, `run-${n}`);
    const meta = readJsonYaml(path.join(dir, "run.json")) || {};
    const sum = readJsonYaml(path.join(dir, "summary.json")) || {};
    const rec = recorded[n] || recorded[String(n)] || {};
    const tests = (Array.isArray(sum.tests) ? sum.tests : []).map((t) => ({
      scenario: t.scenario || null,
      title: t.title || null,
      file: t.file || null,
      acs: Array.isArray(t.acs) ? t.acs : [],
      status: t.status || null,
      duration_ms: t.duration_ms || null,
      retries: t.retries || 0,
      failed_step: t.failed_step || null,
      error: t.error ? String(t.error).slice(0, 1500) : null,
      failed_screenshot: toTaskRel(id, t.failed_screenshot),
    }));
    const screenshots = [];
    for (const g of listFiles(path.join(dir, "screenshots"))) {
      if (!g.isDirectory()) continue;
      const files = listFiles(path.join(dir, "screenshots", g.name))
        .filter((f) => f.isFile() && /\.(png|jpe?g|webp)$/i.test(f.name))
        .map((f) => f.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const m = g.name.match(/-(S\d+)$/);
      screenshots.push({
        group: g.name,
        scenario: m ? m[1] : g.name,
        shots: files.map((f) => ({ path: `evidence/run-${n}/screenshots/${g.name}/${f}`, step: f.replace(/\.[^.]+$/, ""), failed: /-FAILED\.[^.]+$/.test(f) })),
      });
    }
    screenshots.sort((a, b) => a.scenario.localeCompare(b.scenario, undefined, { numeric: true }));
    const videos = [];
    const walk = (d, rel, depth) => {
      if (depth > 3) return;
      for (const e of listFiles(d)) {
        if (e.isDirectory()) walk(path.join(d, e.name), rel + e.name + "/", depth + 1);
        else if (/\.webm$/i.test(e.name)) videos.push(`evidence/run-${n}/artifacts/${rel}${e.name}`);
      }
    };
    walk(path.join(dir, "artifacts"), "", 0);
    return {
      run: n,
      mode: meta.mode || rec.mode || null,
      environment: meta.environment || rec.environment || null,
      base_url: meta.base_url || null,
      build: meta.build || rec.build || null,
      only: meta.only || rec.only || null,
      video: Boolean(meta.video),
      started_at: meta.started_at || rec.started_at || null,
      finished_at: rec.finished_at || null,
      playwright_exit: rec.playwright_exit ?? null,
      totals: sum.totals || (rec.tests !== undefined ? { tests: rec.tests, passed: rec.passed, failed: rec.failed, flaky: rec.flaky, skipped: rec.skipped } : null),
      setup_error: sum.setup_error || rec.error || null,
      uncovered_scenarios: sum.uncovered_scenarios || [],
      report: fs.existsSync(path.join(dir, "report", "index.html")),
      tests,
      screenshots,
      videos,
    };
  });
}

function documents(id) {
  const base = taskDir(id);
  const out = [];
  const walk = (dir, rel) => {
    for (const e of listFiles(dir)) {
      const r = rel ? rel + "/" + e.name : e.name;
      if (DOC_DENY.test(r) || e.isSymbolicLink() || EVIDENCE_INTERNALS.test(r + (e.isDirectory() ? "/" : ""))) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.isFile()) {
        const st = fs.statSync(path.join(dir, e.name));
        const ext = path.extname(e.name).slice(1).toLowerCase();
        out.push({ path: r, size: st.size, modified: st.mtime.toISOString(), kind: MEDIA_TYPE[ext] ? (ext === "webm" ? "video" : "image") : TEXT_EXT.has(ext) ? "text" : "binary" });
      }
    }
  };
  walk(base, "");
  // Most recently updated first; same time falls back to path order.
  return out.sort((a, b) => b.modified.localeCompare(a.modified) || a.path.localeCompare(b.path));
}

function summary(T, id, task) {
  const lc = T[lifecycleName(T, task.task.type)] || { states: [] };
  const failure = (T.failure_states || []).includes(task.task.status);
  const at = failure ? task.task.resume_state : task.task.status;
  const ds = defects(task);
  const nums = Object.keys((task.runs && typeof task.runs === "object" && task.runs) || {}).map(Number).filter((n) => n > 0);
  const lastN = nums.length ? Math.max(...nums) : null;
  const last = lastN ? task.runs[lastN] || task.runs[String(lastN)] : null;
  const open = Object.entries(task.approvals || {}).filter(([, a]) => a && a.status !== "approved").map(([g]) => g);
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
    environment: task.environment || null,
    last_run: last ? { run: lastN, build: last.build || null, finished_at: last.finished_at || null, tests: last.tests, passed: last.passed, failed: last.failed, flaky: last.flaky, skipped: last.skipped, error: last.error || null } : null,
    runs: nums.length,
    defects: { open: ds.filter((d) => d.status === "open").length, fixed: ds.filter((d) => d.status === "fixed").length, waived: ds.filter((d) => d.status === "waived").length },
    awaiting_approval: GATE_WAIT[task.task.status] || (task.task.status === "WAITING_FOR_APPROVAL" ? open[0] || null : null),
    waiting_on_developer: task.task.status === "AWAITING_DEV_FIX",
    created_at: task.task.created_at || null,
    updated_at: task.task.updated_at || null,
    next: nextStep(T, task),
  };
}

function environments() {
  const cfg = environmentsConfig(ROOT) || {};
  return {
    default: cfg.default || null,
    blocked_hosts: Array.isArray(cfg.blocked_hosts) ? cfg.blocked_hosts : [],
    list: Object.entries(cfg.environments || {}).map(([name, e]) => ({
      name,
      base_url: (e && e.base_url) || null,
      allow_automation: Boolean(e && e.allow_automation === true),
      data: (e && e.data) || null,
      login: (e && e.login && e.login.mode) || null,
      session_saved: fs.existsSync(path.join(ROOT, ".auth", `${name}.json`)),
    })),
  };
}

function status() {
  const T = types();
  const ws = (readJsonYaml(path.join(ROOT, "config", "workspace.yaml")) || {}).workspace || {};
  const tasks = [];
  for (const d of listFiles(path.join(ROOT, "tasks"))) {
    if (!d.isDirectory() || !TICKET_RE.test(d.name)) continue;
    const task = loadTask(d.name);
    if (task) tasks.push(summary(T, d.name, task));
    else if (fs.existsSync(path.join(taskDir(d.name), "task.yaml"))) tasks.push({ id: d.name, status: "(unreadable)", unreadable: true });
  }
  tasks.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  const active = tasks.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status));
  const envs = environments();
  const issues = [];
  for (const t of active) {
    if (BLOCKING.includes(t.status) || t.unreadable) issues.push({ kind: "task", ref: t.id, text: t.unreadable ? "task.yaml cannot be read." : `${t.status}${t.reason ? ": " + t.reason : ""}` });
    if (t.last_run && t.last_run.error) issues.push({ kind: "task", ref: t.id, text: `last run (run ${t.last_run.run}) did not complete: ${t.last_run.error}` });
  }
  for (const e of envs.list) if (e.allow_automation && !e.base_url) issues.push({ kind: "environment", ref: e.name, text: "automation allowed but base_url is empty (/aisdlc-qa:add-env)." });
  return {
    workspace: { name: ws.name || path.basename(ROOT), root: ROOT, kind: "qa" },
    generated_at: new Date().toISOString(),
    tasks,
    pending_approvals: active.filter((t) => t.awaiting_approval).map((t) => t.id),
    waiting_on_developer: active.filter((t) => t.waiting_on_developer).map((t) => t.id),
    open_defects: active.reduce((n, t) => n + ((t.defects && t.defects.open) || 0), 0),
    issues,
    environments: envs,
    credentials: CREDENTIALS.map((name) => ({ name, set: credentialStatus(ROOT, name) || null })),
  };
}

function taskDetail(id) {
  const task = loadTask(id);
  if (!task) return null;
  const T = types();
  const hist = history(id);
  return {
    summary: summary(T, id, task),
    task: { task: task.task, environment: task.environment || null, source: task.source || null },
    lifecycle: { name: lifecycleName(T, task.task.type), failure_states: T.failure_states || [] },
    timeline: timeline(T, task, hist),
    approvals: approvals(id, task),
    defects: defects(task),
    runs: runs(id, task),
    history: hist,
    documents: documents(id),
  };
}

// Resolves a path inside `base`; null for anything outside it, denied, or a symlink escape.
function safeFile(base, rel, deny = true) {
  if (!rel || rel.includes("\0") || path.isAbsolute(rel)) return null;
  const norm = rel.replace(/\\/g, "/");
  if (norm.split("/").some((p) => p === ".." || p === "") || (deny && DOC_DENY.test(norm))) return null;
  let b, file;
  try {
    b = fs.realpathSync(base);
    file = fs.realpathSync(path.join(b, norm));
  } catch {
    return null;
  }
  return file.startsWith(b + path.sep) && fs.statSync(file).isFile() ? file : null;
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
      return send(res, 200, fs.readFileSync(PAGE), "text/html; charset=utf-8", { "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" });
    if (p === "/api/ping") return send(res, 200, { app: "aisdlc-qa-status", root: ROOT });
    if (p === "/api/status") return send(res, 200, status());
    // A run's Playwright HTML report, served from its own folder so its relative links (data/, trace/) work.
    const rep = p.match(/^\/report\/([^/]+)\/(\d+)\/(.*)$/);
    if (rep) {
      const id = decodeURIComponent(rep[1]);
      if (!TICKET_RE.test(id)) return send(res, 404, { error: "no such task" });
      const file = safeFile(path.join(taskDir(id), "evidence", `run-${rep[2]}`, "report"), decodeURIComponent(rep[3]) || "index.html", false);
      if (!file) return send(res, 404, { error: "no such report file" });
      const ext = path.extname(file).slice(1).toLowerCase();
      return send(res, 200, fs.readFileSync(file), REPORT_TYPE[ext] || "application/octet-stream", { "Content-Security-Policy": "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'self'" });
    }
    const m = p.match(/^\/api\/tasks\/([^/]+)(\/doc)?$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!TICKET_RE.test(id) || !fs.existsSync(taskDir(id))) return send(res, 404, { error: "no such task" });
      if (!m[2]) {
        const d = taskDetail(id);
        return d ? send(res, 200, d) : send(res, 404, { error: "no task record" });
      }
      const file = safeFile(taskDir(id), url.searchParams.get("path"));
      if (!file) return send(res, 404, { error: "no such document" });
      const ext = path.extname(file).slice(1).toLowerCase();
      if (fs.statSync(file).size > MAX_DOC_BYTES && !MEDIA_TYPE[ext]) return send(res, 413, { error: "document too large to show; open it from the workspace" });
      const sandbox = { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'" };
      if (MEDIA_TYPE[ext]) return send(res, 200, fs.readFileSync(file), MEDIA_TYPE[ext], { ...sandbox, "Cache-Control": "private, max-age=60" });
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
          if (j.app === "aisdlc-qa-status" && path.resolve(j.root) === path.resolve(ROOT)) {
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
  console.log(`Status page: http://localhost:${server.address().port}/  (QA workspace ${ROOT}; read-only; Ctrl+C to stop)`);
});
