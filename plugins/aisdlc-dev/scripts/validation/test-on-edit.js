#!/usr/bin/env node
// Acceptance tests for on_edit: the matching/running library, the PostToolUse hook that runs it, and the PreToolUse
// guard that asks before an edit changes the rules. Real files, real child processes ("tools" are node scripts);
// no shell is involved in running a rule, and these tests check that file names cannot smuggle one in.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync } = require("child_process");
const SRC = path.resolve(__dirname, "..", "..");
const lib = require(path.join(SRC, "scripts/lib/on-edit.js"));

let fail = 0;
const t = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); const ok = g === w; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (got ${g}, want ${w})`}`); };

// --- validate / matches / tokenize / cmdLine --------------------------------------------------------------------------
t("validate: no on_edit is fine", lib.validate(undefined), []);
t("validate: good rules", lib.validate([{ files: "*.js", run: "eslint {file}", fix: false, timeout: 30 }]), []);
t("validate: not a list", lib.validate({ run: "x" }), ["on_edit must be a list"]);
t("validate: a rule must be an object", lib.validate(["eslint"]), ["on_edit[0] must be an object"]);
t("validate: run is required", lib.validate([{ files: "*.js" }]), ['on_edit[0] needs a "run" command']);
t("validate: fix must be a boolean", lib.validate([{ run: "x", fix: "yes" }]), ["on_edit[0].fix must be true or false"]);
t("validate: timeout must be a positive number", lib.validate([{ run: "x", timeout: -1 }]), ["on_edit[0].timeout must be a number of seconds"]);
t("matches: default is every file", lib.matches("src/a.py"), true);
t("matches: a glob on the path", lib.matches("src/a.js", "src/*.js"), true);
t("matches: a glob on the bare name matches a nested file", lib.matches("src/deep/a.js", "*.js"), true);
t("matches: a comma list", lib.matches("a.ts", "*.js, *.ts"), true);
t("matches: a non-matching glob", lib.matches("a.md", "*.js,*.ts"), false);
t("matches: regex characters in a glob are literal", lib.matches("axjs", "a.js"), false);
t("tokenize: spaces separate and quotes group", lib.tokenize(`node -e "console.log('a b')" x`), ["node", "-e", "console.log('a b')", "x"]);
t("tokenize: an empty quoted argument is kept", lib.tokenize(`cmd "" x`), ["cmd", "", "x"]);
t("cmdLine: quotes every argument for cmd.exe", lib.cmdLine("C:\\p\\eslint.cmd", ["--quiet", "C:\\r\\a b.js"]), '"C:\\p\\eslint.cmd" "--quiet" "C:\\r\\a b.js"');
let threw = false; try { lib.cmdLine("x.cmd", ["a&calc"]); } catch { threw = true; }
t("cmdLine: refuses an argument cmd.exe could interpret", threw, true);

// --- running rules against a real repository ------------------------------------------------------------------------
const W = fs.mkdtempSync(path.join(os.tmpdir(), "on-edit-"));
const REPO = path.join(W, "payments-service");
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(REPO, rel)), { recursive: true }); fs.writeFileSync(path.join(REPO, rel), text); };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
put("tools/fmt.js", `const fs=require("fs");const f=process.argv[2];fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/ +$/gm,""));`);
put("tools/check.js", `const fs=require("fs");const f=process.argv[2];if(fs.readFileSync(f,"utf8").includes("BAD")){console.error("check.js: BAD marker in "+require("path").basename(f));process.exit(1)}`);
put("tools/argc.js", `console.log("ARGC="+(process.argv.length-2));process.exit(1)`);
put("tools/fail.js", `console.error("formatter exploded");process.exit(1)`);
put("src/good.js", "const a = 1;   \n");
put("src/bad.js", "const BAD = 1;\n");
put("docs/readme.md", "BAD in a markdown file\n");
put("test/good.test.js", "ok\n");
const run = (rel, rules) => lib.runRules(REPO, rel, rules);

