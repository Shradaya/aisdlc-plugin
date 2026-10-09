#!/usr/bin/env node
// State engine for tasks/<ticket>/task.yaml (spec §17, §18, §46).
// task.yaml is stored as JSON (valid YAML 1.2) so no dependencies are needed.
// Usage:
//   node aisdlc-state.js init <ticket> <type> [repo,repo]
//   node aisdlc-state.js get <ticket>
//   node aisdlc-state.js transition <ticket> <STATE> [--reason "..."]
//   node aisdlc-state.js approve <ticket> specification|plan   (records approver + spec hash)
//   node aisdlc-state.js reject  <ticket> specification|plan <reason>
//   node aisdlc-state.js set <ticket> <dotted.path> <json-value>
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = require("../lib/root").resolveRoot(path.resolve(__dirname, "..", ".."));
const TYPES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "config", "task-types.yaml"), "utf8").replace(/^#.*$/gm, "")
);
const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;

const taskDir = (t) => path.join(ROOT, "tasks", t);
const taskFile = (t) => path.join(taskDir(t), "task.yaml");
const now = () => new Date().toISOString();

let heldLock = null;
function die(msg) {
  console.error("BLOCKED: " + msg);
  if (heldLock) { try { fs.unlinkSync(heldLock); } catch {} }
  process.exit(2);
}

function lifecycleFor(type) {
  return TYPES[type] ? type : TYPES.other_types_use;
}

function load(ticket) {
  if (!TICKET_RE.test(ticket)) die(`invalid ticket number '${ticket}'`);
  if (!fs.existsSync(taskFile(ticket))) die(`no task record for ${ticket}`);
  return JSON.parse(fs.readFileSync(taskFile(ticket), "utf8"));
}

// Exclusive lock via O_EXCL lockfile; stale locks (>30s) are reclaimed.
function withLock(ticket, fn) {
  fs.mkdirSync(taskDir(ticket), { recursive: true });
  const lock = path.join(taskDir(ticket), ".lock");
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      const fd = fs.openSync(lock, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      heldLock = lock;
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) fs.unlinkSync(lock); } catch {}
      if (Date.now() > deadline) die("task state is locked by another session");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try { return fn(); } finally { heldLock = null; try { fs.unlinkSync(lock); } catch {} }
}

function save(ticket, task) {
  task.task.updated_at = now();
  task.task.state_version = (task.task.state_version || 0) + 1;
  const tmp = taskFile(ticket) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(task, null, 2) + "\n");
  fs.renameSync(tmp, taskFile(ticket));
}

function audit(ticket, event, extra = {}) {
  const line = JSON.stringify({ timestamp: now(), task: ticket, event, ...extra });
  fs.appendFileSync(path.join(taskDir(ticket), "execution-log.jsonl"), line + "\n");
}

function specHash(ticket) {
  const f = path.join(taskDir(ticket), "specification.md");
  if (!fs.existsSync(f)) return null;
  return "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
}

function gitUser() {
  try { return execSync("git config user.email", { encoding: "utf8" }).trim(); } catch { return "unknown"; }
}

function allowedTransition(task, to) {
  const t = task.task;
  const lc = TYPES[lifecycleFor(t.type)];
  if (TYPES.failure_states.includes(to)) return true;
  if (!lc.states.includes(to)) return false;
  let from = t.status;
  if (TYPES.failure_states.includes(from)) {
    from = t.resume_state || from;
    if (to === from) return true; // recover to the state the task left
  }
  const i = lc.states.indexOf(from), j = lc.states.indexOf(to);
  if (i < 0) return false;
  if (j === i + 1) return true;
  return (lc.skip[from] || []).includes(to);
}

// Suggested next stage for the developer (config/task-types.yaml "next_steps").
function nextHint(task) {
  const { id, type, status } = task.task;
  const ns = TYPES.next_steps || {};
  let entry = TYPES.failure_states.includes(status)
    ? (ns.failure || {})[status]
    : ((ns[type] || {})[status] || (ns.default || {})[status]);
  if (!entry) return "";
  const [who, text] = entry;
  const label = { you: "You", claude: "Claude", none: "Done" }[who] || who;
  let line = `Next (${label}): ${text.split("{T}").join(id)}`;
  if (TYPES.failure_states.includes(status) && task.task.resume_state)
    line += `\n  (task left ${task.task.resume_state})`;
  return line;
}
const printNext = (ticket) => { try { const h = nextHint(load(ticket)); if (h) console.log(h); } catch {} };

