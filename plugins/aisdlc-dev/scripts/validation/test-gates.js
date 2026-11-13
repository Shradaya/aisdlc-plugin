#!/usr/bin/env node
// Deterministic acceptance tests for spec §60 D, E, F, G, O, Q (+ bypass attempts). No model needed.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync, execSync } = require("child_process");
const SRC = path.resolve(__dirname, "..", "..");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-test-"));
for (const d of ["hooks", "scripts/state", "scripts/lib", "config", "tasks", "logs"]) fs.mkdirSync(path.join(W, d), { recursive: true });
for (const f of ["hooks/pre-tool-policy.js", "scripts/state/aisdlc-state.js", "scripts/lib/repo-paths.js", "scripts/lib/root.js", "scripts/lib/yaml.js", "scripts/lib/env-branches.js", "scripts/lib/real-systems.js"]) fs.copyFileSync(path.join(SRC, f), path.join(W, f));
// task-types.yaml is the plugin default (<plugin>/config); the hook and state CLI read it from the test workspace config/
fs.copyFileSync(path.join(SRC, "config", "task-types.yaml"), path.join(W, "config", "task-types.yaml"));
const repo = path.join(W, "..", path.basename(W) + "-backend");
fs.mkdirSync(repo, { recursive: true });
execSync("git init -q -b main && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m init", { cwd: repo });
fs.writeFileSync(path.join(W, "config/repositories.yaml"), JSON.stringify({ repositories: { backend: { path: repo, base_branch: "main" } } }));
fs.writeFileSync(path.join(W, "config/workspace.yaml"), JSON.stringify({ workspace: { name: "t" }, git: { base_branch: "main" } }));
fs.writeFileSync(path.join(W, "config/integrations.yaml"), JSON.stringify({ git_hosting: {
  pr_target_branches: ["lf-develop", "lf-qa", "lf-uat"],
  environments: { "lf-develop": "dev", "lf-qa": "qa", "lf-uat": "uat" },
  env_branch_format: "{ticket}-{env}" } }));
