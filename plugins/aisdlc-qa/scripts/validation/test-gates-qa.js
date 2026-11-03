#!/usr/bin/env node
// Deterministic acceptance tests for the QA lifecycle gates. No model, no network, no browser needed.
// Mirrors test-gates-design.js: a temporary QA workspace, the plugin's hook and state engine, and the QA scripts.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync, execSync } = require("child_process");
const SRC = path.resolve(__dirname, "..", "..");
const REPO = path.resolve(SRC, "..", "..");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-qa-test-"));
for (const d of ["hooks", "scripts/state", "scripts/lib", "scripts/qa", "config", "tasks", "logs", "tests", "specs"]) fs.mkdirSync(path.join(W, d), { recursive: true });
for (const f of ["hooks/pre-tool-policy.js", "scripts/state/aisdlc-state.js", "scripts/lib/repo-paths.js", "scripts/lib/root.js", "scripts/lib/yaml.js", "scripts/qa/env.js"])
  fs.copyFileSync(path.join(SRC, f), path.join(W, f));
for (const f of ["task-types.yaml", "qa-policy.yaml"]) fs.copyFileSync(path.join(SRC, "config", f), path.join(W, "config", f));
const json = (f, o) => fs.writeFileSync(path.join(W, f), JSON.stringify(o, null, 2));
json("config/repositories.yaml", { repositories: {} });
json("config/workspace.yaml", { workspace: { kind: "qa" } });
json("config/environments.yaml", {
  default: "qa",
  environments: {
    qa: { base_url: "https://qa.example.test", allow_automation: true, login: { mode: "none" } },
    uat: { base_url: "https://uat.example.test", allow_automation: false },
    prod: { base_url: "https://app.prod.example.test", allow_automation: true },
    portal: { base_url: "https://portal.example.org", allow_automation: true },
  },
  blocked_hosts: ["example.org"],
});
json("config/integrations.yaml", { jira: { base_url: "https://example.atlassian.net", write: { add_comment: false, add_attachment: false } } });

