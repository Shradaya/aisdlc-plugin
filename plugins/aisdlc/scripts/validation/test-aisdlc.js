#!/usr/bin/env node
// Deterministic tests for the aisdlc plugin: init, hand-off/return flow, git push/pull between two clones, the commit
// hook, and role plugins keeping per-role state files in a shared repo. No model needed.
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const { spawnSync, execSync } = require("child_process");

const PLUGINS = path.resolve(__dirname, "..", "..", "..");
const AISDLC = path.join(PLUGINS, "aisdlc");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-shared-"));
let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`,
  );
};

const node = (script, args, cwd, extraEnv = {}) =>
  spawnSync("node", [script, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      AISDLC_ROOT: cwd,
      CLAUDE_PLUGIN_ROOT: path.dirname(
        path.dirname(
          script.includes(`${path.sep}scripts${path.sep}`) ? script : script,
        ),
      ),
      ...extraEnv,
    },
  });
const flowJs = (cwd, args, env) =>
  node(path.join(AISDLC, "scripts/flow/flow.js"), args, cwd, {
    CLAUDE_PLUGIN_ROOT: AISDLC,
    ...env,
  });
const gitJs = (cwd, args, env) =>
  node(path.join(AISDLC, "scripts/git/aisdlc-git.js"), args, cwd, {
    CLAUDE_PLUGIN_ROOT: AISDLC,
    ...env,
  });
const json = (r) => {
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { raw: r.stdout, err: r.stderr };
  }
};
const g = (cwd, c) =>
  execSync("git " + c, { cwd, stdio: "pipe", encoding: "utf8" });
const writeJson = (f, o) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(o));
};
const state = (cwd, T, role, status, approvals = {}) =>
  writeJson(path.join(cwd, "tasks", T, `task.${role}.yaml`), {
    task: { id: T, type: role, status },
    approvals,
  });

// ---- init -------------------------------------------------------------------------------------------------------
const seed = path.join(tmp, "seed");
fs.mkdirSync(seed);
const init = node(
  path.join(AISDLC, "scripts/init/aisdlc-init.js"),
  [seed, "--role", "pm"],
  tmp,
  { AISDLC_ROOT: "" },
);
t("init exits 0", init.status, 0);
const ws = fs.readFileSync(path.join(seed, "config/workspace.yaml"), "utf8");
t("workspace kind is aisdlc", /"kind":\s*"aisdlc"/.test(ws), true);
t(
  "role recorded locally",
  fs.readFileSync(path.join(seed, ".aisdlc/role"), "utf8").trim(),
  "pm",
);
const gi = fs.readFileSync(path.join(seed, ".gitignore"), "utf8");
t("tasks/ is not ignored", /^tasks\/\*$/m.test(gi), false);
t("QA tests are ignored", /^tests\/$/m.test(gi), true);
// workspace.yaml must keep what dev, pm and qa read
const wsJson = JSON.parse(ws.replace(/^\s*#.*$/gm, ""));
t(
  "workspace has dev keys",
  ["task_root", "repository_root", "system_root", "audit_log"].every(
    (k) => k in wsJson.workspace,
  ),
  true,
);
t("workspace has git block", !!(wsJson.git && wsJson.git.commit_format), true);
const integ = JSON.parse(
  fs
    .readFileSync(path.join(seed, "config/integrations.yaml"), "utf8")
    .replace(/^\s*#.*$/gm, ""),
);
t(
  "integrations cover pm and qa write switches",
  ["update_description", "add_attachment", "add_comment"].every(
    (k) => k in integ.jira.write,
  ),
  true,
);

t(
  "the base branch is main by default",
  wsJson.workspace.base_branch_policy,
  "main",
);
// the clones below share work on main itself, so they use another base branch; the base-branch rules have their own section
fs.writeFileSync(
  path.join(seed, "config/workspace.yaml"),
  ws.replace('"base_branch_policy": "main"', '"base_branch_policy": "trunk"'),
);

// ---- two clones of a bare remote ----------------------------------------------------------------------------------
const remote = path.join(tmp, "remote.git");
execSync(`git init -q --bare -b main "${remote}"`);
g(seed, "init -q -b main");
for (const [k, v] of [
  ["user.email", "a@x.io"],
  ["user.name", "A"],
])
  g(seed, `config ${k} ${v}`);
g(
  seed,
  "add -A -- config tasks designs system repositories CLAUDE.md .gitignore",
);
g(seed, 'commit -q -m "EL-0: Scaffold shared repo"');
g(seed, `remote add origin "${remote}"`);
g(seed, "push -q -u origin main");
const clone = (name, role) => {
  const d = path.join(tmp, name);
  execSync(`git clone -q "${remote}" "${d}"`);
  for (const [k, v] of [
    ["user.email", `${name}@x.io`],
    ["user.name", name],
  ])
    g(d, `config ${k} ${v}`);
  fs.mkdirSync(path.join(d, ".aisdlc"), { recursive: true });
  fs.writeFileSync(path.join(d, ".aisdlc/role"), role + "\n");
  return d;
};
const A = clone("pmclone", "pm");
const B = clone("devclone", "dev");

// ---- hand-off and return --------------------------------------------------------------------------------------------
const T = "EL-101";
let r = flowJs(A, ["handoff", T, "dev"]);
t("hand-off blocked while pm has no task", r.status, 2);
state(A, T, "pm", "REQUIREMENT_GATHERING");
r = flowJs(A, ["handoff", T, "dev"]);
t("hand-off blocked before acceptance criteria", r.status, 2);
state(A, T, "pm", "ACCEPTANCE_CRITERIA_DEFINED", {
  acceptance_criteria: { status: "pending" },
});
t(
  "hand-off blocked until the gate is approved",
  flowJs(A, ["handoff", T, "dev"]).status,
  2,
);
state(A, T, "pm", "ACCEPTANCE_CRITERIA_DEFINED", {
  acceptance_criteria: { status: "approved" },
});
r = flowJs(A, ["handoff", T, "dev", "--note", "ACs approved"]);
t("hand-off pm to dev ok", r.status, 0);
t(
  "hand-off to your own role refused",
  flowJs(A, ["handoff", T, "pm"]).status,
  2,
);
t("unknown role refused", flowJs(A, ["handoff", T, "sales"]).status, 2);
let d = json(flowJs(A, ["derive", T])).tickets[0];
const byRole = (dd) =>
  Object.fromEntries(dd.roles.map((x) => [x.role, x.status]));
t(
  "pm done, dev active, design not needed (never started, dev is active)",
  byRole(d),
  { pm: "done", design: "not needed", dev: "active", qa: "waiting" },
);
state(A, T, "dev", "IMPLEMENTING");
d = json(flowJs(A, ["derive", T])).tickets[0];
t("qa still waiting", byRole(d).qa, "waiting");
t(
  "dev step is Implement",
  d.roles.find((x) => x.role === "dev").steps[
    d.roles.find((x) => x.role === "dev").step
  ],
  "Implement",
);

t(
  "return needs a reason",
  flowJs(A, ["return", T, "pm", "--from", "dev"]).status,
  2,
);
r = flowJs(A, [
  "return",
  T,
  "pm",
  "--from",
  "dev",
  "--reason",
  "AC 3 is ambiguous",
]);
t("dev returns to pm", r.status, 0);
const changes = fs.readFileSync(path.join(A, "tasks", T, "changes.md"), "utf8");
t(
  "changes.md lists the open item",
  /\| 1 \| dev \| pm \| AC 3 is ambiguous \| open \|/.test(changes),
  true,
);
d = json(flowJs(A, ["derive", T])).tickets[0];
t("pm shows changes requested", byRole(d).pm, "changes requested");
r = flowJs(A, ["handoff", T, "dev"]);
t("hand-off blocked while a change request is open", r.status, 2);
r = flowJs(A, [
  "handoff",
  T,
  "dev",
  "--resolve",
  "all",
  "--note",
  "AC 3 clarified",
]);
t("hand-off with --resolve all passes", r.status, 0);
d = json(flowJs(A, ["derive", T])).tickets[0];
t(
  "pm done again, nothing open",
  [byRole(d).pm, d.roles[0].open.length],
  ["done", 0],
);
t(
  "changes.md shows it resolved",
  /resolved by pm/.test(
    fs.readFileSync(path.join(A, "tasks", T, "changes.md"), "utf8"),
  ),
  true,
);

// design is derived from the folder
fs.mkdirSync(path.join(A, "designs", T), { recursive: true });
fs.writeFileSync(
  path.join(A, "designs", T, "home.dc.html"),
  "<title>home</title>",
);
d = json(flowJs(A, ["derive", T])).tickets[0];
t("design is active once designs/<T>/ has a page", byRole(d).design, "active");
t(
  "design can hand off with a page",
  flowJs(A, ["handoff", T, "dev", "--from", "design"]).status,
  0,
);

// ---- git: status, commit, push, pull ---------------------------------------------------------------------------------
fs.writeFileSync(path.join(A, "tasks", T, "requirements.md"), "- req\n");
fs.mkdirSync(path.join(A, "tests"), { recursive: true });
fs.writeFileSync(path.join(A, "tests", "x.spec.ts"), "// local only");
const st = json(gitJs(A, ["status"]));
t(
  "status lists workflow files, not tests",
  st.files.some((f) => f.file.startsWith("tests/")),
  false,
);
t("status names the ticket", st.tickets, [T]);
t(
  "commit with a bad message refused",
  gitJs(A, ["commit", "--message", "added stuff"]).status,
  2,
);
t(
  "commit naming another ticket refused",
  gitJs(A, ["commit", "--message", "EL-999: x"]).status,
  2,
);
t(
  "commit ok",
  gitJs(A, ["commit", "--message", `${T}: Requirements, hand-offs and design`])
    .status,
  0,
);
t("tests/ is not tracked", g(A, "ls-files tests").trim(), "");
t("push ok", gitJs(A, ["push"]).status, 0);
r = gitJs(B, ["pull", "--role", "dev"]);
t("pull ok", json(r).ok, true);
t(
  "pull shows dev is active on the ticket",
  json(r).waiting.some((l) => l.startsWith(`${T}: Dev`)),
  true,
);
t(
  "events arrived in the other clone",
  fs.readdirSync(path.join(B, "tasks", T, "handoffs")).length >= 4,
  true,
);

// two roles write events at the same time: different files, so the rebase has nothing to conflict on
flowJs(A, ["return", T, "pm", "--from", "dev", "--reason", "from A"]);
flowJs(B, ["return", T, "design", "--from", "dev", "--reason", "from B"]);
t("A commits", gitJs(A, ["commit", "--message", `${T}: A return`]).status, 0);
t("B commits", gitJs(B, ["commit", "--message", `${T}: B return`]).status, 0);
t("A pushes", gitJs(A, ["push"]).status, 0);
t(
  "B's push pulls first, so being behind is fine",
  gitJs(B, ["push"]).status,
  0,
);
t(
  "changes.md is not committed",
  g(B, "ls-files tasks/EL-101/changes.md").trim(),
  "",
);
t(
  "pull regenerates changes.md locally",
  (gitJs(B, ["pull"]), fs.existsSync(path.join(B, "tasks", T, "changes.md"))),
  true,
);
t(
  "both returns survive the rebase",
  fs
    .readdirSync(path.join(B, "tasks", T, "handoffs"))
    .filter((n) => n.endsWith("-return.json")).length,
  3,
);
t(
  "A sees B's push after a pull",
  (gitJs(A, ["pull"]),
  fs
    .readdirSync(path.join(A, "tasks", T, "handoffs"))
    .filter((n) => n.endsWith("-return.json")).length),
  3,
);

// push and pull set uncommitted workflow files aside and put them back
fs.writeFileSync(
  path.join(B, "tasks", T, "requirements.md"),
  "- req\n- B local edit\n",
);
fs.writeFileSync(path.join(A, "tasks", T, "extra.md"), "- from A\n");
t(
  "A commits extra",
  gitJs(A, ["commit", "--message", `${T}: Extra notes`]).status,
  0,
);
t("A pushes extra", gitJs(A, ["push"]).status, 0);
r = gitJs(B, ["pull"]);
t("pull works with uncommitted workflow changes", json(r).ok, true);
t(
  "uncommitted edit is still there",
  fs
    .readFileSync(path.join(B, "tasks", T, "requirements.md"), "utf8")
    .includes("B local edit"),
  true,
);
t(
  "and the new file arrived",
  fs.existsSync(path.join(B, "tasks", T, "extra.md")),
  true,
);
g(B, "checkout -- tasks");

// merge conflict: the same line edited on both sides. aisdlc stops and leaves it to the person.
fs.writeFileSync(
  path.join(A, "tasks", T, "requirements.md"),
  "- req\n- A says one thing\n",
);
t(
  "A commits the edit",
  gitJs(A, ["commit", "--message", `${T}: A edit`]).status,
  0,
);
t("A pushes the edit", gitJs(A, ["push"]).status, 0);
fs.writeFileSync(
  path.join(B, "tasks", T, "requirements.md"),
  "- req\n- B says another\n",
);
t(
  "B commits the edit",
  gitJs(B, ["commit", "--message", `${T}: B edit`]).status,
  0,
);
r = gitJs(B, ["push"]);
t("push stops on a conflict", [r.status, json(r).conflict], [2, true]);
t(
  "the message tells the person to resolve it by hand",
  /git rebase --continue/.test(json(r).error || ""),
  true,
);
t(
  "the rebase is left in progress, not aborted",
  fs.existsSync(path.join(B, ".git", "rebase-merge")) ||
    fs.existsSync(path.join(B, ".git", "rebase-apply")),
  true,
);
t(
  "the conflicted file holds both sides for the person",
  /<<<<<<<|>>>>>>>/.test(
    fs.readFileSync(path.join(B, "tasks", T, "requirements.md"), "utf8"),
  ),
  true,
);
r = gitJs(B, ["pull"]);
t(
  "pull refuses while the conflict is open",
  [r.status, json(r).conflict],
  [2, true],
);
t("push refuses while the conflict is open", gitJs(B, ["push"]).status, 2);
// the person resolves it
fs.writeFileSync(
  path.join(B, "tasks", T, "requirements.md"),
  "- req\n- A and B agreed\n",
);
g(B, "add tasks");
execSync("git -c core.editor=true rebase --continue", {
  cwd: B,
  stdio: "pipe",
});
t("after the person resolves it, push works", gitJs(B, ["push"]).status, 0);
t(
  "first push to a branch the remote does not have yet",
  (g(B, "checkout -q -b scratch"), gitJs(B, ["push"]).status),
  0,
);
g(B, "checkout -q main");

// ---- hook -------------------------------------------------------------------------------------------------------------
const hook = (cwd, ev) =>
  spawnSync("node", [path.join(AISDLC, "hooks/pre-tool-policy.js")], {
    cwd,
    env: { ...process.env, AISDLC_ROOT: cwd },
    input: JSON.stringify({ cwd, ...ev }),
    encoding: "utf8",
  }).status;
const bash = (cwd, command) =>
  hook(cwd, { tool_name: "Bash", tool_input: { command } });
const write = (cwd, f) =>
  hook(cwd, {
    tool_name: "Write",
    tool_input: { file_path: path.join(cwd, f) },
  });
fs.writeFileSync(path.join(A, "tasks", T, "notes.md"), "note");
g(A, "add tasks");
t(
  "hook: valid root commit allowed",
  bash(A, `git commit -m "${T}: Add notes"`),
  0,
);
t(
  "hook: message without ticket blocked",
  bash(A, `git commit -m "add notes"`),
  2,
);
t("hook: commit -a blocked", bash(A, `git commit -a -m "${T}: x"`), 2);
g(A, "reset -q");
fs.writeFileSync(path.join(A, "package.json"), "{}");
g(A, "add -f package.json");
t(
  "hook: staging outside the workflow folders blocked",
  bash(A, `git commit -m "${T}: x"`),
  2,
);
g(A, "reset -q package.json");
t("hook: git add tests blocked", bash(A, "git add tests"), 2);
t("hook: force push blocked", bash(A, "git push --force origin main"), 2);
t(
  "hook: hand-off event files cannot be edited directly",
  write(A, `tasks/${T}/handoffs/x.json`),
  2,
);
t(
  "hook: changes.md cannot be edited directly",
  write(A, `tasks/${T}/changes.md`),
  2,
);
t(
  "hook: ordinary task documents can be written",
  write(A, `tasks/${T}/requirements.md`),
  0,
);

// ---- the team's branch (made by hand, for example S10): main is never committed or pushed to -------------------------------
const seed2 = path.join(tmp, "seed2"),
  remote2 = path.join(tmp, "remote2.git");
fs.mkdirSync(seed2);
node(
  path.join(AISDLC, "scripts/init/aisdlc-init.js"),
  [seed2, "--role", "pm"],
  tmp,
  { AISDLC_ROOT: "" },
);
execSync(`git init -q --bare -b main "${remote2}"`);
g(seed2, "init -q -b main");
for (const [k, v] of [
  ["user.email", "p@x.io"],
  ["user.name", "P"],
])
  g(seed2, `config ${k} ${v}`);
g(
  seed2,
  "add -A -- config tasks designs system repositories CLAUDE.md .gitignore",
);
g(seed2, 'commit -q -m "EL-0: Scaffold shared repo"');
g(seed2, `remote add origin "${remote2}"`);
t(
  "the very first push of a new repository may go to main",
  gitJs(seed2, ["push"]).status,
  0,
);
const NL = String.fromCharCode(10);
fs.mkdirSync(path.join(seed2, "tasks/EL-300"), { recursive: true });
fs.writeFileSync(
  path.join(seed2, "tasks/EL-300/requirements.md"),
  "- req" + NL,
);
r = gitJs(seed2, ["commit", "--message", "EL-300: Requirements"]);
t(
  "commit on main is refused and says to switch to the team's branch",
  [r.status, json(r).on_base, /git switch/.test(json(r).error)],
  [2, true, true],
);
t("and nothing was committed", g(seed2, "rev-list --count HEAD").trim(), "1");
t(
  "hook: raw git commit on main blocked",
  (g(seed2, "add tasks"), bash(seed2, 'git commit -m "EL-300: Requirements"')),
  2,
);
g(seed2, "reset -q");
t("hook: raw git push on main blocked", bash(seed2, "git push"), 2);
t("hook: git push origin main blocked", bash(seed2, "git push origin main"), 2);
t("push on main refused by the script", gitJs(seed2, ["push"]).status, 2);
t(
  "a branch flag does not exist any more",
  gitJs(seed2, [
    "commit",
    "--message",
    "EL-300: Requirements",
    "--branch",
    "S10",
  ]).status,
  2,
);
t(
  "there is no sprint command either (the branch is made by hand)",
  gitJs(seed2, ["sprint", "S10"]).status,
  2,
);
g(seed2, "switch -q -c S10"); // the team's branch, made by hand
t(
  "commit on the team's branch works",
  gitJs(seed2, ["commit", "--message", "EL-300: Requirements"]).status,
  0,
);
t("main did not move", g(seed2, "rev-list --count main").trim(), "1");
t(
  "hook: commit on the team's branch allowed",
  (fs.writeFileSync(path.join(seed2, "tasks/EL-300/more.md"), "x"),
  g(seed2, "add tasks"),
  bash(seed2, 'git commit -m "EL-300: More"')),
  0,
);
g(seed2, 'commit -q -m "EL-300: More"');
t(
  "hook: git push of the team's branch allowed",
  bash(seed2, "git push -u origin S10"),
  0,
);
t(
  "hook: pushing HEAD:main from the branch blocked",
  bash(seed2, "git push origin HEAD:main"),
  2,
);
r = json(gitJs(seed2, ["push", "--dry-run"]));
t(
  "push dry run names the branch and changes nothing",
  [r.dry_run, r.branch, g(seed2, "ls-remote --heads origin").includes("S10")],
  [true, "S10", false],
);
t("status names the branch", json(gitJs(seed2, ["status"])).branch, "S10");
t("push of the branch works", gitJs(seed2, ["push"]).status, 0);
t(
  "the remote has the branch and main is untouched",
  [
    g(seed2, "ls-remote --heads origin").includes("refs/heads/S10"),
    g(remote2, "rev-list --count main").trim(),
  ],
  [true, "1"],
);
// unknown commands and flags do nothing
t(
  "an unknown flag is refused, not run",
  gitJs(seed2, ["push", "--help"]).status,
  2,
);
t(
  "help prints usage and exits 0",
  [
    gitJs(seed2, ["--help"]).status,
    /usage/.test(gitJs(seed2, ["--help"]).stdout),
  ],
  [0, true],
);
t("an unknown command is refused", gitJs(seed2, ["nuke"]).status, 2);
// a teammate on the same branch stays in sync with every push and pull; main is not merged into it
const D = path.join(tmp, "dclone");
execSync(`git clone -q "${remote2}" "${D}"`);
for (const [k, v] of [
  ["user.email", "d@x.io"],
  ["user.name", "D"],
])
  g(D, `config ${k} ${v}`);
g(D, "switch -q S10");
t(
  "a teammate on S10 has the files",
  fs.existsSync(path.join(D, "tasks/EL-300/requirements.md")),
  true,
);
fs.mkdirSync(path.join(D, "tasks/EL-301"), { recursive: true });
fs.writeFileSync(
  path.join(D, "tasks/EL-301/requirements.md"),
  "- from the teammate" + NL,
);
t(
  "teammate commits and pushes on S10",
  [
    gitJs(D, ["commit", "--message", "EL-301: Requirements"]).status,
    gitJs(D, ["push"]).status,
  ],
  [0, 0],
);
r = gitJs(seed2, ["pull"]);
t(
  "pull keeps the first person in sync",
  [json(r).ok, fs.existsSync(path.join(seed2, "tasks/EL-301/requirements.md"))],
  [true, true],
);
const E = path.join(tmp, "eclone");
execSync(`git clone -q "${remote2}" "${E}"`);
for (const [k, v] of [
  ["user.email", "e@x.io"],
  ["user.name", "E"],
])
  g(E, `config ${k} ${v}`);
fs.mkdirSync(path.join(E, "tasks/EL-302"), { recursive: true });
fs.writeFileSync(
  path.join(E, "tasks/EL-302/requirements.md"),
  "- on main" + NL,
);
g(E, "add tasks");
g(E, 'commit -q -m "EL-302: On main"');
g(E, "push -q origin main");
gitJs(seed2, ["pull"]);
t(
  "pull does not merge main into the team's branch",
  fs.existsSync(path.join(seed2, "tasks/EL-302/requirements.md")),
  false,
);

// ---- a bug fix skips the documents: no PM, design, specification or plan; dev hands straight to QA -------------------------
const BUG = "EL-310";
writeJson(path.join(seed2, "tasks", BUG, "task.dev.yaml"), {
  task: { id: BUG, type: "bug", status: "IMPLEMENTING" },
  approvals: {},
});
let bd = json(flowJs(seed2, ["derive", BUG])).tickets[0];
const bRole = (n) => bd.roles.find((x) => x.role === n);
t("bug: derive reports the variant", bd.variant, "bug");
t(
  "bug: dev steps are Investigate, Fix, Pull request, Merged",
  bRole("dev").steps,
  ["Investigate", "Fix", "Pull request", "Merged"],
);
t(
  "bug: PM and design are not needed",
  [bRole("pm").status, bRole("design").status],
  ["not needed", "not needed"],
);
t("bug: dev is on the Fix step", bRole("dev").step, 1);
t(
  "bug: dev cannot hand off before the fix is merged",
  flowJs(seed2, ["handoff", BUG, "qa", "--from", "dev"]).status,
  2,
);
writeJson(path.join(seed2, "tasks", BUG, "task.dev.yaml"), {
  task: { id: BUG, type: "bug", status: "COMPLETED" },
  approvals: {},
});
t(
  "bug: dev hands straight to QA without any document",
  flowJs(seed2, ["handoff", BUG, "qa", "--from", "dev"]).status,
  0,
);
bd = json(flowJs(seed2, ["derive", BUG])).tickets[0];
t(
  "bug: QA is active, dev done",
  [bRole("qa").status, bRole("dev").status],
  ["active", "done"],
);
const featState = {
  task: { id: "EL-311", type: "feature", status: "IMPLEMENTING" },
  approvals: {},
};
writeJson(path.join(seed2, "tasks", "EL-311", "task.dev.yaml"), featState);
t(
  "feature: the default steps (with specification and plan) still apply",
  json(flowJs(seed2, ["derive", "EL-311"]))
    .tickets[0].roles.find((x) => x.role === "dev")
    .steps.includes("Plan"),
  true,
);

// dev's cleanup never deletes the PM's documents in the shared repo
const devHook = (cwd, command) =>
  spawnSync(
    "node",
    [path.join(PLUGINS, "aisdlc-dev/hooks/pre-tool-policy.js")],
    {
      cwd,
      env: { ...process.env, AISDLC_ROOT: cwd },
      input: JSON.stringify({
        cwd,
        tool_name: "Bash",
        tool_input: { command },
      }),
      encoding: "utf8",
    },
  ).status;
t(
  "dev hook: deleting requirements.md in the shared repo is blocked",
  devHook(seed2, "rm tasks/EL-300/requirements.md"),
  2,
);
t(
  "dev hook: deleting acceptance-criteria.md in the shared repo is blocked",
  devHook(seed2, "rm tasks/EL-300/acceptance-criteria.md"),
  2,
);

// ---- QA runs, errors and defects on the status page, only when the information exists ---------------------------------------
const statusJson = (cwd, ticket) =>
  JSON.parse(
    spawnSync(
      "node",
      [path.join(AISDLC, "scripts/status/status-server.js"), "--json", ticket],
      { cwd, env: { ...process.env, AISDLC_ROOT: cwd }, encoding: "utf8" },
    ).stdout,
  );
t(
  "no QA card data when there are no runs or defects",
  statusJson(seed2, "EL-300").qa,
  null,
);
const ev1 = path.join(seed2, "tasks/EL-312/evidence/run-1");
fs.mkdirSync(path.join(ev1, "screenshots/EL-312-S1"), { recursive: true });
fs.writeFileSync(path.join(ev1, "screenshots/EL-312-S1/01-open.png"), "png");
writeJson(path.join(ev1, "summary.json"), {
  totals: { tests: 2, passed: 1, failed: 1 },
  tests: [
    { scenario: "S1", title: "ok", status: "passed" },
    {
      scenario: "S2",
      title: "bad",
      status: "failed",
      error: "boom",
      failed_step: "submit",
    },
  ],
});
writeJson(path.join(seed2, "tasks/EL-312/task.qa.yaml"), {
  task: { id: "EL-312", type: "qa", status: "AWAITING_DEV_FIX" },
  approvals: {},
  defects: { D1: { status: "open", title: "Wrong message" } },
});
const qd = statusJson(seed2, "EL-312").qa;
t(
  "QA runs: totals, the failing test with its error, and the defect",
  [
    qd.runs[0].totals.failed,
    qd.runs[0].tests[1].error,
    qd.defects[0].id,
    qd.defects[0].status,
  ],
  [1, "boom", "D1", "open"],
);
t(
  "QA runs: screenshots listed from the local evidence folder",
  qd.runs[0].screenshots[0].shots[0].path,
  "tasks/EL-312/evidence/run-1/screenshots/EL-312-S1/01-open.png",
);
t(
  "evidence is gitignored (run records stay in task.qa.yaml)",
  g(seed2, "check-ignore tasks/EL-312/evidence/run-1/summary.json").trim(),
  "tasks/EL-312/evidence/run-1/summary.json",
);

// ---- role plugins keep per-role state files in a shared repo ----------------------------------------------------------
for (const [role, type] of [
  ["dev", "feature"],
  ["pm", "pm"],
  ["qa", "qa"],
]) {
  const plugin = path.join(PLUGINS, `aisdlc-${role}`);
  if (!fs.existsSync(plugin)) continue;
  const tk = `EL-2${role === "dev" ? 0 : role === "pm" ? 1 : 2}`;
  const rr = node(
    path.join(plugin, "scripts/state/aisdlc-state.js"),
    ["init", tk, type],
    B,
    { CLAUDE_PLUGIN_ROOT: plugin },
  );
  t(`${role}: state init works in the shared repo`, rr.status, 0);
  t(
    `${role}: writes task.${role}.yaml, not task.yaml`,
    [
      fs.existsSync(path.join(B, "tasks", tk, `task.${role}.yaml`)),
      fs.existsSync(path.join(B, "tasks", tk, "task.yaml")),
    ],
    [true, false],
  );
  t(
    `${role}: execution log has the role suffix`,
    fs.existsSync(path.join(B, "tasks", tk, `execution-log.${role}.jsonl`)),
    true,
  );
}
d = json(flowJs(B, ["derive", "EL-20"])).tickets[0];
t(
  "flow reads the dev plugin's state file",
  d.roles.find((x) => x.role === "dev").state,
  "CREATED",
);

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
