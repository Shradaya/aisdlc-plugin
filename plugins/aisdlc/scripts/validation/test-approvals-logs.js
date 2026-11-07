#!/usr/bin/env node
// Tests for: approvals gated by the hooks (the person is always asked), tamper-evident execution logs (hash chain, optional
// HMAC, direct edits blocked), the approver identity, and the approval checkboxes of the status page. No model needed.
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  http = require("http"),
  crypto = require("crypto");
const { spawnSync, spawn, execSync } = require("child_process");

const PLUGINS = path.resolve(__dirname, "..", "..", "..");
const auditlog = require(
  path.join(PLUGINS, "aisdlc", "scripts", "lib", "auditlog.js"),
);
let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`,
  );
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-appr-"));

// ---- audit log library -------------------------------------------------------------------------------------------------
const lf = path.join(tmp, "execution-log.dev.jsonl");
const add = (ev, key) =>
  auditlog.append(
    lf,
    "EL-1",
    { timestamp: "2026-01-01T00:00:00Z", task: "EL-1", event: ev },
    key,
  );
add("one");
add("two");
add("three");
t("a fresh chain verifies", auditlog.verify(lf, "EL-1").ok, true);
const original = fs.readFileSync(lf, "utf8");
const L = original.split("\n").filter(Boolean);
const check = (lines) => {
  fs.writeFileSync(lf, lines.join("\n") + "\n");
  return auditlog.verify(lf, "EL-1");
};
let r = check(L.map((l, i) => (i === 1 ? l.replace('"two"', '"TWO"') : l)));
t("editing a line is detected at that line", [r.ok, r.brokenAt], [false, 2]);
r = check([L[0], L[2]]);
t("removing a line is detected", [r.ok, r.brokenAt], [false, 2]);
r = check([L[1], L[0], L[2]]);
t("reordering lines is detected", r.ok, false);
r = check(L.map((l, i) => (i === 0 ? l.replace('"prev":"', '"prev":"0') : l)));
t("changing the start link is detected", r.ok, false);
// rewriting a line and recomputing only its own hash still breaks the next line's link
const forged = JSON.parse(L[1]);
forged.event = "forged";
delete forged.hash;
forged.hash = crypto
  .createHash("sha256")
  .update(auditlog.canonical((({ hash, mac, ...x }) => x)(forged)))
  .digest("hex");
r = check([L[0], JSON.stringify(forged), L[2]]);
t(
  "a forged line with a recomputed own hash still breaks the following link",
  [r.ok, r.brokenAt],
  [false, 3],
);
fs.writeFileSync(lf, original);
t("restored log verifies again", auditlog.verify(lf, "EL-1").ok, true);
// legacy lines (written before chaining) are accepted only at the start
const legacy = path.join(tmp, "execution-log.pm.jsonl");
fs.writeFileSync(legacy, '{"event":"old1"}\n{"event":"old2"}\n');
auditlog.append(legacy, "EL-2", { event: "new" });
r = auditlog.verify(legacy, "EL-2");
t(
  "legacy lines before the chain are counted, not failed",
  [r.ok, r.legacy, r.entries],
  [true, 2, 3],
);
fs.appendFileSync(legacy, '{"event":"sneaky"}\n');
t(
  "an unchained line after the chain is a failure",
  auditlog.verify(legacy, "EL-2").ok,
  false,
);
// keyed MAC: nobody without the key can rewrite the file and recompute a valid chain
const kf = path.join(tmp, "execution-log.qa.jsonl");
auditlog.append(kf, "EL-3", { event: "a" }, "secret-key");
auditlog.append(kf, "EL-3", { event: "b" }, "secret-key");
t(
  "a MAC-signed chain verifies with the key",
  auditlog.verify(kf, "EL-3", "secret-key").ok,
  true,
);
t(
  "and fails with another key",
  auditlog.verify(kf, "EL-3", "other-key").ok,
  false,
);
const kl = fs
  .readFileSync(kf, "utf8")
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse);
kl[0].event = "changed";
delete kl[0].hash;
delete kl[0].mac;
kl[0].hash = crypto
  .createHash("sha256")
  .update(auditlog.canonical((({ hash, mac, ...x }) => x)(kl[0])))
  .digest("hex");
fs.writeFileSync(kf, kl.map((x) => JSON.stringify(x)).join("\n") + "\n");
t(
  "a rewritten line cannot be re-signed without the key",
  auditlog.verify(kf, "EL-3", "secret-key").ok,
  false,
);

// ---- a shared repo to drive the hooks and the engines ----------------------------------------------------------------------
const W = path.join(tmp, "repo");
fs.mkdirSync(W);
spawnSync(
  "node",
  [path.join(PLUGINS, "aisdlc/scripts/init/aisdlc-init.js"), W, "--role", "pm"],
  { encoding: "utf8" },
);
execSync("git init -q -b main", { cwd: W });
execSync(
  "git config user.email approver@example.com && git config user.name Approver",
  { cwd: W },
);
const env = (plugin, extra = {}) => ({
  ...process.env,
  AISDLC_ROOT: W,
  CLAUDE_PLUGIN_ROOT: path.join(PLUGINS, plugin),
  ...extra,
});
const hook = (plugin, ev) =>
  spawnSync("node", [path.join(PLUGINS, plugin, "hooks/pre-tool-policy.js")], {
    cwd: W,
    env: env(plugin),
    input: JSON.stringify({ cwd: W, ...ev }),
    encoding: "utf8",
  });
const bash = (plugin, command) =>
  hook(plugin, { tool_name: "Bash", tool_input: { command } });
const write = (plugin, f) =>
  hook(plugin, {
    tool_name: "Write",
    tool_input: { file_path: path.join(W, f) },
  });

for (const [plugin, role, gate] of [
  ["aisdlc-pm", "pm", "acceptance_criteria"],
  ["aisdlc-dev", "dev", "specification"],
  ["aisdlc-qa", "qa", "scenarios"],
]) {
  const r1 = bash(
    plugin,
    `node "$CLAUDE_PLUGIN_ROOT/scripts/state/aisdlc-state.js" approve EL-1 ${gate}`,
  );
  let out = {};
  try {
    out = JSON.parse(r1.stdout).hookSpecificOutput;
  } catch {
    /* not JSON */
  }
  t(
    `${role}: approve is held for the person's confirmation`,
    [r1.status, out.permissionDecision],
    [0, "ask"],
  );
  t(
    `${role}: the prompt names the gate, the ticket and the approver`,
    /'(\w+)' for EL-1/.test(out.permissionDecisionReason || "") &&
      /approver@example\.com/.test(out.permissionDecisionReason || ""),
    true,
  );
  const r2 = bash(
    plugin,
    `node scripts/state/aisdlc-state.js reject EL-1 ${gate} not good enough`,
  );
  t(
    `${role}: reject is held too`,
    JSON.parse(r2.stdout || "{}").hookSpecificOutput?.permissionDecision,
    "ask",
  );
  t(
    `${role}: sealing a state is held for confirmation too`,
    JSON.parse(
      bash(plugin, `node scripts/state/aisdlc-state.js seal EL-1`).stdout ||
        "{}",
    ).hookSpecificOutput?.permissionDecision,
    "ask",
  );
  t(
    `${role}: other state commands are not held`,
    bash(plugin, "node scripts/state/aisdlc-state.js get EL-1").stdout.includes(
      "permissionDecision",
    ),
    false,
  );
  t(
    `${role}: writing an execution log by hand is blocked`,
    write(plugin, `tasks/EL-1/execution-log.${role}.jsonl`).status,
    2,
  );
  t(
    `${role}: appending to an execution log from the shell is blocked`,
    bash(plugin, `echo '{}' >> tasks/EL-1/execution-log.${role}.jsonl`).status,
    2,
  );
  t(
    `${role}: reading an execution log is fine`,
    bash(plugin, `cat tasks/EL-1/execution-log.${role}.jsonl`).status,
    0,
  );
}
t(
  "aisdlc: writing an execution log by hand is blocked",
  write("aisdlc", "tasks/EL-1/execution-log.dev.jsonl").status,
  2,
);
t(
  "aisdlc: appending to an execution log from the shell is blocked",
  bash("aisdlc", "echo x >> tasks/EL-1/execution-log.pm.jsonl").status,
  2,
);

