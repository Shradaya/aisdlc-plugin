#!/usr/bin/env node
// Deterministic acceptance tests for the design lifecycle gates. No model needed.
// Mirrors the dev test-gates.js structure against the design plugin's hook, state engine and task-types.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync, execSync } = require("child_process");
const SRC = path.resolve(__dirname, "..", "..");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-design-test-"));
for (const d of ["hooks", "scripts/state", "scripts/lib", "config", "tasks", "logs", "designs"]) fs.mkdirSync(path.join(W, d), { recursive: true });
for (const f of ["hooks/pre-tool-policy.js", "scripts/state/aisdlc-state.js", "scripts/lib/repo-paths.js", "scripts/lib/root.js", "scripts/lib/yaml.js"]) fs.copyFileSync(path.join(SRC, f), path.join(W, f));
fs.copyFileSync(path.join(SRC, "config", "task-types.yaml"), path.join(W, "config", "task-types.yaml"));
// A design workspace still needs config/repositories.yaml to be recognized as a workspace by resolveRoot.
fs.writeFileSync(path.join(W, "config/repositories.yaml"), JSON.stringify({ repositories: {} }));
// The design folder is itself a git repo (the designer commits designs/<TICKET>/ into it).
execSync("git init -q -b main && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m init", { cwd: W });

const env = { ...process.env, AISDLC_ROOT: W };
const state = (...a) => spawnSync("node", [path.join(W, "scripts/state/aisdlc-state.js"), ...a], { env, encoding: "utf8" });
const hook = (ev) => { const r = spawnSync("node", [path.join(W, "hooks/pre-tool-policy.js")], { env, input: JSON.stringify(ev), encoding: "utf8" }); if (process.env.V) console.log("   ", (r.stderr || "").trim().split("\n").join(" ")); return r.status; };
let fail = 0;
const t = (name, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} (got ${got}, want ${want})`); };
const write = (f) => hook({ tool_name: "Write", tool_input: { file_path: f }, cwd: W });
const bash = (c, cwd = W) => hook({ tool_name: "Bash", tool_input: { command: c }, cwd });

const proto = path.join(W, "designs/DESIGN-1/prototype/index.html");
fs.mkdirSync(path.dirname(proto), { recursive: true });

t("no task: prototype edit blocked", write(proto), 2);
state("init", "DESIGN-1", "design");
// Before the brief exists, prototype authoring is blocked (CREATED/TICKET_READY are below source_edit_min_state).
state("transition", "DESIGN-1", "TICKET_READY");
t("prototype edit before brief blocked", write(proto), 2);
// From DESIGN_BRIEF through DESIGN_DRAFTED the author drafts the prototype freely (pre-approval drafting).
for (const s of ["DESIGN_BRIEF"]) state("transition", "DESIGN-1", s);
t("prototype authoring allowed during brief/draft", write(proto), 0);
for (const s of ["DESIGN_DRAFTED","AWAITING_DESIGN_APPROVAL"]) state("transition", "DESIGN-1", s);
fs.writeFileSync(path.join(W, "tasks/DESIGN-1/design.md"), "design v1");
t("prototype authoring still allowed awaiting approval", write(proto), 0);
t("design.md (task artifact) write allowed", write(path.join(W, "tasks/DESIGN-1/design.md")), 0);
t("direct task.yaml edit blocked", write(path.join(W, "tasks/DESIGN-1/task.yaml")), 2);
t("illegal skip to COMMITTED blocked (no approval)", state("transition", "DESIGN-1", "COMMITTED").status, 2);
state("approve", "DESIGN-1", "design");
state("transition", "DESIGN-1", "DESIGN_APPROVED");
t("prototype edit allowed after approval", write(proto), 0);
fs.writeFileSync(path.join(W, "tasks/DESIGN-1/design.md"), "design v2 changed");
t("prototype edit blocked after design changed", write(proto), 2);
state("approve", "DESIGN-1", "design");
t("prototype edit allowed after reapproval", write(proto), 0);

// commit gate
execSync("git checkout -q -b DESIGN-1", { cwd: W });
fs.writeFileSync(path.join(W, "designs/DESIGN-1/prototype/index.html"), "<!doctype html><title>x</title>");
execSync("git add -A", { cwd: W });
t("invalid commit message blocked", bash(`git commit -m "add login screen"`, W), 2);
t("valid design commit allowed", bash(`git commit -m "DESIGN-1: Add login screen prototype"`, W), 0);
execSync("git checkout -q main", { cwd: W });
t("commit on main blocked", bash(`git commit --allow-empty -m "DESIGN-1: x"`, W), 2);
t("force push blocked", bash("git push --force origin DESIGN-1", W), 2);

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
