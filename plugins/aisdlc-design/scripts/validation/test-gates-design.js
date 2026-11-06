#!/usr/bin/env node
// Deterministic acceptance tests for the design workspace hook (prototype sync commits). No model needed.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync, execSync } = require("child_process");
const SRC = path.resolve(__dirname, "..", "..");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-design-test-"));
for (const d of ["hooks", "scripts/lib", "config", "designs/prototype"]) fs.mkdirSync(path.join(W, d), { recursive: true });
fs.copyFileSync(path.join(SRC, "hooks/pre-tool-policy.js"), path.join(W, "hooks/pre-tool-policy.js"));
fs.copyFileSync(path.join(SRC, "scripts/lib/root.js"), path.join(W, "scripts/lib/root.js"));
// config/repositories.yaml is the marker that makes the folder a workspace.
fs.writeFileSync(path.join(W, "config/repositories.yaml"), JSON.stringify({ repositories: {} }));
execSync("git init -q -b main && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m init", { cwd: W });

const env = { ...process.env, AISDLC_ROOT: W };
const hook = (ev) => { const r = spawnSync("node", [path.join(W, "hooks/pre-tool-policy.js")], { env, input: JSON.stringify(ev), encoding: "utf8" }); if (process.env.V) console.log("   ", (r.stderr || "").trim().split("\n").join(" ")); return r.status; };
let fail = 0;
const t = (name, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} (got ${got}, want ${want})`); };
const write = (f) => hook({ tool_name: "Write", tool_input: { file_path: f }, cwd: W });
const bash = (c, cwd = W) => hook({ tool_name: "Bash", tool_input: { command: c }, cwd });
const git = (c) => execSync("git " + c, { cwd: W, stdio: "pipe" });
const stage = (f, body) => { const p = path.join(W, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); git("add -A " + JSON.stringify(path.dirname(f))); };

// file writes
t("prototype write allowed", write(path.join(W, "designs/prototype/home.dc.html")), 0);
t(".git write blocked", write(path.join(W, ".git/config")), 2);
t("key file write blocked", write(path.join(W, "designs/x.pem")), 2);

// baseline on main
stage("designs/prototype/home.dc.html", "<!doctype html><title>home</title>");
t("baseline on main allowed", bash(`git commit -m "design: baseline Initial prototype"`), 0);
t("old-style message on main blocked", bash(`git commit -m "DESIGN-1: x"`), 2);
t("commit -a blocked", bash(`git commit -a -m "design: baseline x"`), 2);
git(`commit -q -m "design: baseline Initial prototype"`);

// ticket branch
git("checkout -q -b SYNC-7");
stage("designs/prototype/checkout.dc.html", "<!doctype html><title>checkout</title>");
t("ticket commit on its branch allowed", bash(`git commit -m "SYNC-7: Update checkout page"`), 0);
t("ticket commit on wrong branch blocked", bash(`git commit -m "SYNC-8: Update checkout page"`), 2);
t("baseline off main blocked", bash(`git commit -m "design: baseline again"`), 2);
t("slug commit needs design/ branch", bash(`git commit -m "design: tweak"`), 2);
t("multi-line message blocked", bash(`git commit -m "SYNC-7: a" -m "body"`), 2);
t("invalid message blocked", bash(`git commit -m "add checkout page"`), 2);
git(`commit -q -m "SYNC-7: Update checkout page"`);

// slug branch
git("checkout -q main && git checkout -q -b design/tweak-colors");
stage("designs/prototype/home.dc.html", "<!doctype html><title>home v2</title>");
t("slug commit on design/ branch allowed", bash(`git commit -m "design: Tweak colors"`), 0);

// staged paths
fs.writeFileSync(path.join(W, "README.md"), "x");
git("add README.md");
t("commit staging files outside designs/prototype blocked", bash(`git commit -m "design: Tweak colors"`), 2);
git("reset -q README.md");

// dangerous operations
t("commit on main (ticket message) blocked", (git("checkout -q main"), bash(`git commit -m "SYNC-7: x"`)), 2);
t("force push blocked", bash("git push --force origin SYNC-7"), 2);
t("history rewrite blocked", bash("git filter-branch --all"), 2);
t("credential print blocked", bash("echo $JIRA_API_TOKEN"), 2);
t("harmless command allowed", bash("git status"), 0);

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