const env = { ...process.env, AISDLC_ROOT: W };
for (const k of ["JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_URL", "QA_ENV"]) delete env[k];
const node = (file, args, extraEnv = {}) => spawnSync("node", [file, ...args], { env: { ...env, ...extraEnv }, encoding: "utf8" });
const state = (...a) => node(path.join(W, "scripts/state/aisdlc-state.js"), a);
const runHook = (hookFile, ev) => { const r = spawnSync("node", [hookFile], { env, input: JSON.stringify(ev), encoding: "utf8" }); if (process.env.V) console.log("   ", (r.stderr || "").trim().split("\n").join(" ")); return r.status; };
const hook = (ev) => runHook(path.join(W, "hooks/pre-tool-policy.js"), ev);
let fail = 0;
const t = (name, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} (got ${got}, want ${want})`); };
const write = (f, content = "") => hook({ tool_name: "Write", tool_input: { file_path: f, content }, cwd: W });
const bash = (c, cwd = W) => hook({ tool_name: "Bash", tool_input: { command: c }, cwd });
const T = "QA-1";
const testFile = path.join(W, `tests/${T}/s1-valid-sign-in.spec.ts`);
const helperFile = path.join(W, `tests/${T}/helpers.ts`);
const specFile = path.join(W, `tasks/${T}/spec.md`);
const tagged = `// spec: tasks/${T}/spec.md
test('x', { tag: ['@${T}', '@${T}-S1'] }, async () => {});`;
const put = (rel, text) => fs.writeFileSync(path.join(W, rel), text);
const edit = (f, s) => hook({ tool_name: "Edit", tool_input: { file_path: f, old_string: "a", new_string: s }, cwd: W });

// --- scenario gate and the per-ticket layout ---------------------------------------------------------------------
t("no task: test write blocked", write(testFile, tagged), 2);
state("init", T, "qa");
for (const s of ["TICKET_READY", "ENVIRONMENT_READY", "SCENARIOS_DRAFTED"]) state("transition", T, s);
t("test write before scenario approval blocked", write(testFile, tagged), 2);
t("untagged test write before approval blocked", write(testFile, "test('x', async () => {})"), 2);
t("helpers.ts before approval blocked", write(helperFile, "export const x = 1;"), 2);
t("tasks/<T>/spec.md before approval blocked", write(specFile, "x"), 2);
t("planner saving a plan into specs/ blocked",
  hook({ tool_name: "mcp__playwright-test__planner_save_plan", tool_input: { name: "Plan", fileName: "specs/login.plan.md" }, cwd: W }), 2);
t("scenarios.md (task artifact) write allowed", write(path.join(W, `tasks/${T}/scenarios.md`)), 0);
t("jira.md (task artifact) write allowed", write(path.join(W, `tasks/${T}/jira.md`)), 0);
t("seed/setup files are not gated", write(path.join(W, "tests/seed.spec.ts")), 0);
t("direct task.yaml edit blocked", write(path.join(W, `tasks/${T}/task.yaml`)), 2);
t("git check-ignore on task.yaml allowed (read-only)", bash(`git check-ignore -v tasks/${T}/task.yaml 2>&1`), 0);
t("Get-Content task.yaml allowed (read-only)", bash(`Get-Content tasks/${T}/task.yaml | Select-Object -First 5`), 0);
t("ls with a redirect of stderr allowed", bash(`ls tasks/${T}/task.yaml 2>$null`), 0);
t("redirect into task.yaml blocked", bash(`echo {} > tasks/${T}/task.yaml`), 2);
t("sed -i on task.yaml blocked", bash(`sed -i s/a/b/ tasks/${T}/task.yaml`), 2);
t("Set-Content task.yaml blocked", bash(`Set-Content tasks/${T}/task.yaml x`), 2);
t("rm task.yaml blocked", bash(`rm tasks/${T}/task.yaml`), 2);
const SCEN = "# QA-1\n### S1 - Valid sign-in\n### S2 - Wrong password\n";
put(`tasks/${T}/scenarios.md`, SCEN);
state("transition", T, "AWAITING_SCENARIO_APPROVAL");
t("SCENARIOS_APPROVED without approval refused", state("transition", T, "SCENARIOS_APPROVED").status, 2);
t("skip to TESTS_GENERATED refused", state("transition", T, "TESTS_GENERATED").status, 2);
t("unknown gate refused", state("approve", T, "design").status, 2);
t("approve scenarios", state("approve", T, "scenarios").status, 0);
t("SCENARIOS_APPROVED after approval", state("transition", T, "SCENARIOS_APPROVED").status, 0);
t("test in tests/<T>/ allowed after approval", write(testFile, tagged), 0);
t("helpers.ts (no tags) allowed under the same gate", write(helperFile, "export const x = 1;"), 0);
t("spec.md equal to the approved scenarios allowed", write(specFile, SCEN), 0);
t("spec.md equal up to line endings allowed", write(specFile, SCEN.replace(/\n/g, "\r\n")), 0);
t("spec.md with other content blocked", write(specFile, SCEN + "extra\n"), 2);
t("editing spec.md in place blocked", edit(specFile, "x"), 2);
t("cp scenarios.md over spec.md allowed", bash(`cp tasks/${T}/scenarios.md tasks/${T}/spec.md`), 0);
t("Copy-Item scenarios.md over spec.md allowed", bash(`Copy-Item tasks/${T}/scenarios.md tasks/${T}/spec.md`), 0);
t("other shell write to spec.md blocked", bash(`echo x > tasks/${T}/spec.md`), 2);
t("a test naming another ticket in tests/<T>/ blocked", write(testFile, "test('x', { tag: ['@QA-77', '@QA-77-S1'] }, async () => {})"), 2);
t("an edit adding another ticket's tag blocked", edit(testFile, "{ tag: ['@QA-77-S2'] }"), 2);
t("tests/ folder of a ticket without a task blocked", write(path.join(W, "tests/QA-77/s1-x.spec.ts"), "test('x', { tag: ['@QA-77'] }, async () => {})"), 2);
t("old-style tests/<feature-area>/ write blocked", write(path.join(W, "tests/login/x.spec.ts"), tagged), 2);
t("loose file directly under tests/ blocked", write(path.join(W, "tests/x.spec.ts"), tagged), 2);
t("specs/<T>.md write blocked (old layout)", write(path.join(W, `specs/${T}.md`), SCEN), 2);
t("generator MCP write into tests/<T>/ allowed",
  hook({ tool_name: "mcp__playwright-test__generator_write_test", tool_input: { fileName: `tests/${T}/s2-wrong-password.spec.ts`, code: tagged }, cwd: W }), 0);
t("generator MCP write into an old feature-area folder blocked",
  hook({ tool_name: "mcp__playwright-test__generator_write_test", tool_input: { fileName: "tests/login/wrong-password.spec.ts", code: tagged }, cwd: W }), 2);
t("shell cp into tests/<T>/ allowed", bash(`cp tmp.ts tests/${T}/helpers.ts`), 0);
t("shell mv into an old feature-area folder blocked", bash("mv tmp.ts tests/login/helpers.ts"), 2);
t("reading an old-layout test allowed", bash("cat tests/login/old.spec.ts"), 0);
put(`tasks/${T}/scenarios.md`, "# QA-1\n### S1 - Valid sign-in (edited)\n### S2 - Wrong password\n");
t("test write blocked after scenarios changed", write(testFile, tagged), 2);
t("helpers.ts blocked after scenarios changed", write(helperFile, "export const x = 2;"), 2);
t("spec refresh blocked until reapproval", bash(`cp tasks/${T}/scenarios.md tasks/${T}/spec.md`), 2);
t("generator MCP write blocked after scenarios changed",
  hook({ tool_name: "mcp__playwright-test__generator_write_test", tool_input: { fileName: `tests/${T}/s3-x.spec.ts`, code: tagged }, cwd: W }), 2);
t("shell write into tests/<T>/ blocked after scenarios changed", bash(`echo x > tests/${T}/y.spec.ts`), 2);
t("TESTS_GENERATED refused after scenarios changed", state("transition", T, "TESTS_GENERATED").status, 2);
state("approve", T, "scenarios");
t("spec refresh allowed after reapproval", bash(`cp tasks/${T}/scenarios.md tasks/${T}/spec.md`), 0);
t("test write allowed after reapproval", write(testFile, tagged), 0);
t("TESTS_GENERATED after reapproval", state("transition", T, "TESTS_GENERATED").status, 0);
t("TESTS_EXECUTED", state("transition", T, "TESTS_EXECUTED").status, 0);
t("heal loop TESTS_EXECUTED -> TESTS_GENERATED", state("transition", T, "TESTS_GENERATED").status, 0);
state("transition", T, "TESTS_EXECUTED");

// --- Jira writes ---------------------------------------------------------------------------------------------------
const JA = "node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-attach.js";
t("evidence attach before sign-off blocked", bash(`${JA} attach ${T} a.png`), 2);
t("results comment before sign-off blocked", bash(`${JA} comment ${T} c.txt`), 2);
t("dry-run attach allowed", bash(`${JA} attach ${T} a.png --dry-run`), 0);
t("defect comment allowed in TESTS_EXECUTED", bash(`${JA} defect ${T} d.txt a.png`), 0);
t("status read always allowed", bash(`${JA} status ${T}`), 0);
t("issue read always allowed", bash(`${JA} issue ${T} --comments`), 0);
t("defect_found transition allowed in TESTS_EXECUTED", bash(`${JA} transition ${T} defect_found`), 0);
t("verified transition before sign-off blocked", bash(`${JA} transition ${T} verified`), 2);
t("unknown transition key blocked", bash(`${JA} transition ${T} done`), 2);
t("ad-hoc HTTP to Jira blocked", bash(`curl -u x https://example.atlassian.net/rest/api/2/issue/${T}/comment`), 2);