const env = { ...process.env, AISDLC_ROOT: W };
const state = (...a) => spawnSync("node", [path.join(W, "scripts/state/aisdlc-state.js"), ...a], { env, encoding: "utf8" });
const hook = (ev) => { const r = spawnSync("node", [path.join(W, "hooks/pre-tool-policy.js")], { env, input: JSON.stringify(ev), encoding: "utf8" }); if (process.env.V) console.log("   ", r.stderr.trim().split("\n").join(" ")); return r.status; };
let fail = 0;
const t = (name, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} (got ${got}, want ${want})`); };
const write = (f) => hook({ tool_name: "Write", tool_input: { file_path: f }, cwd: W });
const bash = (c, cwd = W) => hook({ tool_name: "Bash", tool_input: { command: c }, cwd });
const src = path.join(repo, "a.js");

t("no task: edit blocked", write(src), 2);
state("init", "FEAT-1", "feature", "backend");
for (const s of ["TICKET_READY","UNDERSTOOD","REPOSITORIES_PREPARED"]) state("transition", "FEAT-1", s);
fs.writeFileSync(path.join(W, "tasks/FEAT-1/specification.md"), "spec v1");
t("D: edit before approval blocked", write(src), 2);
t("D: shell redirect before approval blocked", bash(`echo x > ${src.split(path.sep).join("/")}`), 2);
t("direct task.yaml edit blocked", write(path.join(W, "tasks/FEAT-1/task.yaml")), 2);
t("illegal skip blocked", state("transition", "FEAT-1", "IMPLEMENTING").status, 2);
t("task artifact write allowed", write(path.join(W, "tasks/FEAT-1/specification.md")), 0);
state("approve", "FEAT-1", "specification");
state("transition", "FEAT-1", "SPEC_APPROVED");
t("edit allowed after approval", write(src), 0);
fs.writeFileSync(path.join(W, "tasks/FEAT-1/specification.md"), "spec v2 changed");
t("edit blocked after spec changed", write(src), 2);
state("approve", "FEAT-1", "specification");
t("edit allowed after reapproval", write(src), 0);
for (const s of ["PLAN_APPROVED","IMPLEMENTING"]) state("transition", "FEAT-1", s);
execSync("git checkout -q -b FEAT-1", { cwd: repo });
t("F: invalid commit blocked", bash(`git commit -m "add scheduled reports"`, repo), 2);
t("G: valid commit allowed", bash(`git commit -m "FEAT-1: Add scheduled report generation"`, repo), 0);
execSync("git checkout -q main", { cwd: repo });
t("E: commit on main blocked", bash(`git commit -m "FEAT-1: Add x"`, repo), 2);
t("force push blocked", bash("git push --force origin FEAT-1", repo), 2);
t("O: premature spec deletion blocked", bash("rm tasks/FEAT-1/specification.md"), 2);
t("Q: COMPLETED before consolidation blocked", state("transition", "FEAT-1", "COMPLETED").status, 2);
state("transition", "FEAT-1", "CONFLICTED");
t("source edit blocked while CONFLICTED", write(src), 2);
t("recover CONFLICTED -> IMPLEMENTING", state("transition", "FEAT-1", "IMPLEMENTING").status, 0);
t("edit allowed again after recovery", write(src), 0);
state("transition", "FEAT-1", "CI_FAILED");
t("CI_FAILED fix edits allowed", write(src), 0);

// --- environment branches (<TICKET>-<env>): where a committed ticket's conflict resolution may happen ---------------------
const envLib = require(path.join(SRC, "scripts/lib/env-branches.js"));
const hosting = JSON.parse(fs.readFileSync(path.join(W, "config/integrations.yaml"), "utf8")).git_hosting;
t("env branch name from the format and environment map", envLib.envBranchName(hosting, "EL-5739", "lf-qa"), "EL-5739-qa");
t("a target without an environment name uses its own branch name", envLib.envBranchName({ pr_target_branches: ["rel"], env_branch_format: "{ticket}-{env}" }, "EL-1", "rel"), "EL-1-rel");
t("a custom format is honoured", envLib.envBranchName({ ...hosting, env_branch_format: "env/{env}/{ticket}" }, "EL-1", "lf-uat"), "env/uat/EL-1");
t("parse: an env branch gives its ticket and target", JSON.stringify(envLib.parseEnvBranch(hosting, "EL-5739-uat")), JSON.stringify({ ticket: "EL-5739", target: "lf-uat" }));
t("parse: a name with extra text is not an env branch", envLib.parseEnvBranch(hosting, "EL-5739-uat-copy"), null);
t("parse: a prefixed name is not an env branch", envLib.parseEnvBranch(hosting, "feature/EL-5739-uat"), null);
t("parse: the plain ticket branch is not an env branch", envLib.parseEnvBranch(hosting, "EL-5739"), null);
t("parse: an unknown environment is not an env branch", envLib.parseEnvBranch(hosting, "EL-5739-prod"), null);
const cli = (...a) => spawnSync("node", [path.join(SRC, "scripts/git-hosting/env-branch.js"), ...a], { env, encoding: "utf8" });
t("env-branch CLI maps every target", JSON.stringify(JSON.parse(cli("EL-7").stdout).branches), JSON.stringify({ "lf-develop": "EL-7-dev", "lf-qa": "EL-7-qa", "lf-uat": "EL-7-uat" }));
t("env-branch CLI maps one named target", JSON.parse(cli("EL-7", "lf-qa").stdout).branches["lf-qa"], "EL-7-qa");
t("env-branch CLI refuses a target that is not configured", cli("EL-7", "main").status, 1);
t("env-branch CLI refuses a bad ticket", cli("nope").status, 1);

// a second ticket, taken to PR_CREATED, where source edits are blocked (FEAT-1 is cancelled so it cannot widen what FEAT-2 may do)
state("transition", "FEAT-1", "CANCELLED");
state("init", "FEAT-2", "feature", "backend");
for (const s of ["TICKET_READY","UNDERSTOOD","REPOSITORIES_PREPARED"]) state("transition", "FEAT-2", s);
fs.writeFileSync(path.join(W, "tasks/FEAT-2/specification.md"), "spec");
state("approve", "FEAT-2", "specification");
for (const s of ["SPEC_APPROVED","PLAN_APPROVED","IMPLEMENTING","COMMITTED"]) state("transition", "FEAT-2", s);
t("COMMITTED: source edits are still allowed on the ticket branch (the carve-out is not needed here)", write(src), 0);
state("transition", "FEAT-2", "PR_CREATED");
const sh = (c) => execSync(c, { cwd: repo, stdio: "ignore" });
sh("git checkout -q main");
sh("git checkout -q -b lf-qa"); fs.writeFileSync(path.join(repo, "conflict.txt"), "qa side\n"); sh("git add -A && git commit -q -m 'qa change'");
sh("git update-ref refs/remotes/origin/lf-qa lf-qa"); // the repo has no remote; create-pr merges origin/<target>
sh("git checkout -q main");
sh("git checkout -q -b FEAT-2"); fs.writeFileSync(path.join(repo, "conflict.txt"), "feature side\n"); sh("git add -A && git commit -q -m 'FEAT-2: feature change'");
const ticketBranchEdit = write(src);
t("PR_CREATED: a source edit on the ticket branch stays blocked", ticketBranchEdit, 2);
sh("git checkout -q -b FEAT-2-qa");
t("PR_CREATED: an edit on the env branch with NO merge in progress stays blocked", write(src), 2);
t("env branch: a commit with the ticket's message is allowed", bash(`git commit -m "FEAT-2: Merge lf-qa into FEAT-2-qa"`, repo), 0);
t("env branch: a commit with another ticket's message is blocked", bash(`git commit -m "FEAT-1: nope"`, repo), 2);
t("env branch: a commit with no ticket prefix is blocked", bash(`git commit -m "merge stuff"`, repo), 2);
t("env branch: git's default merge message form (--no-edit, no -m) is blocked", bash(`git commit --no-edit`, repo), 2);
try { sh("git merge --no-ff --no-commit origin/lf-qa"); } catch {} // conflicts on conflict.txt: leaves MERGE_HEAD
t("PR_CREATED: an edit on the env branch DURING a merge is allowed (conflict resolution)", write(src), 0);
t("PR_CREATED: shell write into the repo during the merge is allowed", bash(`echo resolved > ${src.split(path.sep).join("/")}`, repo), 0);
sh("git merge --abort");
t("merge aborted: edits blocked again", write(src), 2);
sh("git checkout -q FEAT-2");
sh("git checkout -q -b FEAT-2-notanenv");
try { sh("git merge --no-ff --no-commit origin/lf-qa"); } catch {}
t("a look-alike branch name does not get the allowance, even mid-merge", write(src), 2);
t("a look-alike branch name cannot take commits", bash(`git commit -m "FEAT-2: x"`, repo), 2);
sh("git merge --abort");
sh("git checkout -q FEAT-2");
sh("git checkout -q -b FEAT-9-qa");
try { sh("git merge --no-ff --no-commit origin/lf-qa"); } catch {}
t("another ticket's env branch (no task lists this repo for it) gets no allowance", write(src), 2);
t("another ticket's env branch cannot take FEAT-2 commits", bash(`git commit -m "FEAT-2: x"`, repo), 2);
sh("git merge --abort"); sh("git checkout -q FEAT-2");
sh("git checkout -q FEAT-2-qa");
sh("git branch -q unrelated main"); sh("git checkout -q unrelated"); fs.writeFileSync(path.join(repo, "unrelated.txt"), "x\n"); sh("git add -A && git commit -q -m unrelated");
sh("git checkout -q FEAT-2-qa");
try { sh("git merge --no-ff --no-commit unrelated"); } catch {}
t("merging an unrelated ref into the env branch gets no allowance", write(src), 2);
sh("git merge --abort");


// --- post-release sync branches (<base>-<env>-<date>): maintenance, not ticket work, so no task is involved ----------------
t("sync branch name from the format", envLib.syncBranchName(hosting, "main", "lf-qa", "20261105"), "main-qa-20261105");
t("parse sync: a sync branch gives its target", JSON.stringify(envLib.parseSyncBranch(hosting, "main", "main-uat-20261105")), JSON.stringify({ target: "lf-uat" }));
t("parse sync: a short date is not a sync branch", envLib.parseSyncBranch(hosting, "main", "main-qa-2026"), null);
t("parse sync: trailing text is not a sync branch", envLib.parseSyncBranch(hosting, "main", "main-qa-20261105-old"), null);
t("parse sync: a ticket env branch is not a sync branch", envLib.parseSyncBranch(hosting, "main", "FEAT-2-qa"), null);
t("parse sync: a base branch with regex characters is matched literally", envLib.parseSyncBranch(hosting, "rel.1", "relx1-qa-20261105"), null);
t("base branch comes from workspace.yaml git.base_branch", envLib.baseBranch(W), "main");

// every ticket is finished, so only sync rules apply
state("transition", "FEAT-2", "CANCELLED");
sh("git checkout -q main");
sh("git checkout -q -b main-qa-20261105");
t("sync branch: a message starting 'Sync main into lf-qa: ' is allowed (no task needed)", bash(`git commit -m "Sync main into lf-qa: resolve conflicts in 2 files"`, repo), 0);
t("sync branch: the ticket-style message is not accepted there", bash(`git commit -m "FEAT-2: x"`, repo), 2);
t("sync branch: a message for another target is blocked", bash(`git commit -m "Sync main into lf-uat: x"`, repo), 2);
t("sync branch: an empty summary is blocked", bash(`git commit -m "Sync main into lf-qa: "`, repo), 2);
t("sync branch: git's default merge message (--no-edit) is blocked", bash(`git commit --no-edit`, repo), 2);
t("sync branch: a multi-line message is blocked", bash(`git commit -m "Sync main into lf-qa: a" -m "body"`, repo), 2);
sh("git checkout -q main");
t("main: the sync message does not unlock commits on main", bash(`git commit -m "Sync main into lf-qa: x"`, repo), 2);
t("main: with no active task, an ordinary commit is still blocked", bash(`git commit -m "FEAT-2: x"`, repo), 2);

// source edits: only on a sync branch, while the merge in progress is origin/<target>, with no task at all
sh("git checkout -q -b main-qa-20261106");
t("sync branch: an edit with no merge in progress is blocked", write(src), 2);
try { sh("git merge --no-ff --no-commit origin/lf-qa"); } catch {}
t("sync branch: an edit while origin/<target> is being merged is allowed", write(src), 0);
t("sync branch: a shell write while origin/<target> is being merged is allowed", bash(`echo resolved > ${src.split(path.sep).join("/")}`, repo), 0);
sh("git merge --abort");
try { sh("git merge --no-ff --no-commit unrelated"); } catch {}
t("sync branch: merging some other ref gives no allowance", write(src), 2);
sh("git merge --abort");
sh("git checkout -q -b main-qa-20261106-extra"); // not a sync branch name
try { sh("git merge --no-ff --no-commit origin/lf-qa"); } catch {}
t("a look-alike name gets no allowance even while origin/<target> is being merged", write(src), 2);
sh("git merge --abort");
sh("git checkout -q main");

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
