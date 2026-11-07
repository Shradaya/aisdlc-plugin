#!/usr/bin/env node
// Deterministic tests for the aisdlc plugin: init, hand-off/return flow, git push/pull between two clones, the commit
// hook, and role plugins keeping per-role state files in a shared repo. No model needed.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync, execSync } = require("child_process");

const PLUGINS = path.resolve(__dirname, "..", "..", "..");
const AISDLC = path.join(PLUGINS, "aisdlc");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-shared-"));
let fail = 0;
const t = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`); };

const node = (script, args, cwd, extraEnv = {}) => spawnSync("node", [script, ...args], { cwd, encoding: "utf8", env: { ...process.env, AISDLC_ROOT: cwd, CLAUDE_PLUGIN_ROOT: path.dirname(path.dirname(script.includes(`${path.sep}scripts${path.sep}`) ? script : script)), ...extraEnv } });
const flowJs = (cwd, args, env) => node(path.join(AISDLC, "scripts/flow/flow.js"), args, cwd, { CLAUDE_PLUGIN_ROOT: AISDLC, ...env });
const gitJs = (cwd, args, env) => node(path.join(AISDLC, "scripts/git/aisdlc-git.js"), args, cwd, { CLAUDE_PLUGIN_ROOT: AISDLC, ...env });
const json = (r) => { try { return JSON.parse(r.stdout); } catch { return { raw: r.stdout, err: r.stderr }; } };
const g = (cwd, c) => execSync("git " + c, { cwd, stdio: "pipe", encoding: "utf8" });
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const state = (cwd, T, role, status, approvals = {}) => writeJson(path.join(cwd, "tasks", T, `task.${role}.yaml`), { task: { id: T, type: role, status }, approvals });

// ---- init -------------------------------------------------------------------------------------------------------
const seed = path.join(tmp, "seed");
fs.mkdirSync(seed);
const init = node(path.join(AISDLC, "scripts/init/aisdlc-init.js"), [seed, "--role", "pm"], tmp, { AISDLC_ROOT: "" });
t("init exits 0", init.status, 0);
const ws = fs.readFileSync(path.join(seed, "config/workspace.yaml"), "utf8");
t("workspace kind is aisdlc", /"kind":\s*"aisdlc"/.test(ws), true);
t("role recorded locally", fs.readFileSync(path.join(seed, ".aisdlc/role"), "utf8").trim(), "pm");
const gi = fs.readFileSync(path.join(seed, ".gitignore"), "utf8");
t("tasks/ is not ignored", /^tasks\/\*$/m.test(gi), false);
t("QA tests are ignored", /^tests\/$/m.test(gi), true);
// workspace.yaml must keep what dev, pm and qa read
const wsJson = JSON.parse(ws.replace(/^\s*#.*$/gm, ""));
t("workspace has dev keys", ["task_root", "repository_root", "system_root", "audit_log"].every((k) => k in wsJson.workspace), true);
t("workspace has git block", !!(wsJson.git && wsJson.git.commit_format), true);
const integ = JSON.parse(fs.readFileSync(path.join(seed, "config/integrations.yaml"), "utf8").replace(/^\s*#.*$/gm, ""));
t("integrations cover pm and qa write switches", ["update_description", "add_attachment", "add_comment"].every((k) => k in integ.jira.write), true);

// ---- two clones of a bare remote ----------------------------------------------------------------------------------
const remote = path.join(tmp, "remote.git");
execSync(`git init -q --bare -b main "${remote}"`);
g(seed, "init -q -b main");
for (const [k, v] of [["user.email", "a@x.io"], ["user.name", "A"]]) g(seed, `config ${k} ${v}`);
g(seed, "add -A -- config tasks designs system repositories CLAUDE.md .gitignore");
g(seed, 'commit -q -m "EL-0: Scaffold shared repo"');
g(seed, `remote add origin "${remote}"`);
g(seed, "push -q -u origin main");
const clone = (name, role) => {
  const d = path.join(tmp, name);
  execSync(`git clone -q "${remote}" "${d}"`);
  for (const [k, v] of [["user.email", `${name}@x.io`], ["user.name", name]]) g(d, `config ${k} ${v}`);
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
state(A, T, "pm", "ACCEPTANCE_CRITERIA_DEFINED", { acceptance_criteria: { status: "pending" } });
t("hand-off blocked until the gate is approved", flowJs(A, ["handoff", T, "dev"]).status, 2);
state(A, T, "pm", "ACCEPTANCE_CRITERIA_DEFINED", { acceptance_criteria: { status: "approved" } });
r = flowJs(A, ["handoff", T, "dev", "--note", "ACs approved"]);
t("hand-off pm to dev ok", r.status, 0);
t("hand-off to your own role refused", flowJs(A, ["handoff", T, "pm"]).status, 2);
t("unknown role refused", flowJs(A, ["handoff", T, "sales"]).status, 2);
let d = json(flowJs(A, ["derive", T])).tickets[0];
const byRole = (dd) => Object.fromEntries(dd.roles.map((x) => [x.role, x.status]));
t("pm done, dev active, design not needed (never started, dev is active)", byRole(d), { pm: "done", design: "not needed", dev: "active", qa: "waiting" });
state(A, T, "dev", "IMPLEMENTING");
d = json(flowJs(A, ["derive", T])).tickets[0];
t("qa still waiting", byRole(d).qa, "waiting");
t("dev step is Implement", d.roles.find((x) => x.role === "dev").steps[d.roles.find((x) => x.role === "dev").step], "Implement");

t("return needs a reason", flowJs(A, ["return", T, "pm", "--from", "dev"]).status, 2);
r = flowJs(A, ["return", T, "pm", "--from", "dev", "--reason", "AC 3 is ambiguous"]);
t("dev returns to pm", r.status, 0);
const changes = fs.readFileSync(path.join(A, "tasks", T, "changes.md"), "utf8");
t("changes.md lists the open item", /\| 1 \| dev \| pm \| AC 3 is ambiguous \| open \|/.test(changes), true);
d = json(flowJs(A, ["derive", T])).tickets[0];
t("pm shows changes requested", byRole(d).pm, "changes requested");
r = flowJs(A, ["handoff", T, "dev"]);
t("hand-off blocked while a change request is open", r.status, 2);
r = flowJs(A, ["handoff", T, "dev", "--resolve", "all", "--note", "AC 3 clarified"]);
t("hand-off with --resolve all passes", r.status, 0);
d = json(flowJs(A, ["derive", T])).tickets[0];
t("pm done again, nothing open", [byRole(d).pm, d.roles[0].open.length], ["done", 0]);
t("changes.md shows it resolved", /resolved by pm/.test(fs.readFileSync(path.join(A, "tasks", T, "changes.md"), "utf8")), true);

// design is derived from the folder
fs.mkdirSync(path.join(A, "designs", T), { recursive: true });
fs.writeFileSync(path.join(A, "designs", T, "home.dc.html"), "<title>home</title>");
d = json(flowJs(A, ["derive", T])).tickets[0];
t("design is active once designs/<T>/ has a page", byRole(d).design, "active");
t("design can hand off with a page", flowJs(A, ["handoff", T, "dev", "--from", "design"]).status, 0);

// ---- git: status, commit, push, pull ---------------------------------------------------------------------------------
fs.writeFileSync(path.join(A, "tasks", T, "requirements.md"), "- req\n");
fs.mkdirSync(path.join(A, "tests"), { recursive: true });
fs.writeFileSync(path.join(A, "tests", "x.spec.ts"), "// local only");
const st = json(gitJs(A, ["status"]));
t("status lists workflow files, not tests", st.files.some((f) => f.file.startsWith("tests/")), false);
t("status names the ticket", st.tickets, [T]);
t("commit with a bad message refused", gitJs(A, ["commit", "--message", "added stuff"]).status, 2);
t("commit naming another ticket refused", gitJs(A, ["commit", "--message", "EL-999: x"]).status, 2);
t("commit ok", gitJs(A, ["commit", "--message", `${T}: Requirements, hand-offs and design`]).status, 0);
t("tests/ is not tracked", g(A, "ls-files tests").trim(), "");
t("push ok", gitJs(A, ["push"]).status, 0);
r = gitJs(B, ["pull", "--role", "dev"]);
t("pull ok", json(r).ok, true);
t("pull shows dev is active on the ticket", json(r).waiting.some((l) => l.startsWith(`${T}: Dev`)), true);
t("events arrived in the other clone", fs.readdirSync(path.join(B, "tasks", T, "handoffs")).length >= 4, true);

// two roles write events at the same time: different files, so the rebase has nothing to conflict on
flowJs(A, ["return", T, "pm", "--from", "dev", "--reason", "from A"]);
flowJs(B, ["return", T, "design", "--from", "dev", "--reason", "from B"]);
t("A commits", gitJs(A, ["commit", "--message", `${T}: A return`]).status, 0);
t("B commits", gitJs(B, ["commit", "--message", `${T}: B return`]).status, 0);
t("A pushes", gitJs(A, ["push"]).status, 0);
t("B's push pulls first, so being behind is fine", gitJs(B, ["push"]).status, 0);
t("changes.md is not committed", g(B, "ls-files tasks/EL-101/changes.md").trim(), "");
t("pull regenerates changes.md locally", (gitJs(B, ["pull"]), fs.existsSync(path.join(B, "tasks", T, "changes.md"))), true);
t("both returns survive the rebase", fs.readdirSync(path.join(B, "tasks", T, "handoffs")).filter((n) => n.endsWith("-return.json")).length, 3);
t("A sees B's push after a pull", (gitJs(A, ["pull"]), fs.readdirSync(path.join(A, "tasks", T, "handoffs")).filter((n) => n.endsWith("-return.json")).length), 3);

// push and pull set uncommitted workflow files aside and put them back
fs.writeFileSync(path.join(B, "tasks", T, "requirements.md"), "- req\n- B local edit\n");
fs.writeFileSync(path.join(A, "tasks", T, "extra.md"), "- from A\n");
t("A commits extra", gitJs(A, ["commit", "--message", `${T}: Extra notes`]).status, 0);
t("A pushes extra", gitJs(A, ["push"]).status, 0);
r = gitJs(B, ["pull"]);
t("pull works with uncommitted workflow changes", json(r).ok, true);
t("uncommitted edit is still there", fs.readFileSync(path.join(B, "tasks", T, "requirements.md"), "utf8").includes("B local edit"), true);
t("and the new file arrived", fs.existsSync(path.join(B, "tasks", T, "extra.md")), true);
g(B, "checkout -- tasks");

// merge conflict: the same line edited on both sides. aisdlc stops and leaves it to the person.
fs.writeFileSync(path.join(A, "tasks", T, "requirements.md"), "- req\n- A says one thing\n");
t("A commits the edit", gitJs(A, ["commit", "--message", `${T}: A edit`]).status, 0);
t("A pushes the edit", gitJs(A, ["push"]).status, 0);
fs.writeFileSync(path.join(B, "tasks", T, "requirements.md"), "- req\n- B says another\n");
t("B commits the edit", gitJs(B, ["commit", "--message", `${T}: B edit`]).status, 0);
r = gitJs(B, ["push"]);
t("push stops on a conflict", [r.status, json(r).conflict], [2, true]);
t("the message tells the person to resolve it by hand", /git rebase --continue/.test(json(r).error || ""), true);
t("the rebase is left in progress, not aborted", fs.existsSync(path.join(B, ".git", "rebase-merge")) || fs.existsSync(path.join(B, ".git", "rebase-apply")), true);
t("the conflicted file holds both sides for the person", /<<<<<<<|>>>>>>>/.test(fs.readFileSync(path.join(B, "tasks", T, "requirements.md"), "utf8")), true);
r = gitJs(B, ["pull"]);
t("pull refuses while the conflict is open", [r.status, json(r).conflict], [2, true]);
t("push refuses while the conflict is open", gitJs(B, ["push"]).status, 2);
// the person resolves it
fs.writeFileSync(path.join(B, "tasks", T, "requirements.md"), "- req\n- A and B agreed\n");
g(B, "add tasks");
execSync("git -c core.editor=true rebase --continue", { cwd: B, stdio: "pipe" });
t("after the person resolves it, push works", gitJs(B, ["push"]).status, 0);
t("first push to a branch the remote does not have yet", (g(B, "checkout -q -b scratch"), gitJs(B, ["push"]).status), 0);
g(B, "checkout -q main");

// ---- hook -------------------------------------------------------------------------------------------------------------
const hook = (cwd, ev) => spawnSync("node", [path.join(AISDLC, "hooks/pre-tool-policy.js")], { cwd, env: { ...process.env, AISDLC_ROOT: cwd }, input: JSON.stringify({ cwd, ...ev }), encoding: "utf8" }).status;
const bash = (cwd, command) => hook(cwd, { tool_name: "Bash", tool_input: { command } });
const write = (cwd, f) => hook(cwd, { tool_name: "Write", tool_input: { file_path: path.join(cwd, f) } });
fs.writeFileSync(path.join(A, "tasks", T, "notes.md"), "note");
g(A, "add tasks");
t("hook: valid root commit allowed", bash(A, `git commit -m "${T}: Add notes"`), 0);
t("hook: message without ticket blocked", bash(A, `git commit -m "add notes"`), 2);
t("hook: commit -a blocked", bash(A, `git commit -a -m "${T}: x"`), 2);
g(A, "reset -q");
fs.writeFileSync(path.join(A, "package.json"), "{}");
g(A, "add -f package.json");
t("hook: staging outside the workflow folders blocked", bash(A, `git commit -m "${T}: x"`), 2);
g(A, "reset -q package.json");
t("hook: git add tests blocked", bash(A, "git add tests"), 2);
t("hook: force push blocked", bash(A, "git push --force origin main"), 2);
t("hook: hand-off event files cannot be edited directly", write(A, `tasks/${T}/handoffs/x.json`), 2);
t("hook: changes.md cannot be edited directly", write(A, `tasks/${T}/changes.md`), 2);
t("hook: ordinary task documents can be written", write(A, `tasks/${T}/requirements.md`), 0);

// ---- role plugins keep per-role state files in a shared repo ----------------------------------------------------------
for (const [role, type] of [["dev", "feature"], ["pm", "pm"], ["qa", "qa"]]) {
  const plugin = path.join(PLUGINS, `aisdlc-${role}`);
  if (!fs.existsSync(plugin)) continue;
  const tk = `EL-2${role === "dev" ? 0 : role === "pm" ? 1 : 2}`;
  const rr = node(path.join(plugin, "scripts/state/aisdlc-state.js"), ["init", tk, type], B, { CLAUDE_PLUGIN_ROOT: plugin });
  t(`${role}: state init works in the shared repo`, rr.status, 0);
  t(`${role}: writes task.${role}.yaml, not task.yaml`, [fs.existsSync(path.join(B, "tasks", tk, `task.${role}.yaml`)), fs.existsSync(path.join(B, "tasks", tk, "task.yaml"))], [true, false]);
  t(`${role}: execution log has the role suffix`, fs.existsSync(path.join(B, "tasks", tk, `execution-log.${role}.jsonl`)), true);
}
d = json(flowJs(B, ["derive", "EL-20"])).tickets[0];
t("flow reads the dev plugin's state file", d.roles.find((x) => x.role === "dev").state, "CREATED");

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
