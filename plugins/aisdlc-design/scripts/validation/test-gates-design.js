#!/usr/bin/env node
// Deterministic acceptance tests for the design workspace hook (per-ticket sync commits). No model needed.
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const { spawnSync, execSync } = require("child_process");
const SRC = path.resolve(__dirname, "..", "..");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-design-test-"));
for (const d of ["hooks", "scripts/lib", "config", "designs"])
  fs.mkdirSync(path.join(W, d), { recursive: true });
fs.copyFileSync(
  path.join(SRC, "hooks/pre-tool-policy.js"),
  path.join(W, "hooks/pre-tool-policy.js"),
);
fs.copyFileSync(
  path.join(SRC, "scripts/lib/root.js"),
  path.join(W, "scripts/lib/root.js"),
);
// config/repositories.yaml is the marker that makes the folder a workspace.
fs.writeFileSync(
  path.join(W, "config/repositories.yaml"),
  JSON.stringify({ repositories: {} }),
);
execSync(
  "git init -q -b main && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m init",
  { cwd: W },
);

const env = { ...process.env, AISDLC_ROOT: W };
const hook = (ev) => {
  const r = spawnSync("node", [path.join(W, "hooks/pre-tool-policy.js")], {
    env,
    input: JSON.stringify(ev),
    encoding: "utf8",
  });
  if (process.env.V)
    console.log("   ", (r.stderr || "").trim().split("\n").join(" "));
  return r.status;
};
let fail = 0;
const t = (name, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} (got ${got}, want ${want})`);
};
const write = (f) =>
  hook({ tool_name: "Write", tool_input: { file_path: f }, cwd: W });
const bash = (c, cwd = W) =>
  hook({ tool_name: "Bash", tool_input: { command: c }, cwd });
const git = (c) => execSync("git " + c, { cwd: W, stdio: "pipe" });
const stage = (f, body) => {
  const p = path.join(W, f);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  git("add -A " + JSON.stringify(path.dirname(f)));
};

// file writes
t(
  "design file write allowed",
  write(path.join(W, "designs/DES-1/home.dc.html")),
  0,
);
t(".git write blocked", write(path.join(W, ".git/config")), 2);
t("key file write blocked", write(path.join(W, "designs/x.pem")), 2);

// ticket commits, straight on main (no branches)
stage("designs/DES-1/home.dc.html", "<!doctype html><title>home</title>");
t(
  "ticket commit on main allowed",
  bash(`git commit -m "DES-1: Add home page"`),
  0,
);
t(
  "ticket commit with another key blocked",
  bash(`git commit -m "DES-2: Add home page"`),
  2,
);
t("message without key blocked", bash(`git commit -m "Add home page"`), 2);
t(
  "old baseline message blocked",
  bash(`git commit -m "design: baseline x"`),
  2,
);
t("commit -a blocked", bash(`git commit -a -m "DES-1: x"`), 2);
t("multi-line message blocked", bash(`git commit -m "DES-1: a" -m "body"`), 2);
git(`commit -q -m "DES-1: Add home page"`);

// another ticket, and a re-sync of the first
stage(
  "designs/DES-2/checkout.dc.html",
  "<!doctype html><title>checkout</title>",
);
t(
  "second ticket folder allowed",
  bash(`git commit -m "DES-2: Add checkout page"`),
  0,
);
git(`commit -q -m "DES-2: Add checkout page"`);
stage("designs/DES-1/home.dc.html", "<!doctype html><title>home v2</title>");
t(
  "re-sync of an existing ticket allowed",
  bash(`git commit -m "DES-1: Update home page"`),
  0,
);
git(`commit -q -m "DES-1: Update home page"`);
t(
  "commit on a feature branch also allowed",
  (git("checkout -q -b scratch"),
  stage("designs/DES-3/a.dc.html", "x"),
  bash(`git commit -m "DES-3: Add a"`)),
  0,
);
git("reset -q");
git("checkout -q main");

// staged paths
stage("designs/DES-1/home.dc.html", "<!doctype html><title>home v3</title>");
stage(
  "designs/DES-2/checkout.dc.html",
  "<!doctype html><title>checkout v2</title>",
);
t(
  "two ticket folders in one commit blocked",
  bash(`git commit -m "DES-1: Both"`),
  2,
);
git("reset -q");
fs.writeFileSync(path.join(W, "README.md"), "x");
git("add README.md");
t(
  "commit staging files outside designs/<KEY> blocked",
  bash(`git commit -m "DES-1: x"`),
  2,
);
git("reset -q README.md");
stage("designs/prototype/home.dc.html", "x");
t("non-ticket folder blocked", bash(`git commit -m "DES-1: x"`), 2);
git("reset -q");

// dangerous operations
t("force push blocked", bash("git push --force origin main"), 2);
t("history rewrite blocked", bash("git filter-branch --all"), 2);
t("credential print blocked", bash("echo $JIRA_API_TOKEN"), 2);
t("harmless command allowed", bash("git status"), 0);

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