// --- defects and sign-off --------------------------------------------------------------------------------------------
state("set", T, "defects.D1", JSON.stringify({ id: "D1", scenario: "S2", severity: "major", status: "open" }));
t("AWAITING_DEV_FIX", state("transition", T, "AWAITING_DEV_FIX").status, 0);
t("defect comment allowed in AWAITING_DEV_FIX", bash(`${JA} defect ${T} d.txt`), 0);
t("sign-off stage refused while a defect is open", state("transition", T, "AWAITING_RESULTS_SIGNOFF").status, 2);
t("re-verify AWAITING_DEV_FIX -> TESTS_EXECUTED", state("transition", T, "TESTS_EXECUTED").status, 0);
t("reply allowed after re-verify", bash(`${JA} reply ${T} 10001 f.txt`), 0);
state("set", T, "defects.D1.status", '"fixed"');
t("AWAITING_RESULTS_SIGNOFF once defects are fixed", state("transition", T, "AWAITING_RESULTS_SIGNOFF").status, 0);
t("defect comment refused at sign-off", bash(`${JA} defect ${T} d.txt`), 2);
t("defect_found transition refused at sign-off", bash(`${JA} transition ${T} defect_found`), 2);
t("RESULTS_SIGNED_OFF without sign-off refused", state("transition", T, "RESULTS_SIGNED_OFF").status, 2);
put(`tasks/${T}/results.md`, "# QA-1 results\nVerdict: PASS\n");
t("approve signoff", state("approve", T, "signoff").status, 0);
t("RESULTS_SIGNED_OFF", state("transition", T, "RESULTS_SIGNED_OFF").status, 0);
t("evidence attach allowed after sign-off", bash(`${JA} attach ${T} a.png`), 0);
t("verified transition allowed after sign-off", bash(`${JA} transition ${T} verified`), 0);
put(`tasks/${T}/results.md`, "# QA-1 results\nVerdict: PASS (edited)\n");
t("evidence attach blocked after results changed", bash(`${JA} attach ${T} a.png`), 2);
t("EVIDENCE_PUBLISHED refused after results changed", state("transition", T, "EVIDENCE_PUBLISHED").status, 2);
state("approve", T, "signoff");

