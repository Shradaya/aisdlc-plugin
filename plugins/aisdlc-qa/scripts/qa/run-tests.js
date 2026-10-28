#!/usr/bin/env node
// Run a QA ticket's Playwright tests so the QA can watch, collecting evidence into a new run folder.
// Usage: node run-tests.js <TICKET> [--watch|--headless|--ui|--login-check] [--env <name>] [--build <id>] [--only S1,S3] [--slowmo <ms>] [--video]
//   --watch       (default) visible browser, slowed down, one worker; full evidence (trace, video, step screenshots)
//   --headless    same evidence, no visible browser
//   --video       also record video (off by default: the per-step screenshots are the proof)
//   --ui          open Playwright UI mode (timeline, step-by-step) and return at once; no evidence folder is written
//   --login-check only run the login setup against the environment (any active state); no tests, no evidence
// The Playwright CLI is run with `node` from the workspace's node_modules, so no shell quoting or npx is involved.
// Evidence: tasks/<T>/evidence/run-<N>/{report/, artifacts/, screenshots/, results.json, summary.json, run.json}.
// Output: the Playwright list output, then one JSON line (the run summary). Test failures are a normal outcome (exit 0);
// exit 1 = blocked/error, 2 = workspace not set up (npm install / environment not configured).
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");
const { resolveRoot, configPath, NOT_WORKSPACE } = require("../lib/root");
const { readYaml } = require("../lib/yaml");
const { loadEnv } = require("../lib/repo-paths");
const { resolveEnv, playwrightCli, playwrightEnv } = require("./env");
const { summarize } = require("./summarize-results");

const RUNNABLE = ["TESTS_GENERATED", "TESTS_EXECUTED", "AWAITING_DEV_FIX", "AWAITING_RESULTS_SIGNOFF"];
const ROOT = resolveRoot();
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const ticket = args[0];

function done(payload, code) {
  console.log(JSON.stringify(payload));
  process.exit(code);
}

if (!ROOT) done({ ok: false, error: NOT_WORKSPACE }, 2);
if (!/^[A-Z][A-Z0-9]*-\d+$/.test(ticket || "")) done({ ok: false, error: "usage: run-tests.js <TICKET> [--watch|--headless|--ui] [--env <name>] [--build <id>] [--only S1,S3]" }, 1);

const taskFile = path.join(ROOT, "tasks", ticket, "task.yaml");
if (!fs.existsSync(taskFile)) done({ ok: false, error: `no QA task for ${ticket}; start it with /aisdlc-qa:test ${ticket}` }, 1);
const task = JSON.parse(fs.readFileSync(taskFile, "utf8"));
const loginCheck = args.includes("--login-check");
if (loginCheck ? ["COMPLETED", "CANCELLED"].includes(task.task.status) : !RUNNABLE.includes(task.task.status))
  done({ ok: false, error: `${ticket} is in ${task.task.status}; tests run only in ${RUNNABLE.join(", ")}` }, 1);

const env = resolveEnv(ROOT, opt("--env") || (task.environment && task.environment.name));
if (!env.ok) done({ ok: false, error: env.reason, environment: env.name || null }, env.base_url ? 1 : 2);
const cli = playwrightCli(ROOT);
if (!cli) done({ ok: false, error: "Playwright is not installed in this workspace: run npm install (and npx playwright install chromium)." }, 2);