const [cmd, ticket, ...rest] = process.argv.slice(2);

if (cmd === "init") {
  const [type, repos] = rest;
  if (!TICKET_RE.test(ticket || "")) die(`invalid ticket number '${ticket}'`);
  if (fs.existsSync(taskFile(ticket))) die(`task ${ticket} already exists; use resume`);
  if (!type) die("task type required");
  withLock(ticket, () => {
    save(ticket, {
      task: { id: ticket, type, lifecycle: lifecycleFor(type), status: "CREATED", state_version: 0, created_at: now() },
      source: { type: null, snapshot_hash: null },
      repositories: repos ? repos.split(",") : [],
      approvals: { specification: { status: "pending", version: 0 }, plan: { status: "pending" } },
      release: { status: "not-released", environment: null, reference: null, released_at: null },
      knowledge_consolidation: { status: "pending", product_documents_changed: [], source_artifacts_deleted: false },
    });
    audit(ticket, "task-created", { type });
  });
  console.log(`created ${ticket} (${type})`);
  printNext(ticket);
} else if (cmd === "next") {
  console.log(nextHint(load(ticket)) || "No suggestion for this state.");
} else if (cmd === "get") {
  console.log(JSON.stringify(load(ticket), null, 2));
} else if (cmd === "transition") {
  const to = rest[0];
  const ri = rest.indexOf("--reason");
  withLock(ticket, () => {
    const task = load(ticket);
    if (!allowedTransition(task, to)) die(`illegal transition ${task.task.status} -> ${to}`);
    const lc = TYPES[lifecycleFor(task.task.type)];
    if (to === "IMPLEMENTING" && task.task.type !== "bug" && task.approvals.specification.status !== "approved")
      die("Feature specification has not been approved.");
    if (to === "COMPLETED" && lc === TYPES.feature && !task.knowledge_consolidation.source_artifacts_deleted)
      die("Post-release knowledge consolidation is incomplete.");
    if (TYPES.failure_states.includes(to)) task.task.resume_state = task.task.resume_state || task.task.status;
    else delete task.task.resume_state;
    const prev = task.task.status;
    task.task.status = to;
    if (ri >= 0) task.task.reason = rest[ri + 1];
    save(ticket, task);
    audit(ticket, "state-transition", { from: prev, to });
  });
  console.log(`${ticket}: -> ${to}`);
  printNext(ticket);
} else if (cmd === "approve" || cmd === "reject") {
  const [gate, ...reasonParts] = rest;
  if (!["specification", "plan"].includes(gate)) die("gate must be specification or plan");
  withLock(ticket, () => {
    const task = load(ticket);
    const a = task.approvals[gate];
    if (cmd === "approve") {
      if (gate === "specification") {
        const h = specHash(ticket);
        if (!h) die("no specification.md to approve");
        a.version = (a.version || 0) + (a.spec_hash === h ? 0 : 1);
        a.spec_hash = h;
      }
      Object.assign(a, { status: "approved", approved_by: gitUser(), approved_at: now() });
      audit(ticket, "approval-granted", { gate, approver: a.approved_by });
    } else {
      Object.assign(a, { status: "rejected", reason: reasonParts.join(" "), rejected_at: now() });
      audit(ticket, "approval-rejected", { gate });
    }
    save(ticket, task);
  });
  console.log(`${ticket}: ${gate} ${cmd}d`);
  if (cmd === "approve") console.log(gate === "specification"
    ? `Next (Claude): move the task to SPEC_APPROVED, then draft the implementation plan.`
    : `Next (Claude): start implementation of ${ticket}.`);
  else console.log(`Next (You): tell Claude what to change, then re-approve with /aisdlc:approve ${ticket} ${gate}.`);
} else if (cmd === "set") {
  const [dotted, value] = rest;
  withLock(ticket, () => {
    const task = load(ticket);
    const keys = dotted.split(".");
    if (["task.status", "approvals"].includes(keys.slice(0, 2).join(".")) || keys[0] === "approvals")
      die("status and approvals can only change via transition/approve/reject");
    let o = task;
    keys.slice(0, -1).forEach((k) => (o = o[k] = o[k] || {}));
    o[keys.at(-1)] = JSON.parse(value);
    save(ticket, task);
  });
} else {
  die("usage: aisdlc-state.js init|get|next|transition|approve|reject|set <ticket> ...");
}

module.exports = {};
