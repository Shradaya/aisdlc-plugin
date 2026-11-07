#!/usr/bin/env node
// State engine for tasks/<ticket>/task.yaml (spec §17, §18, §46). Canonical copy under packages/aisdlc-core/;
// vendored into each plugin that needs it. See lib/root.js for why each plugin carries its own copy.
// task.yaml is stored as JSON (valid YAML 1.2) so no dependencies are needed.
// Usage:
//   node aisdlc-state.js init <ticket> <type> [repo,repo]
//   node aisdlc-state.js get <ticket>
//   node aisdlc-state.js transition <ticket> <STATE> [--reason "..."]
//   node aisdlc-state.js approve <ticket> <gate>   (records approver + artifact hash)
//   node aisdlc-state.js reject  <ticket> <gate> <reason>
//   node aisdlc-state.js set <ticket> <dotted.path> <json-value>
//   node aisdlc-state.js audit <ticket> <event> ['{"k":"v"}']   (the only way to add an audit line; hash-chained)
//   node aisdlc-state.js seal <ticket>                            (one-time: seal a state file written before sealing existed)
//   node aisdlc-state.js verify <ticket>                          (check the audit log chain and the state seal; exit 1 when broken)
// Gates: specification|plan (feature family) and design (design lifecycle) are built in. A lifecycle in
// task-types.yaml may instead declare its own gates (see "Config-driven gates" below).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const { resolveRoot, configPath, NOT_WORKSPACE } = require("../lib/root");
const { stripComments } = require("../lib/yaml");
const auditlog = require("../lib/auditlog");
const ROOT = resolveRoot();
if (!ROOT) {
  console.error(NOT_WORKSPACE);
  process.exit(1);
}
const TYPES = JSON.parse(stripComments(fs.readFileSync(configPath(ROOT, "task-types.yaml"), "utf8")));
const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;

// Which gate corresponds to each task family, and which artifact file its approval hashes.
// Feature-family tasks gate on specification.md; design tasks gate on design.md.
const GATE_ARTIFACT = { specification: "specification.md", design: "design.md" };
const BUILTIN_GATES = ["specification", "plan", "design"];

// Config-driven gates. A lifecycle may declare, in task-types.yaml:
//   "gates": { "<gate>": { "artifact": "<file in tasks/<ticket>/>", "on_approve": "...", "on_reject": "..." } }
//   "requires_approval": { "<STATE>": "<gate>" | ["<gate>", ...] }   entering STATE needs the gate(s) approved, and
//                                                                   a hash-pinned artifact unchanged since approval
//   "requires_no_open": { "<STATE>": "<task key>" }                  entering STATE is refused while any entry of that
//                                                                   task object/array has status "open"
// Lifecycles without "gates" keep the built-in behaviour (specification/plan/design) unchanged.
const lifecycleGates = (task) => TYPES[lifecycleFor(task.task.type)].gates || null;
const gateArtifact = (task, gate) => {
  const gates = lifecycleGates(task);
  return gates ? gates[gate] && gates[gate].artifact : GATE_ARTIFACT[gate];
};

const taskDir = (t) => path.join(ROOT, "tasks", t);
const NAMES = require("../lib/root").taskNames(ROOT); // task.yaml standalone, task.<role>.yaml in a shared aisdlc workspace
const taskFile = (t) => path.join(taskDir(t), NAMES.state);
const now = () => new Date().toISOString();

let heldLock = null;
function die(msg) {
  console.error("BLOCKED: " + msg);
  if (heldLock) {
    try {
      fs.unlinkSync(heldLock);
    } catch {}
  }
  process.exit(2);
}

function lifecycleFor(type) {
  return TYPES[type] ? type : TYPES.other_types_use;
}

const logPath = (ticket) => path.join(taskDir(ticket), NAMES.log);
// A sealed state file that fails its seal was changed outside this CLI (or is out of step with the audit log): refuse to
// work from it. `get` and `verify` still show it (strict = false).
function load(ticket, strict = true) {
  if (!TICKET_RE.test(ticket)) die(`invalid ticket number '${ticket}'`);
  if (!fs.existsSync(taskFile(ticket))) die(`no task record for ${ticket}`);
  const task = JSON.parse(fs.readFileSync(taskFile(ticket), "utf8"));
  const v = auditlog.verifyState(task, auditlog.headOf(logPath(ticket), ticket), undefined, auditlog.hasChain(logPath(ticket)));
  if (!v.ok) {
    const msg = `the task state for ${ticket} failed its integrity check: ${v.reason}. Restore it from git (git checkout -- tasks/${ticket}) or ask its owner; nothing was changed.`;
    if (strict) die(msg);
    console.error("WARNING: " + msg);
  }
  return task;
}