// ---- engine: audit, verify, approver identity -----------------------------------------------------------------------------
const pmEnv = env("aisdlc-pm");
const st = (...args) =>
  spawnSync(
    "node",
    [path.join(PLUGINS, "aisdlc-pm/scripts/state/aisdlc-state.js"), ...args],
    { cwd: W, env: pmEnv, encoding: "utf8" },
  );
st("init", "EL-1", "pm");
st("transition", "EL-1", "REQUIREMENT_GATHERING");
fs.writeFileSync(path.join(W, "tasks/EL-1/acceptance-criteria.md"), "AC1: x\n");
st("transition", "EL-1", "ACCEPTANCE_CRITERIA_DEFINED");
t(
  "audit adds a chained line",
  st("audit", "EL-1", "note-added", '{"by":"me"}').status,
  0,
);
t("audit refuses a bad event name", st("audit", "EL-1", "Bad Event").status, 2);
t(
  "audit refuses details that try to set the chain fields",
  st("audit", "EL-1", "x-y", '{"hash":"abc"}').status,
  2,
);
t(
  "audit refuses details that are not an object",
  st("audit", "EL-1", "x-y", "[1]").status,
  2,
);
t("verify passes on an untouched log", st("verify", "EL-1").status, 0);
const logFile = path.join(W, "tasks/EL-1/execution-log.pm.jsonl");
const saved = fs.readFileSync(logFile, "utf8");
fs.writeFileSync(logFile, saved.replace("note-added", "note-edited"));
const v = st("verify", "EL-1");
const editedLine =
  saved
    .split("\n")
    .filter(Boolean)
    .findIndex((l) => l.includes("note-added")) + 1;
