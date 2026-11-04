#!/usr/bin/env node
// Acceptance tests for scripts/lib/real-systems.js: config validation, and matching real command lines against
// configured patterns (glob on the whole simple command, optional repo scoping, wrappers, substitutions).
const path = require("path");
const lib = require("../lib/real-systems.js");

let fail = 0;
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (got ${g}, want ${w})`}`);
};
const hit = (cmd, rules, opts) => lib.check(cmd, rules, opts).map((h) => h.rule.reason);

// --- validate() ---------------------------------------------------------------------------------------------------
t("validate: undefined is fine (no rules configured)", lib.validate(undefined), []);
t("validate: a list of good rules passes", lib.validate([{ command: "npm run seed*", reason: "writes to the real db" }]), []);
t("validate: not a list", lib.validate({ command: "x" }), ["real_systems must be a list"]);
t("validate: missing command", lib.validate([{ reason: "x" }]), ['real_systems[0] needs a "command" pattern']);
t("validate: missing reason", lib.validate([{ command: "x" }]), ['real_systems[0] needs a "reason"']);
t("validate: repo must be a string", lib.validate([{ command: "x", reason: "y", repo: 1 }]), ["real_systems[0].repo must be a repository name"]);

// --- matching ------------------------------------------------------------------------------------------------------
const RULES = [
  { command: "npm run seed*", reason: "Seeds write to the database the configured secret points at." },
  { command: "node *invoke?lambda.js*", reason: "Runs this repo's Lambda handler against real AWS." },
  { command: "npm start", repo: "payments-api", reason: "Starts against the real queue.", },
];
t("a configured command matches", hit("npm run seed", RULES), [RULES[0].reason]);
t("the glob's * matches the rest of the line", hit("npm run seed:prod -- --force", RULES), [RULES[0].reason]);
t("a non-matching command is clean", hit("npm run build", RULES), []);
t("case/spacing: extra internal spaces in the command do not defeat the match", hit("npm   run   seed", RULES), [RULES[0].reason]);
t("a Windows-style program name is normalized to its bare name", hit("npm.cmd run seed", RULES), [RULES[0].reason]);
t("a program given by absolute path is normalized to its bare name", hit("/usr/local/bin/npm run seed", RULES), [RULES[0].reason]);
t("a leading VAR=value assignment is stripped before matching", hit("NODE_ENV=production npm run seed", RULES), [RULES[0].reason]);
t("a wrapper (env) is stripped before matching", hit("env NODE_ENV=production npm run seed", RULES), [RULES[0].reason]);
t("sudo is stripped before matching", hit("sudo npm run seed", RULES), [RULES[0].reason]);
t("redirections are not part of the matched command", hit("npm run seed > out.txt 2>&1", RULES), [RULES[0].reason]);
t("a '?' glob matches exactly one character", hit("node invoke-lambda.js --event foo.json", RULES), [RULES[1].reason]);
t("a '?' glob does not match zero characters", hit("node invokelambda.js", RULES), []);
t("several real-system commands chained with && are all reported", hit("npm run build && npm run seed", RULES), [RULES[0].reason]);
t("a command inside bash -c is matched", hit('bash -c "npm run seed"', RULES), [RULES[0].reason]);
t("a command inside a $() substitution is matched", hit("echo $(npm run seed)", RULES), [RULES[0].reason]);
t("a command inside backticks is matched", hit("echo `npm run seed`", RULES), [RULES[0].reason]);
t("deep nesting is bounded (no runaway recursion)", lib.check("echo $(echo $(echo $(echo $(npm run seed))))", RULES).length, 0);

// repo scoping: the rule applies only inside that repository, detected via cwd and any `cd` before the command
const repoOf = (dir) => (path.resolve(dir) === path.resolve("/work/payments-api") ? "payments-api" : path.resolve(dir) === path.resolve("/work/other") ? "other" : null);
t("a repo-scoped rule matches when cwd is that repo", hit("npm start", RULES, { cwd: "/work/payments-api", repoOf }), [RULES[2].reason]);
t("a repo-scoped rule does not match a different repo", hit("npm start", RULES, { cwd: "/work/other", repoOf }), []);
t("a repo-scoped rule does not match outside any registered repo", hit("npm start", RULES, { cwd: "/work/unregistered", repoOf }), []);
t("a 'cd' before the command moves the scope for that chain", hit("cd /work/payments-api && npm start", RULES, { cwd: "/work/other", repoOf }), [RULES[2].reason]);
t("a relative 'cd' resolves against the current cwd", hit("cd payments-api && npm start", RULES, { cwd: "/work", repoOf }), [RULES[2].reason]);
t("'cd' only affects commands chained after it, not a prior one", hit("npm start && cd payments-api", RULES, { cwd: "/work/other", repoOf }), []);

// PowerShell: backslashes are paths, not escapes
t("PowerShell mode: a Windows path with backslashes is not escape-mangled", lib.simpleCommands("node C:\\scripts\\invoke-lambda.js", { posix: false }), [["node", "C:\\scripts\\invoke-lambda.js"]]);


// --- the hooks: a matched command asks (exit 0 + PreToolUse "ask"), it never blocks; blocks still win -------------------------
const fs = require("fs"), os = require("os");
const { spawnSync, execSync } = require("child_process");
const SRC = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(SRC, "..", "..");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-realsys-"));
for (const d of ["hooks", "scripts/lib", "config", "tasks", "logs"]) fs.mkdirSync(path.join(W, d), { recursive: true });
for (const f of ["hooks/pre-tool-policy.js", "scripts/lib/repo-paths.js", "scripts/lib/root.js", "scripts/lib/yaml.js", "scripts/lib/env-branches.js", "scripts/lib/real-systems.js"])
  fs.copyFileSync(path.join(SRC, f), path.join(W, f));
