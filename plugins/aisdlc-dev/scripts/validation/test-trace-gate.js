#!/usr/bin/env node
// Acceptance tests for the cross-repository trace gate: a task spanning two or more repositories (or flagged
// trace_required) cannot edit source until tasks/<T>/trace.md exists and workflow.trace is "completed", when
// policies.yaml require_trace_for_cross_repo is true. Real task state through the real state CLI; both hooks.
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const { spawnSync } = require("child_process");
const SRC = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(SRC, "..", "..");

const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-trace-"));
for (const d of [
  "hooks",
  "scripts/state",
  "scripts/lib",
  "config",
  "tasks",
  "logs",
])
  fs.mkdirSync(path.join(W, d), { recursive: true });
for (const f of [
  "hooks/pre-tool-policy.js",
  "scripts/state/aisdlc-state.js",
  "scripts/lib/repo-paths.js",
  "scripts/lib/root.js",
  "scripts/lib/yaml.js",
  "scripts/lib/auditlog.js",
  "scripts/lib/env-branches.js",
  "scripts/lib/real-systems.js",
])
  fs.copyFileSync(path.join(SRC, f), path.join(W, f));
fs.copyFileSync(
  path.join(SRC, "config", "task-types.yaml"),
  path.join(W, "config", "task-types.yaml"),
);
const mk = (n) => {
  const d = path.join(W, "..", path.basename(W) + "-" + n);
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const api = mk("api"),
  web = mk("web"),
  solo = mk("solo");
fs.writeFileSync(
  path.join(W, "config/repositories.yaml"),
  JSON.stringify({
    repositories: {
      api: { path: api, base_branch: "main" },
      web: { path: web, base_branch: "main" },
      solo: { path: solo, base_branch: "main" },
    },
  }),
);
fs.writeFileSync(
  path.join(W, "config/workspace.yaml"),
  JSON.stringify({ workspace: { name: "t" }, git: { base_branch: "main" } }),
);
const setPolicy = (feature, bug) =>
  fs.writeFileSync(
    path.join(W, "config/policies.yaml"),
    JSON.stringify({
      feature:
        feature === undefined ? {} : { require_trace_for_cross_repo: feature },
      bug: bug === undefined ? {} : { require_trace_for_cross_repo: bug },
    }),
  );
setPolicy(true, true);

const env = { ...process.env, AISDLC_ROOT: W };
// approvals are recorded under git's user.email and refused without one, so the test gives the engine an identity
const GIT_ID = {
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "user.email",
  GIT_CONFIG_VALUE_0: "tester@example.com",
};
const state = (...a) =>
  spawnSync("node", [path.join(W, "scripts/state/aisdlc-state.js"), ...a], {
    env: { ...env, ...GIT_ID },
    encoding: "utf8",
  });
const claude = (file) =>
  spawnSync("node", [path.join(W, "hooks/pre-tool-policy.js")], {
    env,
    input: JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: file },
      cwd: W,
    }),
    encoding: "utf8",
  });
let fail = 0;
const t = (name, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (got ${got}, want ${want})`}`,
  );
};
const both = (name, file, want, extra) => {
  t(`${name}`, claude(file).status, want);
  return extra;
};

// a feature task over two repositories, taken to SPEC_APPROVED (edits are otherwise allowed there)
const feature = (id, repos) => {
  state("init", id, "feature", repos.join(","));
  for (const s of ["TICKET_READY", "UNDERSTOOD", "REPOSITORIES_PREPARED"])
    state("transition", id, s);
  fs.mkdirSync(path.join(W, "tasks", id), { recursive: true });
  fs.writeFileSync(path.join(W, "tasks", id, "specification.md"), "spec");
  state("approve", id, "specification");
  state("transition", id, "SPEC_APPROVED");
};
const finish = (id) => state("transition", id, "CANCELLED");

feature("FEAT-1", ["api", "web"]);
both(
  "two repositories, no trace: an edit in the first repository is blocked",
  path.join(api, "a.js"),
  2,
);
both(
  "two repositories, no trace: an edit in the second repository is blocked",
  path.join(web, "a.js"),
  2,
);
let r = claude(path.join(api, "a.js"));
t(
  "the message names the task, the count and the skill",
  /FEAT-1 spans 2 repositories/.test(r.stderr) &&
    /cross-repo-trace skill/.test(r.stderr) &&
    /tasks\/FEAT-1\/trace\.md/.test(r.stderr),
  true,
);
both(
  "task artifacts can still be written (the trace itself)",
  path.join(W, "tasks/FEAT-1/trace.md"),
  0,
);

state("set", "FEAT-1", "workflow.trace", '"completed"');
both(
  "state says completed but trace.md does not exist: still blocked",
  path.join(api, "a.js"),
  2,
);
fs.writeFileSync(path.join(W, "tasks/FEAT-1/trace.md"), "# trace\n");
state("set", "FEAT-1", "workflow.trace", '"in-progress"');
both(
  "trace.md exists but the state is not completed: still blocked",
  path.join(api, "a.js"),
  2,
);
state("set", "FEAT-1", "workflow.trace", '"completed"');
both(
  "trace.md written and workflow.trace completed: edits allowed",
  path.join(api, "a.js"),
  0,
);
both("...in the other repository too", path.join(web, "a.js"), 0);
finish("FEAT-1");

