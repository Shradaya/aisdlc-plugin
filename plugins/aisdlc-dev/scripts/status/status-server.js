#!/usr/bin/env node
// Live status page for an aisdlc dev workspace: a read-only local web server (no dependencies).
// Shows registered repositories and their knowledge freshness, every task with its place in its lifecycle
// (past states with times, the current state, the states still ahead), approvals, the suggested next step,
// the task's audit history, and every document in tasks/<ticket>/.
// Usage: node status-server.js [--port <n>] [--json]
//   --port  default 4317; 0 picks a free port. If an aisdlc status server for this workspace already runs on the
//           port, prints its URL and exits 0.
//   --json  print the /api/status payload once and exit (no server).
//   --export <file.html> [--with-docs] [--force]
//           write a self-contained snapshot of the same page (one file, no server, opens from disk or an email):
//           the overview and every task's detail as of now. The local workspace path and which credential variables
//           are set are left out. Task documents (Jira text, specifications, ...) are left out too unless --with-docs,
//           which embeds the text ones (not images or binaries). Refuses to overwrite a file without --force.
//   --markdown <TICKET> [--out <file.md>]
//           print one task's status as Markdown (state, next step, approvals with who and when, repositories,
//           commits, pull requests, CI, release, recent history), for a comment or a hand-off, and exit.
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
const { state: STATE_FILE, log: LOG_FILE } =
  require("../lib/root").taskNames(ROOT); // task.yaml, or task.<role>.yaml in a shared aisdlc workspace
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
const CREDENTIALS = [
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "BITBUCKET_EMAIL",
  "BITBUCKET_API_TOKEN",
];
const BLOCKING = [
  "BLOCKED",
  "CONFLICTED",
  "FAILED",
  "CI_FAILED",
  "JIRA_CHANGED",
  "WAITING_FOR_INPUT",
  "SPEC_REVIEW_REQUIRED",
];
const APPROVAL_RE =
  /^AWAITING_.*APPROVAL$|^WAITING_FOR_APPROVAL$|^SPEC_REVIEW_REQUIRED$/;
// Approval gates are folded into the state they unlock (SPEC_APPROVED, PLAN_APPROVED, ...); older lifecycles had
// separate AWAITING_*_APPROVAL states. Both count as gate states.
const GATE_STATE_RE = /^AWAITING_.*APPROVAL$|_APPROVED$/;
const GATE_STATE = {
  specification: "SPEC_APPROVED",
  plan: "PLAN_APPROVED",
  design: "DESIGN_APPROVED",
};
// Gate artifacts of the built-in lifecycles (aisdlc-state.js); lifecycles with "gates" name their own.
const GATE_ARTIFACT = {
  specification: "specification.md",
  design: "design.md",
};
const DOC_DENY =
  /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)(\.pub)?|\.lock|.*\.tmp)$/i;
const TEXT_EXT = new Set([
  "md",
  "markdown",
  "txt",
  "yaml",
  "yml",
  "json",
  "jsonl",
  "log",
  "diff",
  "patch",
  "csv",
  "sql",
  "xml",
  "html",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "java",
  "cs",
  "go",
  "sh",
  "ps1",
  "feature",
]);
const IMAGE_TYPE = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
const MAX_DOC_BYTES = 2 * 1024 * 1024;