// --- environments and credentials -----------------------------------------------------------------------------------
t("playwright test against default qa allowed", bash("npx playwright test --grep @QA-1"), 0);
t("playwright test against production-looking host blocked", bash("$env:QA_ENV='prod'; npx playwright test"), 2);
t("playwright test against blocked_hosts blocked", bash("QA_ENV=portal npx playwright test"), 2);
t("playwright test where automation is off blocked", bash("QA_ENV=uat npx playwright test"), 2);
t("codegen against production blocked", bash("npx playwright codegen https://app.prod.example.test/login"), 2);
t("printing QA_PASSWORD blocked", bash("echo $QA_PASSWORD"), 2);
t("printing a saved session blocked", bash("cat .auth/qa.json"), 2);
t("writing .auth/ blocked", write(path.join(W, ".auth/qa.json")), 2);
t("staging .auth/ blocked", bash("git add .auth/qa.json"), 2);

// --- commit policy ---------------------------------------------------------------------------------------------------
execSync("git init -q -b main && git config user.email t@t && git config user.name t", { cwd: W });
t("first commit of a new repository allowed", bash(`git commit -m "Set up QA workspace"`), 0);
execSync("git commit -q --allow-empty -m init", { cwd: W });
t("commit on main blocked", bash(`git commit -m "${T}: Add sign-in tests"`), 2);
execSync(`git checkout -q -b ${T}`, { cwd: W });
t("invalid commit message blocked", bash(`git commit -m "add tests"`), 2);
t("valid commit on ticket branch allowed", bash(`git commit -m "${T}: Add sign-in tests"`), 0);
t("force push blocked", bash(`git push --force origin ${T}`), 2);
state("init", "QA-2", "qa");
t("commit for a task not signed off blocked", bash(`git commit -m "QA-2: x"`, W), 2);

// --- workspace kinds: each plugin's hooks stay in their own workspace ------------------------------------------------------
const D = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-dev-ws-"));
fs.mkdirSync(path.join(D, "config"), { recursive: true });
fs.writeFileSync(path.join(D, "config/repositories.yaml"), JSON.stringify({ repositories: {} }));
const inWs = (hookFile, root, ev) => { const r = spawnSync("node", [hookFile], { env: { ...env, AISDLC_ROOT: root }, input: JSON.stringify(ev), encoding: "utf8" }); return r.status; };
const commitEv = (cwd) => ({ tool_name: "Bash", tool_input: { command: `git commit -m "nonsense"` }, cwd });
t("QA hook is a no-op in a workspace without kind qa", inWs(path.join(W, "hooks/pre-tool-policy.js"), D, { tool_name: "Write", tool_input: { file_path: path.join(D, "tests/a.spec.ts") }, cwd: D }), 0);
t("dev hook still enforces in a workspace without kind", inWs(path.join(REPO, "plugins/aisdlc-dev/hooks/pre-tool-policy.js"), D, commitEv(D)), 2);
t("dev hook is a no-op in a QA workspace", inWs(path.join(REPO, "plugins/aisdlc-dev/hooks/pre-tool-policy.js"), W, commitEv(W)), 0);
t("design hook is a no-op in a QA workspace", inWs(path.join(REPO, "plugins/aisdlc-design/hooks/pre-tool-policy.js"), W, commitEv(W)), 0);

