#!/usr/bin/env node
// Cross-role flow for the shared aisdlc repo: hand-offs, returns (change requests) and the derived per-ticket view.
// Library (require) and CLI. No dependencies.
//
//   node flow.js derive [TICKET]                       per-ticket flow as JSON (what the status page shows)
//   node flow.js summary [--role ROLE]                 short text: what is waiting for a role
//   node flow.js open TICKET [ROLE]                    open change requests (JSON)
//   node flow.js handoff TICKET TO [--note T] [--from ROLE] [--resolve all|ID,ID] [--force]
//   node flow.js return TICKET TO --reason TEXT [--from ROLE]
//
// Hand-offs and returns are tiny event files, tasks/<TICKET>/handoffs/<UTC time>-<from>-<to>-<handoff|return>.json.
// Unique file names mean two people never edit the same file, so there are no merge conflicts. Everything shown
// (who is active, who is done, open change requests) is derived from the events plus each role's own state file
// (tasks/<TICKET>/task.<role>.yaml, written by that role's plugin). tasks/<TICKET>/changes.md is a short generated view.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { resolveRoot, configPath, NOT_WORKSPACE } = require("../lib/root");
const { readYaml } = require("../lib/yaml");

const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;

function loadFlow(root) {
  const f = readYaml(configPath(root, "flow.yaml"), null);
  if (!f || !Array.isArray(f.order))
    throw new Error("config/flow.yaml is missing or invalid");
  return f;
}

function resolveRole(root, arg) {
  if (arg) return String(arg).trim().toLowerCase();
  if (process.env.AISDLC_ROLE)
    return process.env.AISDLC_ROLE.trim().toLowerCase();
  try {
    return fs
      .readFileSync(path.join(root, ".aisdlc", "role"), "utf8")
      .trim()
      .toLowerCase();
  } catch {
    return null;
  }
}

const taskDir = (root, t) => path.join(root, "tasks", t);
const readState = (root, t, role) =>
  readYaml(path.join(taskDir(root, t), `task.${role}.yaml`), null);

function designFolder(root, t) {
  try {
    return fs
      .readdirSync(path.join(root, "designs", t))
      .some((n) => n !== ".gitkeep");
  } catch {
    return false;
  }
}