t(
  "verify fails (exit 1) and names the line when the log is edited",
  [v.status, JSON.parse(v.stdout).log.brokenAt],
  [1, editedLine],
);
fs.writeFileSync(logFile, saved);
const noEmail = spawnSync(
  "node",
  [
    path.join(PLUGINS, "aisdlc-pm/scripts/state/aisdlc-state.js"),
    "approve",
    "EL-1",
    "acceptance_criteria",
  ],
  {
    cwd: tmp,
    env: {
      ...pmEnv,
      AISDLC_ROOT: W,
      GIT_CONFIG_GLOBAL: path.join(tmp, "nonexistent-gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
    },
    encoding: "utf8",
  },
);
t(
  "approve refuses when git user.email is not set",
  [
    noEmail.status,
    /user\.email is not set/.test(noEmail.stderr + noEmail.stdout),
  ],
  [2, true],
);
t(
  "approve works with an email and records it",
  [
    st("approve", "EL-1", "acceptance_criteria").status,
    JSON.parse(fs.readFileSync(path.join(W, "tasks/EL-1/task.pm.yaml"), "utf8"))
      .approvals.acceptance_criteria.approved_by,
  ],
  [0, "approver@example.com"],
);
t(
  "the approval is in the chained log with the approver",
  /approval-granted/.test(fs.readFileSync(logFile, "utf8")) &&
    st("verify", "EL-1").status === 0,
  true,
);

// ---- state seal: task.<role>.yaml is bound to the audit log ---------------------------------------------------------------------
const stateFile = path.join(W, "tasks/EL-1/task.pm.yaml");
const readState = () => JSON.parse(fs.readFileSync(stateFile, "utf8"));
t(
  "the state file is sealed to the audit log",
  [Boolean(readState().integrity.seal), readState().integrity.log_head.length],
  [true, 64],
);
t(
  "verify reports the state as sealed and fine",
  JSON.parse(st("verify", "EL-1").stdout).state,
  { sealed: true, ok: true, reason: null, macChecked: false },
);
const goodState = fs.readFileSync(stateFile, "utf8");
const goodLog = fs.readFileSync(logFile, "utf8");
const handEdited = JSON.parse(goodState);
handEdited.task.status = "COMPLETED";
fs.writeFileSync(stateFile, JSON.stringify(handEdited, null, 2));
let vv = st("verify", "EL-1");
t(
  "a hand-edited state fails verify (exit 1) with the reason",
  [vv.status, JSON.parse(vv.stdout).state.reason],
  [1, "the state was edited outside aisdlc-state.js"],
);
t(
  "the engine refuses to work from a hand-edited state",
  st("transition", "EL-1", "REQUIREMENT_GATHERING").status,
  2,
);
const got = st("get", "EL-1");
t(
  "get still shows it, with a warning",
  [
    got.status,
    /integrity check/.test(got.stderr),
    JSON.parse(got.stdout).task.status,
  ],
  [0, true, "COMPLETED"],
);
fs.writeFileSync(stateFile, goodState);
const stripped = JSON.parse(goodState);
delete stripped.integrity;
fs.writeFileSync(stateFile, JSON.stringify(stripped, null, 2));
vv = st("verify", "EL-1");
t(
  "stripping the seal is caught while the log is hash-chained",
  [vv.status, JSON.parse(vv.stdout).state.reason],
  [1, "the seal was removed from the state file"],
);
fs.writeFileSync(stateFile, goodState);
auditlog.append(logFile, "EL-1", {
  timestamp: "2026-01-01T00:00:00Z",
  task: "EL-1",
  event: "added-by-hand",
});
vv = st("verify", "EL-1");
t(
  "a log line added behind the engine's back puts the state out of step",
  [vv.status, /out of step/.test(JSON.parse(vv.stdout).state.reason)],
  [1, true],
);
fs.writeFileSync(logFile, goodLog);
t("restored files verify again", st("verify", "EL-1").status, 0);

// a hand-edited state cannot unlock a hook: HANDED_OFF tasks block writes to requirements.md; faking an earlier state is ignored
st("transition", "EL-1", "HANDED_OFF_TO_DEV");
const handedOff = fs.readFileSync(stateFile, "utf8");
t(
  "pm hook: requirements.md is locked after hand-off",
  write("aisdlc-pm", "tasks/EL-1/requirements.md").status,
  2,
);
const faked = JSON.parse(handedOff);
faked.task.status = "REQUIREMENT_GATHERING";
fs.writeFileSync(stateFile, JSON.stringify(faked, null, 2));
t(
  "pm hook: faking an earlier state by hand does not unlock it",
  write("aisdlc-pm", "tasks/EL-1/requirements.md").status,
  2,
);
const legacyFaked = JSON.parse(handedOff);
legacyFaked.task.status = "REQUIREMENT_GATHERING";
delete legacyFaked.integrity;
fs.writeFileSync(stateFile, JSON.stringify(legacyFaked, null, 2));
t(
  "pm hook: stripping the seal as well does not unlock it either",
  write("aisdlc-pm", "tasks/EL-1/requirements.md").status,
  2,
);
fs.writeFileSync(stateFile, handedOff);
// a state written before sealing existed (no seal, no chained log) is accepted, and sealed by its next update
st("init", "EL-4", "pm");
const f4 = path.join(W, "tasks/EL-4/task.pm.yaml");
const old = JSON.parse(fs.readFileSync(f4, "utf8"));
delete old.integrity;
fs.writeFileSync(f4, JSON.stringify(old, null, 2));
fs.rmSync(path.join(W, "tasks/EL-4/execution-log.pm.jsonl"));
t(
  "a legacy state (no seal, no chained log) is accepted",
  [
    st("get", "EL-4").status,
    JSON.parse(st("verify", "EL-4").stdout).state.sealed,
  ],
  [0, false],
);
st("set", "EL-4", "note", '"x"');
t(
  "and is sealed by its next update",
  JSON.parse(st("verify", "EL-4").stdout).state.sealed,
  true,
);

// seal: one-time migration of a state written before sealing existed
st("init", "EL-5", "pm");
const f5 = path.join(W, "tasks/EL-5/task.pm.yaml");
const old5 = JSON.parse(fs.readFileSync(f5, "utf8"));
delete old5.integrity;
fs.writeFileSync(f5, JSON.stringify(old5, null, 2));
fs.rmSync(path.join(W, "tasks/EL-5/execution-log.pm.jsonl"));
const sealRun = st("seal", "EL-5");
t(
  "seal accepts a legacy state, seals it and records the act",
  [
    sealRun.status,
    JSON.parse(st("verify", "EL-5").stdout).state.sealed,
    /state-sealed/.test(
      fs.readFileSync(
        path.join(W, "tasks/EL-5/execution-log.pm.jsonl"),
        "utf8",
      ),
    ),
  ],
  [0, true, true],
);
t("seal refuses an already sealed state", st("seal", "EL-5").status, 2);
const strippedChained = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const keepState = fs.readFileSync(stateFile, "utf8");
delete strippedChained.integrity;
fs.writeFileSync(stateFile, JSON.stringify(strippedChained, null, 2));
t(
  "seal refuses to bless a state whose seal was stripped from a chained log",
  st("seal", "EL-1").status,
  2,
);
fs.writeFileSync(stateFile, keepState);

// ---- status page: checkboxes and log integrity -------------------------------------------------------------------------------
const PORT = 4400 + Math.floor(Math.random() * 90);
const get = (p) =>
  new Promise((resolve) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve({ status: res.statusCode, body: b }));
      })
      .on("error", () => resolve({ status: 0, body: "" }));
  });