let problems = run("src/good.js", [{ files: "*.js", run: "node tools/fmt.js {file}", fix: true }]);
t("a formatter (fix) runs and rewrites the file", read("src/good.js"), "const a = 1;\n");
t("a formatter reports nothing", problems, []);
problems = run("src/bad.js", [{ files: "*.js", run: "node tools/check.js {file}" }]);
t("a failing check is reported with its output", problems.length === 1 && /check\.js: BAD marker in bad\.js/.test(problems[0]) && /failed after editing src\/bad\.js/.test(problems[0]), true);
t("a passing check reports nothing", run("src/good.js", [{ files: "*.js", run: "node tools/check.js {file}" }]), []);
t("a rule whose glob does not match the file is not run", run("docs/readme.md", [{ files: "*.js", run: "node tools/check.js {file}" }]), []);
t("a failing formatter (fix) is ignored", run("src/good.js", [{ files: "*.js", run: "node tools/fail.js {file}", fix: true }]), []);
t("a repository-relative tool that is not installed skips the rule", run("src/bad.js", [{ files: "*.js", run: "node_modules/.bin/eslint {file}" }]), []);
problems = run("src/bad.js", [{ files: "*.js", run: "definitely-not-a-real-tool-xyz {file}" }]);
t("a bare program that is not installed is reported, not silently skipped", problems.length === 1 && /not installed or not on PATH/.test(problems[0]), true);
t("{test}: the rule runs only when the test file exists", run("src/good.js", [{ files: "src/*.js", run: "node tools/check.js {test}", test: "test/{name}.test.js" }]), []);
problems = run("src/good.js", [{ files: "src/*.js", run: "node tools/argc.js {test}", test: "test/nope-{name}.test.js" }]);
t("{test}: no test file, no run, nothing reported", problems, []);
problems = run("src/good.js", [{ files: "src/*.js", run: "node tools/argc.js {test}", test: "test/{name}.test.js" }]);
t("{test}: with the test file present the rule runs", problems.length === 1 && /ARGC=1/.test(problems[0]), true);
t("{name} and {rel} are filled in", lib.plan({ run: "x {name} {rel} {dir}" }, REPO, path.join("src", "deep", "a.js")).args, ["a", "src/deep/a.js", "src/deep"]);
put("src/with space.js", "x\n");
problems = run("src/with space.js", [{ files: "*.js", run: "node tools/argc.js {file}" }]);
t("a file name with a space stays one argument", problems.length === 1 && /ARGC=1/.test(problems[0]), true);
put("src/a&b;touch pwned.js", "x\n");
problems = run("src/a&b;touch pwned.js", [{ files: "*.js", run: "node tools/argc.js {file}" }]);
t("shell metacharacters in a file name are data (no shell is used)", problems.length === 1 && /ARGC=1/.test(problems[0]) && !fs.existsSync(path.join(REPO, "pwned.js")) && !fs.existsSync(path.join(W, "pwned.js")), true);
problems = run("src/good.js", [{ files: "*.js", run: `node -e "setTimeout(function(){},30000)"`, timeout: 1 }]);
t("a check that takes too long is reported as timed out", problems.length === 1 && /timed out after 1s/.test(problems[0]), true);
problems = run("src/bad.js", [{ files: "*.js", run: "node tools/check.js {file}" }, { files: "*.js", run: "node tools/fmt.js {file}", fix: true }, { files: "*.js", run: "node tools/check.js {file}" }]);
t("every failing check is reported, not just the first", problems.length === 2, true);

// --- the PostToolUse hook ---------------------------------------------------------------------------------------------
const H = fs.mkdtempSync(path.join(os.tmpdir(), "on-edit-ws-"));
for (const d of ["hooks", "scripts/lib", "config", "tasks", "logs"]) fs.mkdirSync(path.join(H, d), { recursive: true });
for (const f of ["hooks/post-tool-edit.js", "hooks/pre-tool-policy.js", "scripts/lib/root.js", "scripts/lib/yaml.js", "scripts/lib/repo-paths.js", "scripts/lib/on-edit.js", "scripts/lib/env-branches.js", "scripts/lib/real-systems.js"])
  fs.copyFileSync(path.join(SRC, f), path.join(H, f));