// a single repository: not required
feature("FEAT-2", ["solo"]);
both(
  "one repository, no shared contract: no trace needed",
  path.join(solo, "a.js"),
  0,
);
state("set", "FEAT-2", "trace_required", "true");
both(
  "one repository but trace_required set (a shared contract changes): blocked",
  path.join(solo, "a.js"),
  2,
);
t(
  "...and the message says it is a shared contract",
  /changes a shared contract/.test(claude(path.join(solo, "a.js")).stderr),
  true,
);
fs.writeFileSync(path.join(W, "tasks/FEAT-2/trace.md"), "# trace\n");
state("set", "FEAT-2", "workflow.trace", '"completed"');
both("...allowed once traced", path.join(solo, "a.js"), 0);
finish("FEAT-2");

// the policy switch
setPolicy(false, true);
feature("FEAT-3", ["api", "web"]);
both(
  "policy feature.require_trace_for_cross_repo false: not enforced",
  path.join(api, "a.js"),
  0,
);
finish("FEAT-3");
setPolicy(undefined, undefined);
feature("FEAT-4", ["api", "web"]);
both(
  "policy key absent (an older workspace policies.yaml): not enforced",
  path.join(api, "a.js"),
  0,
);
finish("FEAT-4");
// no policies.yaml in the workspace: the plugin's own default applies (workspace file overrides plugin default).
// Point the Claude hook at the real plugin so it finds that default, as an installed plugin does.
fs.rmSync(path.join(W, "config/policies.yaml"));
feature("FEAT-5", ["api", "web"]);
const claudeInstalled = (file) =>
  spawnSync("node", [path.join(W, "hooks/pre-tool-policy.js")], {
    env: { ...env, CLAUDE_PLUGIN_ROOT: SRC },
    input: JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: file },
      cwd: W,
    }),
    encoding: "utf8",
  });
t(
  "no policies.yaml in the workspace: the plugin's default (on) applies",
  claudeInstalled(path.join(api, "a.js")).status,
  2,
);
t(
  "the shipped default policies.yaml turns the gate on for features and bugs",
  (() => {
    const p = JSON.parse(
      fs
        .readFileSync(path.join(SRC, "config/policies.yaml"), "utf8")
        .replace(/^\s*#.*$/gm, ""),
    );
    return (
      p.feature.require_trace_for_cross_repo === true &&
      p.bug.require_trace_for_cross_repo === true
    );
  })(),
  true,
);
finish("FEAT-5");
setPolicy(true, true);

// bugs: their own lifecycle, own policy family
const bug = (id, repos) => {
  state("init", id, "bug", repos.join(","));
  for (const s of [
    "TICKET_READY",
    "UNDER_INVESTIGATION",
    "ROOT_CAUSE_CONFIRMED",
    "REPOSITORIES_PREPARED",
  ])
    state("transition", id, s);
};
bug("BUG-1", ["api", "web"]);
both(
  "a bug over two repositories needs the trace too",
  path.join(api, "a.js"),
  2,
);
fs.mkdirSync(path.join(W, "tasks/BUG-1"), { recursive: true });
fs.writeFileSync(path.join(W, "tasks/BUG-1/trace.md"), "# trace\n");
state("set", "BUG-1", "workflow.trace", '"completed"');
both("...and is allowed once traced", path.join(api, "a.js"), 0);
finish("BUG-1");
setPolicy(true, false);
bug("BUG-2", ["api", "web"]);
both(
  "a bug follows the bug policy (false): not enforced even though feature is true",
  path.join(api, "a.js"),
  0,
);
finish("BUG-2");
setPolicy(true, true);

// another task listing the repository still counts: any task that may edit is enough, as before
feature("FEAT-6", ["api", "web"]);
feature("FEAT-7", ["api"]);
both(
  "a second task listing the repository (single repo) can edit, as before",
  path.join(api, "a.js"),
  0,
);
finish("FEAT-7");
finish("FEAT-6");

// the existing gates still come first
feature("FEAT-8", ["api", "web"]);
fs.writeFileSync(path.join(W, "tasks/FEAT-8/trace.md"), "# trace\n");
state("set", "FEAT-8", "workflow.trace", '"completed"');
fs.writeFileSync(
  path.join(W, "tasks/FEAT-8/specification.md"),
  "spec changed after approval",
);
both(
  "a traced task still needs its specification hash to match",
  path.join(api, "a.js"),
  2,
);
finish("FEAT-8");

// trace.md is a protected task artifact: it cannot be deleted before consolidation
const rm = (cmd) =>
  spawnSync("node", [path.join(W, "hooks/pre-tool-policy.js")], {
    env,
    input: JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: cmd },
      cwd: W,
    }),
    encoding: "utf8",
  }).status;
feature("FEAT-9", ["api", "web"]);
t(
  "deleting tasks/<T>/trace.md before consolidation is blocked",
  rm("rm tasks/FEAT-9/trace.md"),
  2,
);

for (const d of [W, api, web, solo])
  fs.rmSync(d, { recursive: true, force: true });
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