// Exclusive lock via O_EXCL lockfile; stale locks (>30s) are reclaimed.
function withLock(ticket, fn) {
  fs.mkdirSync(taskDir(ticket), { recursive: true });
  const lock = path.join(taskDir(ticket), NAMES.lock);
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
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 30000) fs.unlinkSync(lock);
      } catch {}
      if (Date.now() > deadline) die("task state is locked by another session");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    return fn();
  } finally {
    heldLock = null;
    try {
      fs.unlinkSync(lock);
    } catch {}
  }
}

function save(ticket, task) {
  task.task.updated_at = now();
  task.task.state_version = (task.task.state_version || 0) + 1;
  task.integrity = auditlog.sealOf(task, auditlog.headOf(logPath(ticket), ticket)); // bound to the audit log's current head
  const tmp = taskFile(ticket) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(task, null, 2) + "\n");
  fs.renameSync(tmp, taskFile(ticket));
}

// Every audit line is hash-chained (and MAC-signed when AISDLC_LOG_KEY is set), see lib/auditlog.js.
function audit(ticket, event, extra = {}) {
  auditlog.append(logPath(ticket), ticket, { timestamp: now(), task: ticket, event, ...extra });
  auditlog.resealFile(taskFile(ticket), logPath(ticket), ticket); // keep the state's seal pointing at the new log head
}

// Hash of the artifact a gate approves (e.g. specification.md, design.md). Null if absent or the gate has none.
function artifactHash(ticket, file) {
  if (!file) return null;
  const f = path.join(taskDir(ticket), file);
  if (!fs.existsSync(f)) return null;
  return "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
}

// Config-driven transition guards (no-op for lifecycles without them).
function checkConfiguredGuards(ticket, task, lc, to) {
  const need = (lc.requires_approval || {})[to];
  for (const gate of need ? [].concat(need) : []) {
    const a = task.approvals[gate];
    if (!a || a.status !== "approved") die(`${gate} has not been approved.`);
    const file = gateArtifact(task, gate);
    if (file && a.artifact_hash !== artifactHash(ticket, file))
      die(`${file} changed after ${gate} approval; reapproval required.`);
  }
  const key = (lc.requires_no_open || {})[to];
  if (key) {
    const open = Object.entries(task[key] || {}).filter(([, v]) => v && v.status === "open").map(([k, v]) => v.id || k);
    if (open.length) die(`${key} still open: ${open.join(", ")}. Resolve or waive them first.`);
  }
}