(async () => {
  const server = spawn(
    "node",
    [
      path.join(PLUGINS, "aisdlc/scripts/status/status-server.js"),
      "--port",
      String(PORT),
    ],
    { cwd: W, env: { ...process.env, AISDLC_ROOT: W }, stdio: "ignore" },
  );
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    up = (await get("/api/ping")).status === 200;
    if (!up) await new Promise((x) => setTimeout(x, 150));
  }
  t("status server starts", up, true);
  if (up) {
    let d = JSON.parse((await get("/api/tasks/EL-1")).body);
    const g = (role, gate) =>
      d.gates.find((x) => x.role === role && x.gate === gate);
    t(
      "the approved gate is a ticked checkbox with its approver",
      [
        g("pm", "acceptance_criteria").status,
        g("pm", "acceptance_criteria").approved_by,
      ],
      ["approved", "approver@example.com"],
    );
    t(
      "gates not reached yet show as pending checkboxes",
      [
        g("dev", "specification").status,
        g("qa", "scenarios").status,
        g("qa", "signoff").status,
      ],
      ["pending", "pending", "pending"],
    );
    t("approval count is in the summary", d.summary.approvals, {
      done: 1,
      total: 5,
    });
    t(
      "the plan gate is listed for dev (required, pending)",
      [g("dev", "plan").status],
      ["pending"],
    );
    t(
      "steps name their gate (PM: Acceptance criteria)",
      d.roles.find((r) => r.role === "pm").stepGates[1],
      "acceptance_criteria",
    );
    fs.writeFileSync(
      path.join(W, "tasks/EL-1/task.dev.yaml"),
      JSON.stringify({
        task: { id: "EL-1", type: "feature", status: "IMPLEMENTING" },
        approvals: {
          specification: { status: "approved", approved_by: "a@b.c" },
          plan: { status: "pending" },
        },
      }),
    );
    d = JSON.parse((await get("/api/tasks/EL-1")).body);
    t(
      "a required plan stays an open checkbox while implementing",
      [g("dev", "plan").status, d.summary.approvals],
      ["pending", { done: 2, total: 5 }],
    );
    const base = JSON.parse(
      fs
        .readFileSync(path.join(PLUGINS, "aisdlc/config/flow.yaml"), "utf8")
        .replace(/^\s*#.*$/gm, ""),
    );
    base.gates.dev.find((x) => x.gate === "plan").optional = true;
    base.gates.dev.find((x) => x.gate === "plan").skipped_from = [
      "IMPLEMENTING",
    ];
    fs.writeFileSync(path.join(W, "config/flow.yaml"), JSON.stringify(base));
    d = JSON.parse((await get("/api/tasks/EL-1")).body);
    t(
      "a workspace can make the plan optional: then it shows as not required",
      [g("dev", "plan").status, d.summary.approvals],
      ["skipped", { done: 2, total: 4 }],
    );
    fs.rmSync(path.join(W, "config/flow.yaml"));
    t(
      "an untouched log is reported verified",
      d.log_integrity.every((l) => l.ok),
      true,
    );
    t(
      "sealed states are reported sealed",
      d.log_integrity
        .filter((l) => l.role === "pm")
        .map((l) => l.state.sealed && l.state.ok),
      [true],
    );
    t(
      "an unsealed (legacy) dev state is listed in the summary, not as a failure",
      [d.summary.unsealed.includes("dev"), d.summary.log_ok],
      [true, true],
    );
    fs.writeFileSync(
      path.join(W, "tasks/EL-1/acceptance-criteria.md"),
      "AC1: x\nAC2: added after approval\n",
    );
    d = JSON.parse((await get("/api/tasks/EL-1")).body);
    t(
      "editing an approved file shows 'changed since approval'",
      g("pm", "acceptance_criteria").changed,
      true,
    );
    fs.writeFileSync(logFile, saved.replace("note-added", "note-edited"));
    d = JSON.parse((await get("/api/tasks/EL-1")).body);
    t(
      "a tampered log is reported with its line",
      [d.log_integrity[0].ok, d.log_integrity[0].brokenAt > 0],
      [false, true],
    );
    const status = JSON.parse((await get("/api/status")).body);
    t(
      "and shows up as a blocking issue",
      status.issues.some((i) => /hash check/.test(i.text)),
      true,
    );
  }
  server.kill();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