fs.copyFileSync(path.join(SRC, "config", "task-types.yaml"), path.join(H, "config", "task-types.yaml"));
const OTHER = path.join(W, "legacy-tools");
fs.mkdirSync(OTHER);
fs.writeFileSync(path.join(OTHER, "x.js"), "BAD\n");
const RULES = [{ files: "*.js", run: "node tools/check.js {file}" }];
const writeRegistry = (repos, kind) => {
  fs.writeFileSync(path.join(H, "config/repositories.yaml"), JSON.stringify({ repositories: repos }, null, 2));
  fs.writeFileSync(path.join(H, "config/workspace.yaml"), JSON.stringify({ workspace: { name: "t" }, git: { base_branch: "main" }, ...(kind ? { workspace: { name: "t", kind } } : {}) }));
};
const REGISTRY = (extra = {}) => ({ app: { path: REPO, base_branch: "main", on_edit: RULES, ...extra }, plain: { path: OTHER, base_branch: "main" } });
writeRegistry(REGISTRY());
const post = (ev) => spawnSync("node", [path.join(H, "hooks/post-tool-edit.js")], { env: { ...process.env, AISDLC_ROOT: H }, input: JSON.stringify(ev), encoding: "utf8" });
const edit = (file, tool = "Edit", cwd = H) => post({ tool_name: tool, tool_input: { file_path: file }, cwd });

let r = edit(path.join(REPO, "src/bad.js"));
t("hook: a failing check exits 2 and the output goes to stderr (back to the model)", r.status === 2 && /BAD marker in bad\.js/.test(r.stderr) && /'app'/.test(r.stderr), true);
t("hook: a passing file exits 0 and is silent", (() => { const x = edit(path.join(REPO, "src/good.js")); return x.status === 0 && x.stderr === "" && x.stdout === ""; })(), true);
t("hook: Write and MultiEdit are covered too", edit(path.join(REPO, "src/bad.js"), "Write").status === 2 && edit(path.join(REPO, "src/bad.js"), "MultiEdit").status === 2, true);
t("hook: other tools are ignored", edit(path.join(REPO, "src/bad.js"), "Read").status, 0);
t("hook: a relative file_path resolves against cwd", edit("src/bad.js", "Edit", REPO).status, 2);
t("hook: a file outside every registered repository is ignored", edit(path.join(W, "elsewhere.js")).status, 0);
t("hook: a repository without on_edit is left alone", edit(path.join(OTHER, "x.js")).status, 0);
put("node_modules/pkg/index.js", "BAD\n");
t("hook: node_modules is ignored", edit(path.join(REPO, "node_modules/pkg/index.js")).status, 0);
t("hook: a file that does not exist is ignored", edit(path.join(REPO, "src/gone.js")).status, 0);
t("hook: a directory path is ignored", edit(path.join(REPO, "src")).status, 0);
writeRegistry(REGISTRY({ on_edit: [{ files: "*.js" }] }));
r = edit(path.join(REPO, "src/good.js"));
t("hook: an invalid on_edit is reported (exit 2), never silently skipped", r.status === 2 && /needs a "run" command/.test(r.stderr), true);
writeRegistry(REGISTRY(), "qa");
t("hook: in another plugin's workspace (kind qa) it does nothing", edit(path.join(REPO, "src/bad.js")).status, 0);
writeRegistry(REGISTRY());
t("hook: garbage on stdin is ignored", spawnSync("node", [path.join(H, "hooks/post-tool-edit.js")], { env: { ...process.env, AISDLC_ROOT: H }, input: "not json", encoding: "utf8" }).status, 0);