const readJsonYaml = (file) => {
  try {
    return JSON.parse(stripComments(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
};
const types = () => readJsonYaml(configPath(ROOT, "task-types.yaml")) || {};
const lifecycleName = (T, type) =>
  T[type] && T[type].states ? type : T.other_types_use;
const taskDir = (id) => path.join(ROOT, "tasks", id);

function loadTask(id) {
  const t = readJsonYaml(path.join(taskDir(id), STATE_FILE));
  return t && t.task ? t : null;
}

// Same rule as aisdlc-state.js nextHint: failure states first, then type-specific, then default.
function nextStep(T, task) {
  const { id, type, status } = task.task;
  const ns = T.next_steps || {};
  const failure = (T.failure_states || []).includes(status);
  const entry = failure
    ? (ns.failure || {})[status]
    : (ns[type] || {})[status] || (ns.default || {})[status];
  if (!entry) return null;
  return { who: entry[0], text: String(entry[1]).split("{T}").join(id) };
}

function title(id) {
  try {
    const md = fs.readFileSync(path.join(taskDir(id), "jira.md"), "utf8");
    const field = md.match(
      /^\s*(?:[-*]\s*)?\**(?:title|summary)\**\s*[:|]\s*\**\s*(.+?)\s*\**\s*\|?\s*$/im,
    );
    if (field) return field[1].replace(/\*+/g, "").trim();
    const h = md.match(/^#\s+(.+)$/m);
    return h
      ? h[1].replace(new RegExp("^" + id + "\\s*[:-]?\\s*"), "").trim() || null
      : null;
  } catch {
    return null;
  }
}

function history(id) {
  let text = "";
  try {
    text = fs.readFileSync(path.join(taskDir(id), LOG_FILE), "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const keep = { timestamp: e.timestamp, event: e.event };
      for (const k of [
        "from",
        "to",
        "gate",
        "type",
        "reason",
        "approver",
        "repository",
        "branch",
        "commit",
        "pr",
        "result",
      ])
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
  enter(
    "CREATED",
    (created && created.timestamp) || task.task.created_at || null,
  );
  for (const e of hist)
    if (e.event === "state-transition" && e.to) enter(e.to, e.timestamp);
  const cur = lc.states.indexOf(at);
  return lc.states.map((s, i) => ({
    state: s,
    gate: GATE_STATE_RE.test(s),
    status:
      i === cur
        ? failure
          ? "interrupted"
          : "current"
        : cur >= 0 && i < cur
          ? visits[s]
            ? "done"
            : "skipped"
          : visits[s]
            ? "revisited"
            : "future",
    visits: visits[s] || [],
  }));
}

function approvals(id, task) {
  const T = types();
  const gates = (T[lifecycleName(T, task.task.type)] || {}).gates;
  return Object.entries(task.approvals || {}).map(([gate, a]) => {
    const file = gates
      ? gates[gate] && gates[gate].artifact
      : GATE_ARTIFACT[gate];
    let changed = null;
    if (file && a && a.status === "approved" && a.artifact_hash) {
      try {
        const h =
          "sha256:" +
          require("crypto")
            .createHash("sha256")
            .update(fs.readFileSync(path.join(taskDir(id), file)))
            .digest("hex");
        changed = h !== a.artifact_hash;
      } catch {
        changed = true;
      }
    }
    return {
      gate,
      artifact: file || null,
      changed_since_approval: changed,
      ...a,
    };
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
        out.push({
          path: r,
          size: st.size,
          modified: st.mtime.toISOString(),
          kind: IMAGE_TYPE[ext]
            ? "image"
            : TEXT_EXT.has(ext)
              ? "text"
              : "binary",
        });
      }
    }
  };
  walk(base, "");
  // Most recently updated first; same time falls back to path order.
  return out.sort(
    (a, b) =>
      b.modified.localeCompare(a.modified) || a.path.localeCompare(b.path),
  );
}

let repoCache = { at: 0, data: null };
function git(dir, ...a) {
  try {
    return execFileSync("git", ["-C", dir, ...a], {
      encoding: "utf8",
      timeout: 4000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
function repositories() {
  if (repoCache.data && Date.now() - repoCache.at < 15000)
    return repoCache.data;
  const reg =
    readJsonYaml(path.join(ROOT, "config", "repositories.yaml")) || {};
  let repos = reg.repositories || {};
  if (Array.isArray(repos))
    repos = Object.fromEntries(
      repos.filter((r) => r && r.name).map((r) => [r.name, r]),
    );
  const data = Object.entries(repos).map(([name, def]) => {
    def = def && typeof def === "object" ? def : {};
    const kdir = path.join(ROOT, "repositories", name);
    const meta = readJsonYaml(path.join(kdir, "metadata.json")) || {};
    const ry = readJsonYaml(path.join(kdir, "repository.yaml")) || {};
    const pick = (k) =>
      [meta, ry, meta.repository, ry.repository, meta.provenance, ry.provenance]
        .map((o) => o && o[k])
        .find((v) => v != null && typeof v !== "object");
    const analyzed = pick("analyzed_commit") || null;
    const loc = resolveRepoPath(name, def, ROOT);
    const exists = Boolean(loc && fs.existsSync(loc.path));
    const head = exists ? git(loc.path, "rev-parse", "HEAD") : null;
    const branch = exists
      ? git(loc.path, "rev-parse", "--abbrev-ref", "HEAD")
      : null;
    const hasPackage = fs.existsSync(kdir);
    const freshness = !hasPackage
      ? "no-knowledge-package"
      : !head || !analyzed
        ? "unknown"
        : head.startsWith(analyzed) || String(analyzed).startsWith(head)
          ? "current"
          : "needs-refresh";
    return {
      name,
      role: def.role || null,
      domains: def.domains || [],
      base_branch: def.base_branch || null,
      non_compliant:
        def.base_branch !== undefined && def.base_branch !== "main",
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
    awaiting_approval: awaitingApproval(lc, task, at),
  };
}

// The gate a task is waiting on (same rule as /aisdlc-dev:status): a pending or rejected gate whose state comes
// next (e.g. specification while at REPOSITORIES_PREPARED, plan while at SPEC_APPROVED), or any gate in
// WAITING_FOR_APPROVAL / an AWAITING_*_APPROVAL state.
function awaitingApproval(lc, task, at) {
  const open = Object.entries(task.approvals || {})
    .filter(([, a]) => a && (a.status === "pending" || a.status === "rejected"))
    .map(([g]) => g);
  if (!open.length) return null;
  if (
    task.task.status === "WAITING_FOR_APPROVAL" ||
    /^AWAITING_.*APPROVAL$/.test(task.task.status || "")
  )
    return open[0];
  if (at !== task.task.status) return null; // blocked/failed: the failure is what it waits on, not the gate
  const i = lc.states.indexOf(at);
  return (
    open.find(
      (g) => GATE_STATE[g] && lc.states.indexOf(GATE_STATE[g]) === i + 1,
    ) || null
  );
}

function status() {
  const T = types();
  const ws =
    (readJsonYaml(path.join(ROOT, "config", "workspace.yaml")) || {})
      .workspace || {};
  const tasks = [];
  let dirs = [];
  try {
    dirs = fs.readdirSync(path.join(ROOT, "tasks"), { withFileTypes: true });
  } catch {}
  for (const d of dirs) {
    if (!d.isDirectory() || !TICKET_RE.test(d.name)) continue;
    const task = loadTask(d.name);
    if (task) tasks.push(summary(T, d.name, task));
    else if (fs.existsSync(path.join(taskDir(d.name), STATE_FILE)))
      tasks.push({ id: d.name, status: "(unreadable)", unreadable: true });
  }
  tasks.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  const repos = repositories();
  const active = tasks.filter(
    (t) => !["COMPLETED", "CANCELLED"].includes(t.status),
  );
  const issues = [];
  for (const r of repos) {
    if (r.non_compliant)
      issues.push({
        kind: "repository",
        ref: r.name,
        text: `base_branch is "${r.base_branch}"; managed repositories must use "main".`,
      });
    if (r.freshness === "no-knowledge-package")
      issues.push({
        kind: "repository",
        ref: r.name,
        text:
          "no knowledge package; run /aisdlc-dev:refresh-repo " + r.name + ".",
      });
    else if (r.freshness === "needs-refresh")
      issues.push({
        kind: "repository",
        ref: r.name,
        text:
          "knowledge describes an older commit; run /aisdlc-dev:refresh-repo " +
          r.name +
          ".",
      });
    if (!r.path_found)
      issues.push({
        kind: "repository",
        ref: r.name,
        text: "local clone not found (set its path in claude.env).",
      });
  }
  for (const t of active)
    if (BLOCKING.includes(t.status) || t.unreadable)
      issues.push({
        kind: "task",
        ref: t.id,
        text: t.unreadable
          ? "task.yaml cannot be read."
          : `${t.status}${t.reason ? ": " + t.reason : ""}`,
      });
  return {
    workspace: { name: ws.name || path.basename(ROOT), root: ROOT },
    generated_at: new Date().toISOString(),
    repositories: repos,
    tasks,
    pending_approvals: active
      .filter((t) => t.awaiting_approval || APPROVAL_RE.test(t.status))
      .map((t) => t.id),
    issues,
    credentials: CREDENTIALS.map((name) => ({
      name,
      set: Boolean(process.env[name]),
    })),
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
    lifecycle: {
      name: lifecycleName(T, task.task.type),
      failure_states: T.failure_states || [],
    },
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
  if (
    norm.split("/").some((p) => p === ".." || p === "") ||
    DOC_DENY.test(norm)
  )
    return null;
  const base = fs.realpathSync(taskDir(id));
  let file;
  try {
    file = fs.realpathSync(path.join(base, norm));
  } catch {
    return null;
  }
  return file.startsWith(base + path.sep) && fs.statSync(file).isFile()
    ? file
    : null;
}

if (args.includes("--json")) {
  console.log(JSON.stringify(status(), null, 2));
  process.exit(0);
}

// ---------- snapshot export and Markdown status (no server) ----------
const MAX_HISTORY = 12;
const mdCell = (v) =>
  String(v == null || v === "" ? "-" : v)
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
const shortWhen = (iso) =>
  iso
    ? String(iso)
        .replace("T", " ")
        .replace(/\.\d+Z$/, "Z")
    : "-";

// What the page needs, as the server would answer it, without anything specific to this machine.
function snapshot(withDocs) {
  const st = status();
  st.workspace = { name: st.workspace.name };
  st.credentials = [];
  const out = {
    generated_at: st.generated_at,
    with_documents: withDocs,
    status: st,
    tasks: {},
    docs: {},
  };
  for (const t of st.tasks) {
    if (t.unreadable) continue;
    const d = taskDetail(t.id);
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

// Answers the page's /api/... requests from the embedded snapshot, in place of the server.
const SNAPSHOT_SHIM = `(function () {
  var S = JSON.parse(document.getElementById("aisdlc-snapshot").textContent);
  window.AISDLC_SNAPSHOT = { generated_at: S.generated_at, with_documents: S.with_documents };
  function reply(body, status, type) {
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status: status, headers: { "Content-Type": type || "application/json" } }));
  }
  window.fetch = function (url) {
    var u = new URL(String(url), "http://snapshot.local"), p = u.pathname;
    if (p === "/api/status") return reply(S.status, 200);
    if (p === "/api/ping") return reply({ app: "aisdlc-status-snapshot" }, 200);
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
  // The data sits in a JSON script block: "<" and the JS line separators are escaped so that no document text can
  // close the block or break out of it.
  const data = JSON.stringify(snapshot(withDocs))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return (
    html.slice(0, at) +
    `<script id="aisdlc-snapshot" type="application/json">${data}</script>\n<script id="aisdlc-snapshot-shim">${SNAPSHOT_SHIM}</script>\n` +
    html.slice(at)
  );
}

function markdownStatus(id) {
  const d = taskDetail(id);
  if (!d) return null;
  const s = d.summary,
    t = d.task;
  const L = [];
  L.push(`# ${id}${s.title ? ": " + s.title : ""}`, "");
  L.push("| | |", "|---|---|");
  L.push(`| Type | ${mdCell(s.type)} (${mdCell(s.lifecycle)} lifecycle) |`);
  L.push(
    `| State | \`${s.status}\`${s.failure ? ` (interrupted at \`${mdCell(s.resume_state)}\`)` : ""}, step ${s.position} of ${s.total} |`,
  );
  if (s.reason) L.push(`| Reason | ${mdCell(s.reason)} |`);
  L.push(`| Updated | ${shortWhen(s.updated_at)} |`);
  if (s.repositories.length)
    L.push(
      `| Repositories | ${s.repositories.map((r) => "`" + r + "`").join(", ")} |`,
    );
  L.push("");
  if (s.next)
    L.push(
      `**Next (${s.next.who === "claude" ? "Claude" : s.next.who === "you" ? "developer" : s.next.who}):** ${s.next.text}`,
      "",
    );
  if (s.awaiting_approval)
    L.push(`**Waiting for the ${s.awaiting_approval} approval.**`, "");
  if (d.approvals.length) {
    L.push(
      "## Approvals",
      "",
      "| Gate | Status | By | When | Note |",
      "|---|---|---|---|---|",
    );
    for (const a of d.approvals)
      L.push(
        `| ${mdCell(a.gate)} | ${mdCell(a.status)} | ${mdCell(a.approved_by)} | ${shortWhen(a.approved_at || a.rejected_at)} | ${a.changed_since_approval ? `${mdCell(a.artifact)} changed after approval` : a.reason ? mdCell(a.reason) : "-"} |`,
      );
    L.push("");
  }
  const commits = Object.entries(t.commits || {}),
    prs = Object.entries(t.pull_requests || {}),
    envs = t.env_branches || {};
  if (commits.length) {
    L.push(
      "## Commits",
      "",
      ...commits.map(([r, c]) => `- \`${r}\`: \`${String(c).slice(0, 12)}\``),
      "",
    );
  }
  if (prs.length) {
    L.push(
      "## Pull requests",
      "",
      ...prs.map(
        ([k, url]) =>
          `- \`${k}\`${envs[k] ? ` (from \`${envs[k]}\`)` : ""}: ${url}`,
      ),
      "",
    );
  }
  if (t.ci)
    L.push(
      `## CI`,
      "",
      `Status: ${mdCell(t.ci.status)}${t.ci.provider ? ` (${mdCell(t.ci.provider)})` : ""}${
        t.ci.checks
          ? "; checks: " +
            Object.entries(t.ci.checks)
              .map(([k, v]) => `${k} ${v}`)
              .join(", ")
          : ""
      }`,
      "",
    );
  if (t.release && t.release.status && t.release.status !== "not-released")
    L.push(
      "## Release",
      "",
      `${mdCell(t.release.status)}${t.release.environment ? " to " + mdCell(t.release.environment) : ""}${t.release.released_at ? " at " + shortWhen(t.release.released_at) : ""}`,
      "",
    );
  const recent = d.history
    .filter(
      (e) =>
        e.event === "state-transition" ||
        e.event === "approval-granted" ||
        e.event === "approval-rejected" ||
        e.event === "pr-created",
    )
    .slice(-MAX_HISTORY);
  if (recent.length) {
    L.push(
      `## Recent history (last ${recent.length})`,
      "",
      "| When | Event | Detail |",
      "|---|---|---|",
    );
    for (const e of recent)
      L.push(
        `| ${shortWhen(e.timestamp)} | ${mdCell(e.event)} | ${e.from && e.to ? `${mdCell(e.from)} -> ${mdCell(e.to)}` : mdCell(e.gate || e.repository || e.reason)} |`,
      );
    L.push("");
  }
  return (
    L.join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

if (args.includes("--export")) {
  const out = opt("--export", "");
  if (!out || out.startsWith("--")) {
    console.error(
      "usage: status-server.js --export <file.html> [--with-docs] [--force]",
    );
    process.exit(1);
  }
  const file = path.resolve(out);
  if (fs.existsSync(file) && !args.includes("--force")) {
    console.error(`${file} already exists; use --force to overwrite it.`);
    process.exit(1);
  }
  const withDocs = args.includes("--with-docs");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, exportHtml(withDocs));
  const n = Object.keys(snapshot(false).tasks).length;
  console.log(
    `Snapshot written: ${file} (${n} task${n === 1 ? "" : "s"}; documents ${withDocs ? "included (text only)" : "not included; use --with-docs"}; local paths and credential status left out)`,
  );
  process.exit(0);
}
if (args.includes("--markdown")) {
  const id = opt("--markdown", "");
  if (!TICKET_RE.test(id)) {
    console.error(
      "usage: status-server.js --markdown <TICKET> [--out <file.md>]",
    );
    process.exit(1);
  }
  const md = markdownStatus(id);
  if (!md) {
    console.error(`no task record for ${id}`);
    process.exit(1);
  }
  const out = opt("--out", "");
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(path.resolve(out), md);
    console.log(`Status written: ${path.resolve(out)}`);
  } else process.stdout.write(md);
  process.exit(0);
}

const send = (
  res,
  code,
  body,
  type = "application/json; charset=utf-8",
  extra = {},
) => {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(
    typeof body === "string" || Buffer.isBuffer(body)
      ? body
      : JSON.stringify(body),
  );
};

const server = http.createServer((req, res) => {
  const host = String(req.headers.host || "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1"].includes(host))
    return send(res, 403, { error: "forbidden host" });
  if (req.method !== "GET") return send(res, 405, { error: "read-only" });
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/" || p === "/index.html")
      return send(res, 200, fs.readFileSync(PAGE), "text/html; charset=utf-8", {
        "Content-Security-Policy":
          "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      });
    if (p === "/api/ping")
      return send(res, 200, { app: "aisdlc-status", root: ROOT });
    if (p === "/api/status") return send(res, 200, status());
    const m = p.match(/^\/api\/tasks\/([^/]+)(\/doc)?$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!TICKET_RE.test(id) || !fs.existsSync(taskDir(id)))
        return send(res, 404, { error: "no such task" });
      if (!m[2]) {
        const d = taskDetail(id);
        return d
          ? send(res, 200, d)
          : send(res, 404, { error: "no task record" });
      }
      const file = docFile(id, url.searchParams.get("path"));
      if (!file) return send(res, 404, { error: "no such document" });
      const ext = path.extname(file).slice(1).toLowerCase();
      if (fs.statSync(file).size > MAX_DOC_BYTES && !IMAGE_TYPE[ext])
        return send(res, 413, {
          error: "document too large to show; open it from the workspace",
        });
      const sandbox = {
        "Content-Security-Policy":
          "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      };
      if (IMAGE_TYPE[ext])
        return send(res, 200, fs.readFileSync(file), IMAGE_TYPE[ext], sandbox);
      if (TEXT_EXT.has(ext))
        return send(
          res,
          200,
          fs.readFileSync(file),
          "text/plain; charset=utf-8",
          sandbox,
        );
      return send(res, 200, fs.readFileSync(file), "application/octet-stream", {
        ...sandbox,
        "Content-Disposition": `attachment; filename="${path.basename(file).replace(/"/g, "")}"`,
      });
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
    .get(
      {
        host: "127.0.0.1",
        port: PORT,
        path: "/api/ping",
        headers: { Host: "localhost" },
        timeout: 2000,
      },
      (r) => {
        let body = "";
        r.on("data", (c) => (body += c));
        r.on("end", () => {
          try {
            const j = JSON.parse(body);
            if (
              j.app === "aisdlc-status" &&
              path.resolve(j.root) === path.resolve(ROOT)
            ) {
              console.log(
                `Status page already running: http://localhost:${PORT}/`,
              );
              process.exit(0);
            }
          } catch {}
          console.error(
            `Port ${PORT} is in use by something else. Use --port <n>.`,
          );
          process.exit(1);
        });
      },
    )
    .on("error", () => {
      console.error(`Port ${PORT} is in use. Use --port <n>.`);
      process.exit(1);
    });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Status page: http://localhost:${server.address().port}/  (workspace ${ROOT}; read-only; Ctrl+C to stop)`,
  );
});