fs.copyFileSync(path.join(SRC, "config", "task-types.yaml"), path.join(W, "config", "task-types.yaml"));
const repoDir = path.join(W, "..", path.basename(W) + "-payments");
fs.mkdirSync(repoDir, { recursive: true });
const otherDir = path.join(W, "..", path.basename(W) + "-other");
fs.mkdirSync(otherDir, { recursive: true });
fs.writeFileSync(path.join(W, "config/repositories.yaml"), JSON.stringify({ repositories: { payments: { path: repoDir, base_branch: "main" } } }));
const setConfig = (real_systems) => fs.writeFileSync(path.join(W, "config/workspace.yaml"), JSON.stringify({ workspace: { name: "t" }, git: { base_branch: "main" }, ...(real_systems === undefined ? {} : { real_systems }) }));
const baseEnv = { ...process.env, AISDLC_ROOT: W };
const runHook = (hookFile, ev, extraEnv = {}) => spawnSync("node", [hookFile], { env: { ...baseEnv, ...extraEnv }, input: JSON.stringify(ev), encoding: "utf8" });
const claude = (ev) => runHook(path.join(W, "hooks/pre-tool-policy.js"), ev);
const bash = (command, cwd = W) => claude({ tool_name: "Bash", tool_input: { command }, cwd });
const decision = (r) => { try { return JSON.parse(r.stdout).hookSpecificOutput; } catch { return null; } };

setConfig([
  { command: "npm run seed*", reason: "Seeds write to the real database." },
  { command: "npm start", repo: "payments", reason: "Starts against the real queue." },
  { command: "node *invoke?lambda.js*", reason: "Invokes the Lambda against real AWS." },
]);
let r = bash("npm run seed:prod");
t("hook: a matched command asks, exit 0", r.status, 0);
t("hook: the ask decision has the PreToolUse shape", decision(r) && decision(r).hookEventName === "PreToolUse" && decision(r).permissionDecision === "ask", true);
t("hook: the ask shows the rule's reason and which rule matched", /Seeds write to the real database/.test(decision(r).permissionDecisionReason) && /npm run seed\*/.test(decision(r).permissionDecisionReason), true);
r = bash("npm run build");
t("hook: a command that matches nothing is allowed silently", r.status === 0 && r.stdout.trim() === "", true);
t("hook: a repo-scoped rule asks inside that repo", decision(bash("npm start", repoDir)) && decision(bash("npm start", repoDir)).permissionDecision, "ask");
t("hook: a repo-scoped rule stays quiet elsewhere", bash("npm start", otherDir).stdout.trim(), "");
t("hook: a 'cd' into the repo in the command moves the scope", decision(bash(`cd ${repoDir} && npm start`, otherDir)) && decision(bash(`cd ${repoDir} && npm start`, otherDir)).permissionDecision, "ask");
r = claude({ tool_name: "PowerShell", tool_input: { command: "node C:\\scripts\\invoke-lambda.js --event e.json" }, cwd: W });
t("hook: PowerShell commands are matched too (backslash paths intact)", decision(r) && decision(r).permissionDecision, "ask");
r = bash("git push --force origin main");
t("hook: a blocked command is still blocked", r.status, 2);
setConfig([{ command: "git push*", reason: "pushes" }]);
r = bash("git push --force origin main");
t("hook: a command that is both blocked and matched is blocked, not merely asked about", r.status === 2 && r.stdout.trim() === "", true);
r = claude({ tool_name: "Write", tool_input: { file_path: path.join(W, "notes.txt") }, cwd: W });
t("hook: non-shell tools never ask", r.stdout.trim(), "");

setConfig([{ command: "npm run seed*" }]); // no reason
r = bash("ls");
t("hook: an invalid list asks about every command instead of silently switching the rule off", decision(r) && decision(r).permissionDecision === "ask" && /invalid/.test(decision(r).permissionDecisionReason), true);
setConfig({ command: "npm run seed*", reason: "x" }); // not a list
t("hook: a non-list value is invalid too", decision(bash("ls")) && /must be a list/.test(decision(bash("ls")).permissionDecisionReason), true);
setConfig(undefined);
t("hook: no real_systems configured: nothing asked", bash("npm run seed").stdout.trim(), "");
setConfig([]);
t("hook: an empty list: nothing asked", bash("npm run seed").stdout.trim(), "");

// the Kiro mirror: same decision, its own tool name (execute_pwsh)
setConfig([{ command: "npm run seed*", reason: "Seeds write to the real database." }]);
const kiro = runHook(path.join(REPO_ROOT, "kiro/hooks/dev-pre-tool-policy.js"), { tool_name: "execute_pwsh", tool_input: { command: "npm run seed" }, cwd: W }, { AI_SDLC_PLUGIN_HOME: REPO_ROOT });
t("kiro hook: a matched command asks, exit 0", kiro.status === 0 && decision(kiro) && decision(kiro).permissionDecision === "ask", true);
t("kiro hook: a non-matching command is silent", runHook(path.join(REPO_ROOT, "kiro/hooks/dev-pre-tool-policy.js"), { tool_name: "execute_pwsh", tool_input: { command: "npm test" }, cwd: W }, { AI_SDLC_PLUGIN_HOME: REPO_ROOT }).stdout.trim(), "");
fs.rmSync(W, { recursive: true, force: true }); fs.rmSync(repoDir, { recursive: true, force: true }); fs.rmSync(otherDir, { recursive: true, force: true });

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