const mode = loginCheck ? "login-check" : args.includes("--ui") ? "ui" : args.includes("--headless") ? "headless" : "watch";
const only = (opt("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
if (only.some((s) => !/^S\d+$/.test(s))) done({ ok: false, error: "--only takes scenario IDs like S1,S3" }, 1);
const grep = only.length ? only.map((s) => `@${ticket}-${s}\\b`).join("|") : `@${ticket}\\b`;
// Each ticket has its own folder tests/<T>/: pass it so Playwright loads only that ticket's files. The grep still
// selects the tests (and --only the scenarios); without the folder (old layouts) the grep alone does.
const folder = fs.existsSync(path.join(ROOT, "tests", ticket)) ? [`tests/${ticket}`] : [];

const policy = readYaml(configPath(ROOT, "qa-policy.yaml"), {}) || {};
const fileEnv = loadEnv(ROOT);
const slowMo = opt("--slowmo") || fileEnv.QA_SLOWMO || String((policy.watch || {}).slow_mo_ms ?? 500);
const childEnv = playwrightEnv({ QA_ENV: env.name });
delete childEnv.QA_EVIDENCE_DIR;
const video = args.includes("--video");
if (video) childEnv.QA_VIDEO = "1";
else delete childEnv.QA_VIDEO;

if (mode === "ui") {
  // UI mode is interactive: hand it to the QA and return. It has its own timeline and step snapshots.
  const child = spawn(process.execPath, [cli, "test", ...folder, "--ui", "--grep", grep], {
    cwd: ROOT, env: childEnv, detached: true, stdio: "ignore", windowsHide: true,
  });
  child.unref();
  done({ ok: true, ticket, mode, environment: env.name, base_url: env.base_url, grep, note: "Playwright UI mode opened; press the run button there to watch tests step by step. No evidence folder is written in UI mode." }, 0);
}

// Sign in first, in its own headless run outside the evidence folder, so the login (and the credentials typed into it)
// never appears in a trace, video, screenshot or report. The evidence run below then skips the setup project.
const setup = spawnSync(process.execPath, [cli, "test", "--project", "setup", "--reporter", "line"], {
  cwd: ROOT, env: { ...childEnv, QA_HEADLESS: "1", QA_SLOWMO: "0" }, stdio: ["ignore", "inherit", "inherit"],
});
if (setup.status !== 0)
  done({ ok: false, ticket, environment: env.name, error: `Login setup failed for '${env.name}': check login in config/environments.yaml and the QA_USERNAME / QA_PASSWORD environment variables (or capture a manual session).` }, 1);
if (loginCheck) done({ ok: true, ticket, mode, environment: env.name, base_url: env.base_url, login: (env.login || {}).mode || "none" }, 0);

// New evidence folder run-<N>.
const evRoot = path.join(ROOT, "tasks", ticket, "evidence");
fs.mkdirSync(evRoot, { recursive: true });
const n = 1 + Math.max(0, ...fs.readdirSync(evRoot).map((d) => (d.match(/^run-(\d+)$/) || [])[1]).filter(Boolean).map(Number));
const dir = path.join(evRoot, `run-${n}`);
fs.mkdirSync(dir);
const build = opt("--build") || (task.environment && task.environment.build) || null;
const started = new Date().toISOString();
fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify({ ticket, run: n, mode, environment: env.name, base_url: env.base_url, build, only, video, started_at: started }, null, 2) + "\n");

Object.assign(childEnv, {
  QA_EVIDENCE_DIR: dir,
  QA_SLOWMO: mode === "watch" ? slowMo : "0",
  ...(mode === "headless" ? { QA_HEADLESS: "1" } : {}),
});
if (mode === "watch") delete childEnv.QA_HEADLESS;

// The html/json reporters and their output paths come from playwright.config.ts (driven by QA_EVIDENCE_DIR); passing
// --reporter here would replace them with defaults. Exit status 1 just means some tests failed.
const r = spawnSync(process.execPath, [cli, "test", ...folder, "--grep", grep, "--no-deps"], {
  cwd: ROOT, env: { ...childEnv, PLAYWRIGHT_HTML_OPEN: "never" }, stdio: ["ignore", "inherit", "inherit"],
});
const s = summarize(ROOT, ticket, n);
const record = {
  mode, environment: env.name, build, only, started_at: started, finished_at: new Date().toISOString(),
  playwright_exit: r.status, ...(s.ok ? s.totals : { error: s.error }),
};
spawnSync(process.execPath, [path.join(__dirname, "..", "state", "aisdlc-state.js"), "set", ticket, `runs.${n}`, JSON.stringify(record)], {
  env: { ...process.env, AISDLC_ROOT: ROOT }, stdio: "ignore",
});
if (!s.ok) done({ ok: false, ticket, run: n, dir: path.relative(ROOT, dir), playwright_exit: r.status, error: s.error }, 1);
const { tests, ...head } = s;
done({ ...head, mode, environment: env.name, build, playwright_exit: r.status, failed_tests: tests.filter((t) => t.status === "failed").map((t) => ({ scenario: t.scenario, title: t.title, failed_step: t.failed_step, error: t.error && t.error.split("\n")[0] })) }, 0);