// --- the PreToolUse guard: changing on_edit asks first ----------------------------------------------------------------
const REG = path.join(H, "config/repositories.yaml");
const pre = (ev) => spawnSync("node", [path.join(H, "hooks/pre-tool-policy.js")], { env: { ...process.env, AISDLC_ROOT: H }, input: JSON.stringify({ cwd: H, ...ev }), encoding: "utf8" });
const asked = (res) => { try { return JSON.parse(res.stdout).hookSpecificOutput.permissionDecision === "ask"; } catch { return false; } };
const text = () => fs.readFileSync(REG, "utf8");
const withRepos = (repos) => JSON.stringify({ repositories: repos }, null, 2);

r = pre({ tool_name: "Write", tool_input: { file_path: REG, content: withRepos(REGISTRY({ on_edit: [{ run: "node tools/evil.js {file}" }] })) } });
t("guard: a Write that changes on_edit asks", r.status === 0 && asked(r), true);
t("guard: the ask says why", /outside Claude's permission prompts/.test(r.stdout), true);
r = pre({ tool_name: "Write", tool_input: { file_path: REG, content: withRepos({ ...REGISTRY(), added: { path: OTHER, base_branch: "main" } }) } });
t("guard: a Write that only adds another repository (on_edit unchanged) does not ask", r.status === 0 && !asked(r), true);
r = pre({ tool_name: "Write", tool_input: { file_path: REG, content: withRepos({ app: { path: REPO, base_branch: "main" }, plain: { path: OTHER, base_branch: "main" } }) } });
t("guard: removing on_edit is a change too", asked(r), true);
r = pre({ tool_name: "Edit", tool_input: { file_path: REG, old_string: '"run": "node tools/check.js {file}"', new_string: '"run": "node tools/evil.js {file}"' } });
t("guard: an Edit that changes a run command asks", asked(r), true);
r = pre({ tool_name: "Edit", tool_input: { file_path: REG, old_string: '"base_branch": "main"', new_string: '"base_branch": "main", "role": "api"', replace_all: false } });
t("guard: an Edit to something else in the registry does not ask", !asked(r), true);
r = pre({ tool_name: "MultiEdit", tool_input: { file_path: REG, edits: [{ old_string: '"files": "*.js"', new_string: '"files": "*"' }] } });
t("guard: a MultiEdit that changes on_edit asks", asked(r), true);
r = pre({ tool_name: "Edit", tool_input: { file_path: REG, old_string: "THIS TEXT IS NOT IN THE FILE", new_string: '"on_edit": [{"run":"x"}]' } });
t("guard: an edit that cannot be applied but mentions on_edit asks (conservative)", asked(r), true);
fs.writeFileSync(REG, "{ not json, on_edit maybe");
r = pre({ tool_name: "Write", tool_input: { file_path: REG, content: '{ "repositories": { "a": { "on_edit": [{"run":"x"}] } } ' } });
t("guard: a file that cannot be parsed and now mentions on_edit asks", asked(r), true);
writeRegistry(REGISTRY());
r = pre({ tool_name: "Write", tool_input: { file_path: path.join(H, "notes.txt"), content: "on_edit is documented here" } });
t("guard: another file mentioning on_edit is not a registry change", !asked(r), true);
r = pre({ tool_name: "Bash", tool_input: { command: `echo '{"on_edit":[{"run":"x"}]}' > ${REG}` } });
t("guard: a shell command writing on_edit into the registry asks", asked(r), true);
r = pre({ tool_name: "Bash", tool_input: { command: `cat ${REG}` } });
t("guard: reading the registry does not ask", !asked(r), true);
r = pre({ tool_name: "Bash", tool_input: { command: `grep on_edit ${REG}` } });
t("guard: grepping for on_edit does not ask", !asked(r), true);

fs.rmSync(W, { recursive: true, force: true }); fs.rmSync(H, { recursive: true, force: true });
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