function gitUser() {
  try {
    return execSync("git config user.email", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "unknown";
  } catch {
    return "unknown";
  }
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
  const i = lc.states.indexOf(from),
    j = lc.states.indexOf(to);
  if (i < 0) return false;
  if (j === i + 1) return true;
  return (lc.skip[from] || []).includes(to);
}

// Suggested next stage for the developer (task-types.yaml "next_steps").
function nextHint(task) {
  const { id, type, status } = task.task;
  const ns = TYPES.next_steps || {};
  let entry = TYPES.failure_states.includes(status)
    ? (ns.failure || {})[status]
    : (ns[type] || {})[status] || (ns.default || {})[status];
  if (!entry) return "";
  const [who, text] = entry;
  const label = { you: "You", claude: "Claude", none: "Done" }[who] || who;
  let line = `Next (${label}): ${text.split("{T}").join(id)}`;
  if (TYPES.failure_states.includes(status) && task.task.resume_state)
    line += `\n  (task left ${task.task.resume_state})`;
  return line;
}
const printNext = (ticket) => {
  try {
    const h = nextHint(load(ticket));
    if (h) console.log(h);
  } catch {}
};

const [cmd, ticket, ...rest] = process.argv.slice(2);

if (cmd === "init") {
  const [type, repos] = rest;
  if (!TICKET_RE.test(ticket || "")) die(`invalid ticket number '${ticket}'`);
  if (fs.existsSync(taskFile(ticket)))
    die(`task ${ticket} already exists; use resume`);
  if (!type) die("task type required");
  const lc = lifecycleFor(type);
  // Lifecycles that declare gates get one pending approval per gate; otherwise feature-family tasks gate on
  // specification + plan and design tasks gate on design.
  const gates = TYPES[lc].gates;
  const approvals = gates
    ? Object.fromEntries(Object.keys(gates).map((g) => [g, { status: "pending", version: 0 }]))
    : lc === "design"
    ? { design: { status: "pending", version: 0 } }
    : { specification: { status: "pending", version: 0 }, plan: { status: "pending" } };
  withLock(ticket, () => {
    save(ticket, {
      task: {
        id: ticket,
        type,
        lifecycle: lc,
        status: "CREATED",
        state_version: 0,
        created_at: now(),
      },
      source: { type: null, snapshot_hash: null },
      repositories: repos ? repos.split(",") : [],
      approvals,
      release: {
        status: "not-released",
        environment: null,
        reference: null,
        released_at: null,
      },
      knowledge_consolidation: {
        status: "pending",
        product_documents_changed: [],
        source_artifacts_deleted: false,
      },
    });
    audit(ticket, "task-created", { type });
  });
  console.log(`created ${ticket} (${type})`);
  printNext(ticket);
} else if (cmd === "next") {
  console.log(nextHint(load(ticket)) || "No suggestion for this state.");
} else if (cmd === "get") {
  console.log(JSON.stringify(load(ticket, false), null, 2));
} else if (cmd === "transition") {
  const to = rest[0];
  const ri = rest.indexOf("--reason");
  withLock(ticket, () => {
    const task = load(ticket);
    if (!allowedTransition(task, to))
      die(`illegal transition ${task.task.status} -> ${to}`);
    const lc = TYPES[lifecycleFor(task.task.type)];
    // Feature-family: IMPLEMENTING requires an approved specification (bugs excepted).
    if (
      to === "IMPLEMENTING" &&
      task.task.type !== "bug" &&
      task.approvals.specification &&
      task.approvals.specification.status !== "approved"
    )
      die("Feature specification has not been approved.");
    // Design lifecycle: COMMITTED requires an approved design.
    if (
      to === "COMMITTED" &&
      task.approvals.design &&
      task.approvals.design.status !== "approved"
    )
      die("Design has not been approved.");
    checkConfiguredGuards(ticket, task, lc, to);
    if (
      to === "COMPLETED" &&
      lc === TYPES.feature &&
      !task.knowledge_consolidation.source_artifacts_deleted
    )
      die("Post-release knowledge consolidation is incomplete.");
    if (TYPES.failure_states.includes(to))
      task.task.resume_state = task.task.resume_state || task.task.status;
    else delete task.task.resume_state;
    const prev = task.task.status;
    const rework =
      to === "IMPLEMENTING" &&
      lc.states.indexOf(prev) > lc.states.indexOf("IMPLEMENTING");
    if (rework) {
      if (ri < 0 || !rest[ri + 1])
        die(
          'reopening a committed task requires --reason "<what is being added>"',
        );
      if (task.approvals.plan) task.approvals.plan = { status: "pending" };
      task.workflow = Object.assign(task.workflow || {}, {
        review: "pending",
        validation: "pending",
        ...(task.workflow && task.workflow.documentation
          ? { documentation: "pending" }
          : {}),
      });
      audit(ticket, "rework-started", { from: prev, reason: rest[ri + 1] });
    }
    task.task.status = to;
    if (ri >= 0) task.task.reason = rest[ri + 1];
    save(ticket, task);
    audit(ticket, "state-transition", { from: prev, to });
  });
  console.log(`${ticket}: -> ${to}`);
  printNext(ticket);
} else if (cmd === "approve" || cmd === "reject") {
  const [gate, ...reasonParts] = rest;
  let gates = null;
  withLock(ticket, () => {
    const task = load(ticket);
    gates = lifecycleGates(task);
    const allowed = gates ? Object.keys(gates) : BUILTIN_GATES;
    if (!allowed.includes(gate)) die(`gate must be one of: ${allowed.join(", ")}`);
    if (!task.approvals[gate]) die(`this task has no ${gate} gate`);
    const a = task.approvals[gate];
    if (cmd === "approve") {
      // The approval is attributed to git's user.email; without one there is nobody to record it under.
      if (gitUser() === "unknown") die("git user.email is not set, so the approval cannot be attributed. Set it first: git config user.email you@company.com");
      // Hash-pinned gates (those with an artifact) record its hash so later edits force reapproval.
      const file = gateArtifact(task, gate);
      if (file) {
        const h = artifactHash(ticket, file);
        if (!h) die(`no ${file} to approve`);
        a.version = (a.version || 0) + (a.artifact_hash === h ? 0 : 1);
        a.artifact_hash = h;
        // Keep the legacy field name for the specification gate so existing hooks/tests keep matching.
        if (gate === "specification") a.spec_hash = h;
      }
      Object.assign(a, {
        status: "approved",
        approved_by: gitUser(),
        approved_at: now(),
      });
      audit(ticket, "approval-granted", { gate, approver: a.approved_by });
    } else {
      Object.assign(a, {
        status: "rejected",
        reason: reasonParts.join(" "),
        rejected_at: now(),
      });
      audit(ticket, "approval-rejected", { gate });
    }
    save(ticket, task);
  });
  console.log(`${ticket}: ${gate} ${cmd}d`);
  const custom = gates && gates[gate] && gates[gate][cmd === "approve" ? "on_approve" : "on_reject"];
  if (custom) console.log(custom.split("{T}").join(ticket));
  else if (cmd === "approve")
    console.log(
      gate === "specification"
        ? `Next (Claude): move the task to SPEC_APPROVED, then draft the implementation plan.`
        : gate === "design"
        ? `Next (Claude): move the task to DESIGN_APPROVED, then finalize the prototype and commit.`
        : `Next (Claude): start implementation of ${ticket}.`,
    );
  else
    console.log(
      `Next (You): tell Claude what to change, then re-approve with /approve ${ticket} ${gate}.`,
    );
} else if (cmd === "audit") {
  // The only way a skill adds an audit line: node aisdlc-state.js audit <ticket> <event> ['{"key":"value"}']
  const [event, json] = rest;
  if (!/^[a-z][a-z0-9-]*$/.test(event || "")) die("audit needs an event name like 'commit-created' (lowercase letters, digits, hyphens)");
  let extra = {};
  if (json) { try { extra = JSON.parse(json); } catch { die("audit details must be a JSON object"); } if (!extra || typeof extra !== "object" || Array.isArray(extra)) die("audit details must be a JSON object"); }
  for (const k of ["timestamp", "task", "event", "prev", "hash", "mac"]) if (k in extra) die(`audit details may not set '${k}'`);
  if (!fs.existsSync(taskFile(ticket))) die(`no task for ${ticket}`);
  withLock(ticket, () => audit(ticket, event, extra));
  console.log(`${ticket}: audit ${event} recorded`);
} else if (cmd === "seal") {
  // One-time migration: seal a state file written before sealing existed. It accepts the file as it is now (check it with
  // git diff first), so the hooks ask the person; the act is recorded in the audit log with git's user.email.
  withLock(ticket, () => {
    if (!fs.existsSync(taskFile(ticket))) die(`no task record for ${ticket}`);
    const task = JSON.parse(fs.readFileSync(taskFile(ticket), "utf8"));
    if (task.integrity && task.integrity.seal) die(`the state of ${ticket} is already sealed; nothing to do`);
    if (auditlog.hasChain(logPath(ticket))) die(`the audit log of ${ticket} is hash-chained, so its state file should be sealed: the seal was removed. Restore the file from git (git checkout -- tasks/${ticket}) instead of sealing it`);
    if (gitUser() === "unknown") die("git user.email is not set, so the seal cannot be attributed. Set it first: git config user.email you@company.com");
    audit(ticket, "state-sealed", { by: gitUser(), note: "existing state accepted as it was" }); // audit() seals the state file
  });
  console.log(`${ticket}: state sealed`);
} else if (cmd === "verify") {
  // Check the hash chain of this task's execution log and the seal of its state file. Exit 1 when either is broken.
  const log = auditlog.verify(logPath(ticket), ticket);
  const state = auditlog.verifyStateFile(taskFile(ticket), logPath(ticket), ticket);
  const ok = log.ok && state.ok;
  console.log(JSON.stringify({ ok, log, state }));
  process.exit(ok ? 0 : 1);
} else if (cmd === "set") {
  const [dotted, value] = rest;
  withLock(ticket, () => {
    const task = load(ticket);
    const keys = dotted.split(".");
    if (
      ["task.status", "approvals"].includes(keys.slice(0, 2).join(".")) ||
      keys[0] === "approvals"
    )
      die("status and approvals can only change via transition/approve/reject");
    let o = task;
    keys.slice(0, -1).forEach((k) => (o = o[k] = o[k] || {}));
    o[keys.at(-1)] = JSON.parse(value);
    save(ticket, task);
  });
} else {
  die(
    "usage: aisdlc-state.js init|get|next|transition|approve|reject|set|audit|verify|seal <ticket> ...",
  );
}

module.exports = {};