function events(root, t) {
  const dir = path.join(taskDir(root, t), "handoffs");
  let names = [];
  try {
    names = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    try {
      out.push({
        ...JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")),
        id: n.replace(/\.json$/, ""),
      });
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

function tickets(root) {
  const set = new Set();
  for (const d of ["tasks", "designs"]) {
    try {
      for (const e of fs.readdirSync(path.join(root, d), {
        withFileTypes: true,
      }))
        if (e.isDirectory() && TICKET_RE.test(e.name)) set.add(e.name);
    } catch {
      /* none */
    }
  }
  return [...set].sort();
}

// Open change requests addressed to `role`: return events not named in any later event's "resolves".
function openReturns(evs, role) {
  const resolved = new Set(evs.flatMap((e) => e.resolves || []));
  return evs.filter(
    (e) =>
      e.type === "return" && (!role || e.to === role) && !resolved.has(e.id),
  );
}

function stepIndex(flow, role, state, signalDone) {
  const steps = (flow.steps && flow.steps[role]) || [];
  if (state) {
    const i = steps.findIndex((s) =>
      (s.states || []).includes(state.task.status),
    );
    if (i >= 0) return i;
  }
  return signalDone;
}

function derive(root, t, flow = loadFlow(root)) {
  const evs = events(root, t);
  const roles = {};
  const failure = new Set(flow.failure_states || []);
  for (const role of flow.order) {
    const state = readState(root, t, role);
    const hasDesign = role === "design" && designFolder(root, t);
    const received = evs.filter((e) => e.type === "handoff" && e.to === role);
    const returnsTo = evs.filter((e) => e.type === "return" && e.to === role);
    const sent = evs.filter((e) => e.type === "handoff" && e.from === role);
    // a role is "done" when it handed off after the last time something came back to it (a return or a later hand-off)
    const incoming = [...received, ...returnsTo].map((e) => e.at).sort();
    const lastIncomingAt = incoming.length ? incoming[incoming.length - 1] : "";
    const handedOff = sent.some((e) => e.at > lastIncomingAt);
    const open = openReturns(evs, role);
    const started = !!state || hasDesign || received.length > 0;
    roles[role] = {
      role,
      label: (flow.labels && flow.labels[role]) || role,
      started,
      handedOff,
      state: state ? state.task.status : null,
      problem:
        state && failure.has(state.task.status) ? state.task.status : null,
      open: open.map((e) => ({
        id: e.id,
        from: e.from,
        at: e.at,
        ask: e.note,
      })),
      step: null,
      status: "waiting",
    };
    // current step: the state's step, or (design) created / handed off
    let idx = null;
    if (role === "design") idx = handedOff ? 1 : hasDesign ? 0 : null;
    else if (state) idx = stepIndex(flow, role, state, null);
    roles[role].step = idx;
    roles[role].steps = ((flow.steps && flow.steps[role]) || []).map(
      (s) => s.label,
    );
    roles[role].stepGates = ((flow.steps && flow.steps[role]) || []).map(
      (s) => s.gate || null,
    );
  }
  // statuses
  const order = flow.order;
  for (const role of order) {
    const r = roles[role];
    if (r.open.length) r.status = "changes requested";
    else if (r.handedOff || r.state === "COMPLETED")
      r.status = "done"; // handed off, or its own task is finished
    else if (r.started) r.status = "active";
  }
  const laterActive = (i) =>
    order
      .slice(i + 1)
      .some((x) =>
        ["active", "done", "changes requested"].includes(roles[x].status),
      );
  order.forEach((role, i) => {
    const r = roles[role];
    if (r.status === "waiting" && !r.started && laterActive(i))
      r.status = "not needed";
  });
  return {
    ticket: t,
    roles: order.map((r) => roles[r]),
    history: evs.map(({ id, from, to, type, note, resolves, at }) => ({
      id,
      from,
      to,
      type,
      note,
      resolves,
      at,
    })),
  };
}

function readiness(root, t, role, flow = loadFlow(root)) {
  const rule = (flow.ready || {})[role];
  if (!rule) return { ok: true };
  if (rule.signal === "design_folder")
    return designFolder(root, t)
      ? { ok: true }
      : {
          ok: false,
          why: `designs/${t}/ has no pages yet (run /aisdlc-design:sync).`,
        };
  const state = readState(root, t, role);
  if (!state) return { ok: false, why: `no ${role} task for ${t} yet.` };
  if (rule.states && !rule.states.includes(state.task.status))
    return {
      ok: false,
      why: `${role} task is at ${state.task.status}; it must reach one of: ${rule.states.join(", ")}.`,
    };
  for (const g of rule.gates || []) {
    const a = state.approvals && state.approvals[g];
    if (!a || a.status !== "approved")
      return { ok: false, why: `${role} approval '${g}' is not approved.` };
  }
  return { ok: true };
}

// changes.md: short generated view of the change requests of a ticket.
function writeChanges(root, t) {
  const evs = events(root, t);
  const returns = evs.filter((e) => e.type === "return");
  const file = path.join(taskDir(root, t), "changes.md");
  if (!returns.length) {
    try {
      fs.rmSync(file);
    } catch {
      /* none */
    }
    return;
  }
  const resolvedBy = new Map();
  for (const e of evs) for (const id of e.resolves || []) resolvedBy.set(id, e);
  const esc = (s) =>
    String(s || "")
      .replace(/\|/g, "\\|")
      .replace(/\s+/g, " ")
      .trim();
  const rows = returns.map((e, i) => {
    const r = resolvedBy.get(e.id);
    return `| ${i + 1} | ${e.from} | ${e.to} | ${esc(e.note)} | ${r ? `resolved by ${r.from} ${r.at.slice(0, 10)}` : "open"} |`;
  });
  fs.writeFileSync(
    file,
    `# Changes requested: ${t}\n\n| # | From | To | Ask | Status |\n|---|---|---|---|---|\n${rows.join("\n")}\n`,
  );
}

function writeEvent(root, ev) {
  const dir = path.join(taskDir(root, ev.ticket), "handoffs");
  fs.mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  const stamp = at.replace(/[-:.]/g, "");
  const full = { ...ev, at };
  const id = `${stamp}-${ev.from}-${ev.to}-${ev.type}`;
  fs.writeFileSync(
    path.join(dir, id + ".json"),
    JSON.stringify(full, null, 2) + "\n",
    { flag: "wx" },
  );
  writeChanges(root, ev.ticket);
  return { ...full, id };
}

function summary(root, role) {
  const flow = loadFlow(root);
  const lines = [];
  for (const t of tickets(root)) {
    const d = derive(root, t, flow);
    for (const r of d.roles) {
      if (role && r.role !== role) continue;
      if (r.status === "changes requested")
        lines.push(
          `${t}: ${r.label} has ${r.open.length} open change request(s): ${r.open.map((o) => `from ${o.from}: ${o.ask}`).join("; ")}`,
        );
      else if (
        r.status === "active" &&
        r.started &&
        !r.state &&
        r.role !== "design"
      )
        lines.push(
          `${t}: ${r.label} was handed this ticket and has not started`,
        );
      else if (r.status === "active")
        lines.push(
          `${t}: ${r.label} is active${r.state ? ` (${r.state})` : ""}`,
        );
    }
  }
  return lines;
}

function cli(argv) {
  const root = resolveRoot();
  const out = (o, code = 0) => {
    console.log(JSON.stringify(o, null, 2));
    process.exit(code);
  };
  if (!root) {
    console.error(NOT_WORKSPACE);
    process.exit(2);
  }
  const [cmd, ...rest] = argv;
  const pos = [];
  const opt = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) {
      const k = rest[i].slice(2);
      opt[k] = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true;
    } else pos.push(rest[i]);
  }
  let flow;
  try {
    flow = loadFlow(root);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const roleOk = (r) => flow.order.includes(r);

  if (cmd === "derive") {
    const ts = pos[0] ? [pos[0]] : tickets(root);
    return out({
      order: flow.order,
      tickets: ts.map((t) => derive(root, t, flow)),
    });
  }
  if (cmd === "summary") {
    const lines = summary(root, resolveRole(root, opt.role));
    console.log(lines.length ? lines.join("\n") : "Nothing is waiting.");
    return;
  }
  if (cmd === "open") {
    const [t, role] = pos;
    if (!TICKET_RE.test(t || ""))
      return out({ ok: false, error: "ticket required" }, 2);
    return out({ ok: true, open: openReturns(events(root, t), role || null) });
  }
  if (cmd === "handoff" || cmd === "return") {
    const [t, to] = pos;
    const from = resolveRole(root, opt.from);
    if (!TICKET_RE.test(t || ""))
      return out({ ok: false, error: "ticket required (e.g. EL-101)" }, 2);
    if (!roleOk(to))
      return out(
        {
          ok: false,
          error: `target role must be one of: ${flow.order.join(", ")}`,
        },
        2,
      );
    if (!roleOk(from))
      return out(
        {
          ok: false,
          error: `your role is unknown; pass --from ROLE or set it with /aisdlc:init (roles: ${flow.order.join(", ")})`,
        },
        2,
      );
    if (from === to)
      return out({ ok: false, error: "from and to are the same role" }, 2);
    if (cmd === "return") {
      if (typeof opt.reason !== "string" || !opt.reason.trim())
        return out(
          { ok: false, error: "--reason is required for a return" },
          2,
        );
      const ev = writeEvent(root, {
        ticket: t,
        from,
        to,
        type: "return",
        note: opt.reason.trim(),
      });
      return out({ ok: true, event: ev });
    }
    const evs = events(root, t);
    if (!opt.force) {
      const ready = readiness(root, t, from, flow);
      if (!ready.ok)
        return out(
          {
            ok: false,
            error: `${from} is not ready to hand off ${t}: ${ready.why}`,
          },
          2,
        );
    }
    const open = openReturns(evs, from);
    let resolves = [];
    if (open.length) {
      if (opt.resolve === true || opt.resolve === "all")
        resolves = open.map((e) => e.id);
      else if (typeof opt.resolve === "string")
        resolves = opt.resolve
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((n) =>
            /^\d+$/.test(n)
              ? (evs.filter((e) => e.type === "return")[Number(n) - 1] || {}).id
              : n,
          )
          .filter(Boolean);
      const left = open.filter((e) => !resolves.includes(e.id));
      if (left.length && !opt.force)
        return out(
          {
            ok: false,
            error: `${left.length} open change request(s) for ${from} on ${t}: resolve them with --resolve all (or the item numbers), or --force to leave them open.`,
            open: left.map((e) => ({ id: e.id, from: e.from, ask: e.note })),
          },
          2,
        );
    }
    const ev = writeEvent(root, {
      ticket: t,
      from,
      to,
      type: "handoff",
      note: typeof opt.note === "string" ? opt.note.trim() : "",
      ...(resolves.length ? { resolves } : {}),
    });
    return out({ ok: true, event: ev });
  }
  console.error("usage: flow.js derive|summary|open|handoff|return ...");
  process.exit(2);
}

module.exports = {
  loadFlow,
  resolveRole,
  events,
  tickets,
  derive,
  readiness,
  openReturns,
  writeEvent,
  writeChanges,
  summary,
  designFolder,
};
if (require.main === module) cli(process.argv.slice(2));