// --- scripts: env-check, jira-attach, summarize-results, evidence-pack ------------------------------------------------------
const S = (rel) => path.join(SRC, "scripts", rel);
t("env-check default qa ok", node(S("qa/env-check.js"), []).status, 0);
t("env-check production refused", node(S("qa/env-check.js"), ["prod"]).status, 1);
t("env-check unknown environment = not configured", node(S("qa/env-check.js"), ["nope"]).status, 2);
const envFile = path.join(W, "config/environments.yaml");
fs.writeFileSync(envFile, "# header comment kept\n" + fs.readFileSync(envFile, "utf8"));
const addEnv = (...a) => node(S("qa/add-env.js"), a);
t("add-env adds an environment", addEnv("staging", "--base-url", "https://staging.example.test", "--login", "form", "--submit-name", "Log in").status, 0);
t("add-env keeps the header comment", fs.readFileSync(envFile, "utf8").startsWith("# header comment kept"), true);
t("added environment passes env-check", node(S("qa/env-check.js"), ["staging"]).status, 0);
t("add-env refuses an existing name without --force", addEnv("staging", "--base-url", "https://staging2.example.test").status, 1);
t("add-env --force updates it", addEnv("staging", "--base-url", "https://staging2.example.test", "--force").status, 0);
t("add-env keeps login settings on update", JSON.parse(fs.readFileSync(envFile, "utf8").replace(/^\s*#.*$/gm, "")).environments.staging.login.submit_name, "Log in");
t("add-env refuses a production-looking host", addEnv("live", "--base-url", "https://live.example.test").status, 1);
t("add-env refuses a blocked host", addEnv("portal2", "--base-url", "https://x.example.org").status, 1);
t("add-env refuses a bad name", addEnv("Staging", "--base-url", "https://s.example.test").status, 1);
const dryEnv = addEnv("dry", "--base-url", "https://dry.example.test", "--dry-run");
t("add-env --dry-run writes nothing", dryEnv.status === 0 && !fs.readFileSync(envFile, "utf8").includes("dry.example.test"), true);
t("add-env refuses a block that hits a configured environment", addEnv("--block-host", "staging2.example.test").status, 1);
const wide = addEnv("--block-host", "example.test");
t("add-env refuses a parent-domain block covering QA, suggesting =host", wide.status === 1 && /=example\.test/.test(wide.stdout), true);
t("add-env --block-host =host (exact) is accepted", addEnv("--block-host", "=example.test").status, 0);
t("an exact block leaves subdomain environments usable", node(S("qa/env-check.js"), ["qa"]).status, 0);
const envCfg = JSON.parse(fs.readFileSync(envFile, "utf8").replace(/^\s*#.*$/gm, ""));
envCfg.blocked_hosts.push("=staging2.example.test");
fs.writeFileSync(envFile, JSON.stringify(envCfg));
t("an exact block refuses that host", node(S("qa/env-check.js"), ["staging"]).status, 1);
t("add-env accepts login selectors",
  addEnv("sel", "--base-url", "https://sel.example.test", "--login", "form", "--username-selector", "#email", "--submit-selector", "button[type=submit]").status, 0);
t("selectors are stored", JSON.parse(fs.readFileSync(envFile, "utf8").replace(/^\s*#.*$/gm, "")).environments.sel.login.username_selector, "#email");
t("add-env refuses generated class-name selectors",
  addEnv("sel2", "--base-url", "https://sel2.example.test", "--login", "form", "--submit-selector", "button.MuiButton-root.css-1x2y3z").status, 1);

// --- credentials: set/missing from environment or .env, never values; JIRA_* environment-only ---------------------------
fs.writeFileSync(path.join(W, ".env"), "QA_USERNAME=qa.bot@example.test\nQA_PASSWORD='s3cret-value'\nJIRA_API_TOKEN=nope\n");
const creds = node(S("qa/cred-check.js"), ["QA_USERNAME", "QA_PASSWORD", "JIRA_API_TOKEN", "JIRA_EMAIL"]);
const cj = JSON.parse(creds.stdout);
t("cred-check finds QA credentials in .env", cj.QA_USERNAME + "|" + cj.QA_PASSWORD, "set (.env)|set (.env)");
t("cred-check ignores JIRA_* in .env (environment only)", cj.JIRA_API_TOKEN, "missing");
t("cred-check never prints values", /s3cret|qa\.bot/.test(creds.stdout), false);
t("cred-check sees environment variables", JSON.parse(node(S("qa/cred-check.js"), ["JIRA_EMAIL"], { JIRA_EMAIL: "x@example.test" }).stdout).JIRA_EMAIL, "set (environment)");

// --- .env and .auth/: no false positives, no reads --------------------------------------------------------------------
t("Test-Path .env is not secret extraction", bash("Test-Path .env; git check-ignore -v .env"), 0);
t("a command ending in .env is allowed", bash("ls -la .env"), 0);
t("env command blocked", bash("env"), 2);
t("env piped blocked", bash("env | sort"), 2);
t("printenv blocked", bash("printenv QA_PASSWORD"), 2);
t("Get-ChildItem env: blocked", bash("Get-ChildItem env:"), 2);
t("cat .env blocked", bash("cat .env"), 2);
t("Get-Content .env blocked", bash("Get-Content .env"), 2);
t("Select-String on .env.local blocked", bash("Select-String -Path .env.local -Pattern QA"), 2);
t("cat .env.example allowed", bash("cat .env.example"), 0);
t("Read tool on .env blocked", hook({ tool_name: "Read", tool_input: { file_path: path.join(W, ".env") }, cwd: W }), 2);
t("Read tool on .auth/ blocked", hook({ tool_name: "Read", tool_input: { file_path: path.join(W, ".auth/qa.json") }, cwd: W }), 2);
t("Grep on .env blocked", hook({ tool_name: "Grep", tool_input: { pattern: "QA", path: path.join(W, ".env") }, cwd: W }), 2);
t("Read tool on other files allowed", hook({ tool_name: "Read", tool_input: { file_path: path.join(W, "config/environments.yaml") }, cwd: W }), 0);
t("Write to .env blocked", write(path.join(W, ".env"), "X=1"), 2);
t("pw.js test against production blocked by the hook", bash("$env:QA_ENV='prod'; node pw.js test checks/a.spec.ts"), 2);

// --- ad-hoc checks: checks/ writable without a ticket; tests/<T>/ and tasks/<T>/spec.md still gated ---------------------------------
state("init", "QA-9", "qa");
t("checks/ write allowed without an approved task", write(path.join(W, "checks/login.spec.ts"), "test('login', async () => {})"), 0);
t("shell write into checks/ allowed", bash("echo x > checks/login.spec.ts"), 0);
t("tests/<T>/ write for an unapproved ticket still blocked", write(path.join(W, "tests/QA-9/s1-x.spec.ts"), "test('x', { tag: ['@QA-9'] }, async () => {})"), 2);
t("tasks/<T>/spec.md write for an unapproved ticket still blocked", write(path.join(W, "tasks/QA-9/spec.md"), "x"), 2);
t("jira-attach without credentials exits 2", node(S("jira/jira-attach.js"), ["status", T]).status, 2);
const dry = node(S("jira/jira-attach.js"), ["comment", T, path.join(W, `tasks/${T}/results.md`), "--dry-run"]);
t("jira-attach --dry-run needs no credentials", dry.status, 0);
t("jira-attach --dry-run prints JSON", /"dry_run":true/.test(dry.stdout), true);
t("jira-attach refuses when writes are disabled",
  node(S("jira/jira-attach.js"), ["comment", T, path.join(W, `tasks/${T}/results.md`)], { JIRA_EMAIL: "x@example.test", JIRA_API_TOKEN: "x" }).status, 1);
t("jira-attach issue without credentials exits 2", node(S("jira/jira-attach.js"), ["issue", T]).status, 2);
t("jira-attach issue --dry-run lists the reads", /rest\/api\/2\/issue\/QA-1\/comment/.test(node(S("jira/jira-attach.js"), ["issue", T, "--comments", "--dry-run"]).stdout), true);
t("jira-attach refuses an unconfigured transition", node(S("jira/jira-attach.js"), ["transition", T, "verified", "--dry-run"]).status, 1);

const run = path.join(W, `tasks/${T}/evidence/run-1`);
for (const d of ["report/data", `screenshots/${T}-S1`, `screenshots/${T}-S2`]) fs.mkdirSync(path.join(run, d), { recursive: true });
fs.writeFileSync(path.join(run, "report/index.html"), "<html>report</html>");
fs.writeFileSync(path.join(run, "report/data/trace.zip"), "trace");
const png = (rel) => { fs.writeFileSync(path.join(run, rel), Buffer.from("89504e47", "hex")); return path.join(run, rel); };
const s1 = [png(`screenshots/${T}-S1/01-open.png`), png(`screenshots/${T}-S1/02-sign-in.png`)];
const s2 = [png(`screenshots/${T}-S2/01-open.png`), png(`screenshots/${T}-S2/02-submit-FAILED.png`)];
const res = (title, tags, status, shots, error) => ({
  title, tags, tests: [{ projectName: "chromium", status, results: [{ status: status === "expected" ? "passed" : "failed", duration: 1000,
    ...(error ? { error: { message: error } } : {}), steps: [{ title: "1. Open", steps: [] }, { title: "2. Submit", ...(error ? { error: { message: error } } : {}), steps: [] }],
    attachments: shots.map((p) => ({ name: path.basename(p, ".png"), path: p, contentType: "image/png" })) }] }],
});
fs.writeFileSync(path.join(run, "results.json"), JSON.stringify({ suites: [{ file: "login/a.spec.ts", specs: [
  res(`${T} S1 Valid sign-in`, [`@${T}`, `@${T}-S1`, `@${T}-AC1`], "expected", s1),
  res(`${T} S2 Wrong password`, [`@${T}`, `@${T}-S2`, `@${T}-AC2`], "unexpected", s2, "\u001b[31mExpected: \"Wrong password\"\u001b[39m"),
] }], errors: [] }));
put(`tasks/${T}/scenarios.md`, "### S1 - a\n### S2 - b\n### S3 - c\n");
const sum = JSON.parse(node(S("qa/summarize-results.js"), [T, "1"]).stdout);
t("summary counts passed", sum.totals.passed, 1);
t("summary counts failed", sum.totals.failed, 1);
t("summary finds the failing step", sum.tests[1].failed_step, "2. Submit");
t("summary finds the failed screenshot", /02-submit-FAILED\.png$/.test(sum.tests[1].failed_screenshot), true);
t("summary strips ANSI from errors", /\u001b/.test(sum.tests[1].error), false);
t("summary lists uncovered scenarios", sum.uncovered_scenarios.join(","), "S3");
fs.writeFileSync(path.join(run, "run.json"), JSON.stringify({ only: ["S1", "S2"] }));
t("an --only run checks gaps among its selected scenarios only", JSON.parse(node(S("qa/summarize-results.js"), [T, "1"]).stdout).uncovered_scenarios.length, 0);
const pack = JSON.parse(node(S("qa/evidence-pack.js"), [T, "1"]).stdout);
t("evidence pack writes report, screenshots, finals and failed", pack.files.length, 5);
const zip = fs.readFileSync(path.join(W, pack.files.find((f) => f.endsWith("-report.zip"))));
t("report zip is a zip", zip.readUInt32LE(0), 0x04034b50);
t("report zip leaves out traces by default", zip.readUInt16LE(zip.length - 12), 1);
const defectPack = JSON.parse(node(S("qa/evidence-pack.js"), [T, "1", "--defect", "S2"]).stdout);
t("defect pack has the failing-step screenshot", defectPack.files.map((f) => path.basename(f)).join(), `${T}-run1-S2-failed.png`);
t("defect pack refuses a passing scenario", node(S("qa/evidence-pack.js"), [T, "1", "--defect", "S1"]).status, 1);

// --- init: fresh scaffold, settings merge, Jira settings from a sibling aisdlc-dev workspace -----------------------------
const P = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-qa-init-"));
const QA = path.join(P, "aisdlc-qa"), DEV = path.join(P, "aisdlc-dev");
for (const d of [QA, path.join(DEV, "config"), path.join(DEV, "repositories"), path.join(DEV, "system")]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(DEV, "config/repositories.yaml"), "{}");
fs.writeFileSync(path.join(DEV, "config/integrations.yaml"), JSON.stringify({ jira: { base_url: "", acceptance_criteria_field: "customfield_10050" } }));
fs.writeFileSync(path.join(DEV, "claude.env"), "SECRET_MARKER=do-not-copy\n");
fs.writeFileSync(path.join(DEV, ".mcp.json"), JSON.stringify({ mcpServers: { atlassian: { command: "docker", args: ["-v", "C:/ProgramData/Cloudflare/installed_cert.pem:/certs/ca.pem:ro"], env: { JIRA_URL: "https://example.atlassian.net" } } } }));
fs.mkdirSync(path.join(QA, ".claude"));
fs.writeFileSync(path.join(QA, ".claude/settings.json"), JSON.stringify({ permissions: { allow: ["Read"] }, model: "x" }));
const INIT = path.join(SRC, "scripts/init/aisdlc-qa-init.js");
const dryInit = spawnSync("node", [INIT, QA, "--dry-run"], { encoding: "utf8" });
t("init --dry-run lists the new templates", /fixtures[\\/]pdf\.ts/.test(dryInit.stdout) && /\.claude[\\/]settings\.json/.test(dryInit.stdout), true);
t("init scaffolds", spawnSync("node", [INIT, QA], { encoding: "utf8" }).status, 0);
const st = JSON.parse(fs.readFileSync(path.join(QA, ".claude/settings.json"), "utf8"));
t("init merges .claude/settings.json additively", st.model === "x" && st.permissions.allow.includes("Read") && st.permissions.deny.includes("Read(./.env)") && st.enabledPlugins["aisdlc-qa@aisdlc-marketplace"], true);
t("fresh config has a checks/ project and video off", /checks/.test(fs.readFileSync(path.join(QA, "playwright.config.ts"), "utf8")) && /QA_VIDEO === '1'/.test(fs.readFileSync(path.join(QA, "playwright.config.ts"), "utf8")), true);
const fromDev = spawnSync("node", [INIT, QA, "--from-dev"], { encoding: "utf8", env: { ...env, AISDLC_ROOT: QA } });
t("init --from-dev finds the sibling dev workspace", fromDev.status, 0);
const qaJira = JSON.parse(fs.readFileSync(path.join(QA, "config/integrations.yaml"), "utf8").replace(/^\s*#.*$/gm, "")).jira;
const fromDevOut = JSON.parse(fromDev.stdout);
t("init --from-dev no longer copies an MCP server", fs.existsSync(path.join(QA, ".mcp.json")), false);
t("init --from-dev sets jira.base_url from an older dev workspace's JIRA_URL", qaJira.base_url, "https://example.atlassian.net");
t("init --from-dev copies the acceptance-criteria field", qaJira.acceptance_criteria_field, "customfield_10050");
t("init --from-dev reports the corporate CA for NODE_EXTRA_CA_CERTS", fromDevOut.ca_certificate && fromDevOut.ca_certificate.path, "C:/ProgramData/Cloudflare/installed_cert.pem");
t("init --from-dev never copies claude.env content", /SECRET_MARKER|do-not-copy/.test(fromDev.stdout + fs.readFileSync(path.join(QA, "config/integrations.yaml"), "utf8")), false);

t("a fresh workspace has no specs/ folder", fs.existsSync(path.join(QA, "specs")), false);
t("a fresh workspace has only auth.setup.ts and seed.spec.ts in tests/", fs.readdirSync(path.join(QA, "tests")).sort().join(","), "auth.setup.ts,seed.spec.ts");
t("a fresh .gitignore keeps tasks/<T>/spec.md committable", /!tasks\/\*\/spec\.md/.test(fs.readFileSync(path.join(QA, ".gitignore"), "utf8")), true);

// --- --migrate-layout: specs/<T>.md and tests/<feature-area>/ -> tasks/<T>/spec.md and tests/<T>/ -----------------------
const O = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-qa-old-"));
const putO = (rel, text) => { fs.mkdirSync(path.dirname(path.join(O, rel)), { recursive: true }); fs.writeFileSync(path.join(O, rel), text); };
putO("specs/QA-5.md", "### S1 - a\n");
putO("specs/notes.txt", "x");
putO("tests/auth.setup.ts", "setup");
putO("tests/seed.spec.ts", "seed");
putO("tests/area/s1-a.spec.ts", "// spec: specs/QA-5.md\nimport { go } from './helpers';\ntest('a', { tag: ['@QA-5', '@QA-5-S1'] }, async () => {});\n");
putO("tests/area/s2-b.spec.ts", "// spec: specs/QA-5.md\nimport { go } from './helpers';\ntest('b', { tag: ['@QA-5-S2'] }, async () => {});\n");
putO("tests/area/helpers.ts", "export const go = 1;\n");
putO("tests/area/shared.ts", "export const both = 1;\n");
putO("tests/area/c.spec.ts", "import { both } from './shared';\ntest('c', { tag: ['@QA-6'] }, async () => {});\n");
putO("tests/area/d.spec.ts", "import { both } from './shared';\ntest('d', { tag: ['@QA-7'] }, async () => {});\n");
putO("tests/area/multi.spec.ts", "test('m', { tag: ['@QA-5', '@QA-6'] }, async () => {});\n");
putO("tests/area/none.spec.ts", "test('n', async () => {});\n");
putO(".gitignore", "tasks/*\n!tasks/.gitkeep\n");
const mig = (...a) => JSON.parse(spawnSync("node", [INIT, O, "--migrate-layout", ...a], { encoding: "utf8" }).stdout);
const dryMig = mig("--dry-run");
const movesOf = (r) => r.moves.map((m) => `${m.from}>${m.to}`).sort().join("|");
// shared.ts is imported by QA-6's c and QA-7's d: it stays, so c and d stay too (their import would break).
t("--migrate-layout --dry-run lists the moves", movesOf(dryMig),
  ["specs/QA-5.md>tasks/QA-5/spec.md", "tests/area/helpers.ts>tests/QA-5/helpers.ts", "tests/area/s1-a.spec.ts>tests/QA-5/s1-a.spec.ts", "tests/area/s2-b.spec.ts>tests/QA-5/s2-b.spec.ts"].sort().join("|"));
t("--migrate-layout lists what it leaves", dryMig.left.map((l) => l.path).sort().join(","),
  "specs/notes.txt,tests/area/c.spec.ts,tests/area/d.spec.ts,tests/area/multi.spec.ts,tests/area/none.spec.ts,tests/area/shared.ts");
t("--migrate-layout --dry-run changes nothing", fs.existsSync(path.join(O, "specs/QA-5.md")) && !fs.existsSync(path.join(O, "tests/QA-5")), true);
mig();
t("--migrate-layout moves the spec", fs.readFileSync(path.join(O, "tasks/QA-5/spec.md"), "utf8"), "### S1 - a\n");
t("--migrate-layout rewrites the spec header", fs.readFileSync(path.join(O, "tests/QA-5/s1-a.spec.ts"), "utf8").startsWith("// spec: tasks/QA-5/spec.md\n"), true);
t("--migrate-layout moves the ticket's helper with its tests", fs.existsSync(path.join(O, "tests/QA-5/helpers.ts")) && !fs.existsSync(path.join(O, "tests/area/helpers.ts")), true);
t("--migrate-layout keeps a helper shared by two tickets in place", fs.existsSync(path.join(O, "tests/area/shared.ts")), true);
t("--migrate-layout never moves setup or seed", fs.existsSync(path.join(O, "tests/auth.setup.ts")) && fs.existsSync(path.join(O, "tests/seed.spec.ts")), true);
t("--migrate-layout appends the .gitignore exception", fs.readFileSync(path.join(O, ".gitignore"), "utf8").startsWith("tasks/*\n!tasks/.gitkeep\n") && /!tasks\/\*\/spec\.md/.test(fs.readFileSync(path.join(O, ".gitignore"), "utf8")), true);
putO("specs/QA-5.md", "### S1 - changed\n");
t("--migrate-layout never overwrites an existing spec.md", mig().left.some((l) => l.path === "specs/QA-5.md" && /already exists/.test(l.reason)) && fs.readFileSync(path.join(O, "tasks/QA-5/spec.md"), "utf8") === "### S1 - a\n", true);

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
