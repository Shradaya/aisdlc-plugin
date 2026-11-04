#!/usr/bin/env node
// Checks the QA live status page (scripts/status/status-server.js) against a throwaway QA workspace: lifecycle
// timeline, approvals, defects, runs with their step screenshots and report, documents, and the safety rules
// (read-only, localhost Host only, nothing outside tasks/<ticket>/, no .env / .auth). No browser, no network.
// Usage: node test-status-page-qa.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, execFileSync } = require("child_process");

const PLUGIN = path.resolve(__dirname, "..", "..");
const SERVER = path.join(PLUGIN, "scripts/status/status-server.js");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-qa-status-"));
// Remove the temp workspace even when setup throws: a leftover one is found by other tests' workspace discovery.
process.on("exit", () => fs.rmSync(W, { recursive: true, force: true }));
const env = { ...process.env, AISDLC_ROOT: W, CLAUDE_PLUGIN_ROOT: PLUGIN, JIRA_EMAIL: "x" };
for (const k of ["JIRA_API_TOKEN", "QA_USERNAME", "QA_PASSWORD"]) delete env[k];
const put = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(W, rel)), { recursive: true });
  fs.writeFileSync(path.join(W, rel), text);
};
const json = (rel, o) => put(rel, JSON.stringify(o, null, 2));
const state = (...a) => execFileSync("node", [path.join(PLUGIN, "scripts/state/aisdlc-state.js"), ...a], { env, stdio: "pipe" });
let failed = 0;
const check = (ok, name) => {
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) failed++;
};

json("config/repositories.yaml", { repositories: {} });
json("config/workspace.yaml", { workspace: { name: "qa-test", kind: "qa" } });
json("config/environments.yaml", { default: "qa", environments: { qa: { base_url: "https://qa.example.test", allow_automation: true, data: "synthetic", login: { mode: "form" } }, uat: { base_url: "", allow_automation: true } }, blocked_hosts: ["example.org"] });
put(".env", "QA_USERNAME=someone\n");

const T = "QA-1";
state("init", T, "qa");
for (const s of ["TICKET_READY", "ENVIRONMENT_READY", "SCENARIOS_DRAFTED"]) state("transition", T, s);
put(`tasks/${T}/jira.md`, "# QA-1: Sign in\n\n**Summary:** Sign in with valid credentials\n");
put(`tasks/${T}/scenarios.md`, "# Scenarios\n\n## S1 Valid sign-in\n");
state("transition", T, "AWAITING_SCENARIO_APPROVAL");
const waiting = JSON.parse(execFileSync("node", [SERVER, "--json"], { env, encoding: "utf8" }));
state("approve", T, "scenarios");
for (const s of ["SCENARIOS_APPROVED", "TESTS_GENERATED", "TESTS_EXECUTED", "AWAITING_DEV_FIX"]) state("transition", T, s);
state("set", T, "environment", JSON.stringify({ name: "qa", base_url: "https://qa.example.test", build: "b-1", data: "synthetic" }));
state("set", T, "runs.1", JSON.stringify({ mode: "watch", environment: "qa", build: "b-1", finished_at: "2026-11-01T10:01:00Z", tests: 2, passed: 1, failed: 1, flaky: 0, skipped: 0 }));
state("set", T, "runs.2", JSON.stringify({ mode: "headless", environment: "qa", build: "b-2", finished_at: "2026-11-02T10:01:00Z", tests: 2, passed: 2, failed: 0, flaky: 0, skipped: 0 }));
state("set", T, "defects.D1", JSON.stringify({ id: "D1", scenario: "S2", title: "Error not shown", severity: "major", status: "open", run: 1, build: "b-1", expected: "error", actual: "nothing" }));

const R1 = `tasks/${T}/evidence/run-1`;
json(`${R1}/run.json`, { ticket: T, run: 1, mode: "watch", environment: "qa", base_url: "https://qa.example.test", build: "b-1", started_at: "2026-11-01T10:00:00Z" });
json(`${R1}/summary.json`, { ok: true, totals: { tests: 2, passed: 1, failed: 1, flaky: 0, skipped: 0 }, tests: [
  { file: "QA-1/s1.spec.ts", title: "QA-1 S1 Valid sign-in", scenario: "S1", acs: ["AC1"], status: "passed", duration_ms: 1200, step_screenshots: [] },
  { file: "QA-1/s2.spec.ts", title: "QA-1 S2 Bad password", scenario: "S2", acs: ["AC2"], status: "failed", failed_step: "2. Submit", error: "expect(locator).toBeVisible() failed", failed_screenshot: `tasks/${T}/evidence/run-1/screenshots/${T}-S2/02-2-submit-FAILED.png` },
] });
const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
for (const f of [`${T}-S1/01-1-open-login.png`, `${T}-S1/02-2-sign-in.png`, `${T}-S1/10-10-dashboard.png`, `${T}-S2/01-1-open-login.png`, `${T}-S2/02-2-submit-FAILED.png`]) put(`${R1}/screenshots/${f}`, png);
put(`${R1}/report/index.html`, "<!doctype html><title>Playwright Test Report</title>");
put(`${R1}/report/data/x.zip`, "zip");
put(`${R1}/artifacts/QA-1-s2/video.webm`, "webm");
json(`tasks/${T}/evidence/run-2/run.json`, { ticket: T, run: 2, mode: "headless", build: "b-2" });
put(`tasks/${T}/.env`, "X=1\n");
put(`tasks/${T}/.auth/qa.json`, "{}");
put("outside.md", "outside\n");
state("init", "QA-2", "qa");

const get = (port, p, host = "localhost", method = "GET") =>
  new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers: { Host: host } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ code: res.statusCode, body: Buffer.concat(chunks).toString("utf8"), type: res.headers["content-type"] || "" }));
    });
    req.end();
  });

(async () => {
  check(waiting.pending_approvals.includes(T) && waiting.tasks.find((t) => t.id === T).awaiting_approval === "scenarios", "waiting for scenario approval is a pending approval");
  const s = JSON.parse(execFileSync("node", [SERVER, "--json"], { env, encoding: "utf8" }));
  const t1 = s.tasks.find((t) => t.id === T);
  check(s.tasks.length === 2 && t1.title === "Sign in with valid credentials", "tickets listed, title from jira.md");
  check(t1.waiting_on_developer && s.waiting_on_developer.includes(T) && s.open_defects === 1, "waiting on developer and open defects counted");
  check(t1.last_run && t1.last_run.run === 2 && t1.last_run.passed === 2 && t1.runs === 2, "last run from task state");
  check(t1.next && t1.next.who === "you" && t1.next.text.includes(T), "next step");
  check(s.environments.list.length === 2 && s.environments.blocked_hosts.includes("example.org"), "environments and blocked hosts");
  check(s.issues.some((i) => i.ref === "uat"), "environment with automation but no base_url is an issue");
  const cred = Object.fromEntries(s.credentials.map((c) => [c.name, c.set]));
  check(cred.QA_USERNAME === ".env" && cred.JIRA_EMAIL === "environment" && cred.QA_PASSWORD === null && !JSON.stringify(s).includes("someone"), "credentials as set/missing with source, no values");

  // refuses a non-QA workspace
  const D = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-dev-ws-"));
  fs.mkdirSync(path.join(D, "config"));
  fs.writeFileSync(path.join(D, "config/repositories.yaml"), '{"repositories":{}}');
  let refused = false;
  try { execFileSync("node", [SERVER, "--json"], { env: { ...env, AISDLC_ROOT: D }, stdio: "pipe" }); } catch (e) { refused = e.status === 1; }
  check(refused, "refuses a workspace that is not kind qa");
  fs.rmSync(D, { recursive: true, force: true });

  const srv = spawn("node", [SERVER, "--port", "0"], { env });
  const port = await new Promise((resolve, reject) => {
    srv.stdout.on("data", (d) => {
      const m = String(d).match(/localhost:(\d+)/);
      if (m) resolve(Number(m[1]));
    });
    srv.on("exit", () => reject(new Error("server exited")));
  });
  try {
    check((await get(port, "/")).type.startsWith("text/html"), "page served");
    const d = JSON.parse((await get(port, `/api/tasks/${T}`)).body);
    const st = Object.fromEntries(d.timeline.map((x) => [x.state, x.status]));
    check(st.CREATED === "done" && st.TESTS_EXECUTED === "done" && st.AWAITING_DEV_FIX === "current" && st.COMPLETED === "future", "past, current and future states");
    check(d.timeline.filter((x) => x.gate).map((x) => x.state).join() === "AWAITING_SCENARIO_APPROVAL,AWAITING_RESULTS_SIGNOFF", "QA decisions marked as gates");
    check(d.approvals.find((a) => a.gate === "scenarios").status === "approved" && d.approvals.find((a) => a.gate === "scenarios").changed_since_approval === false, "scenario approval, unchanged");
    check(d.defects.length === 1 && d.defects[0].status === "open" && d.defects[0].expected === "error", "defects");
    check(d.runs.map((r) => r.run).join() === "2,1", "runs newest first");
    const r1 = d.runs.find((r) => r.run === 1);
    check(r1.report && r1.totals.failed === 1 && r1.tests.find((x) => x.scenario === "S2").failed_step === "2. Submit", "run results and failed step");
    const s1 = r1.screenshots.find((g) => g.scenario === "S1");
    check(s1 && s1.shots.map((x) => x.step).join() === "01-1-open-login,02-2-sign-in,10-10-dashboard", "step screenshots grouped by scenario, in step order");
    check(r1.screenshots.find((g) => g.scenario === "S2").shots.some((x) => x.failed), "failed step screenshot flagged");
    check(r1.tests.find((x) => x.scenario === "S2").failed_screenshot === "evidence/run-1/screenshots/QA-1-S2/02-2-submit-FAILED.png", "summary paths made task-relative");
    check(r1.videos.length === 1, "videos found in artifacts");
    const shot = await get(port, `/api/tasks/${T}/doc?path=${encodeURIComponent(s1.shots[0].path)}`);
    check(shot.code === 200 && shot.type === "image/png", "screenshot served as an image");
    const rep = await get(port, `/report/${T}/1/`);
    check(rep.code === 200 && rep.body.includes("Playwright Test Report") && rep.type.startsWith("text/html"), "Playwright report served");
    check((await get(port, `/report/${T}/1/data/x.zip`)).type === "application/zip", "report data served");
    check((await get(port, `/report/${T}/1/..%2F..%2F..%2Fjira.md`)).code === 404, "report path traversal refused");
    const docs = d.documents.map((x) => x.path);
    check(docs.includes("jira.md") && docs.includes("evidence/run-1/summary.json"), "documents listed");
    check(!docs.some((p) => /\/(report|artifacts|screenshots)\//.test(p)), "evidence internals left out of documents");
    check(!docs.some((p) => /(^|\/)(\.env|\.auth)/.test(p)), ".env and .auth not listed");
    check((await get(port, `/api/tasks/${T}/doc?path=.env`)).code === 404 && (await get(port, `/api/tasks/${T}/doc?path=.auth%2Fqa.json`)).code === 404, ".env and .auth refused");
    check((await get(port, `/api/tasks/${T}/doc?path=..%2F..%2Foutside.md`)).code === 404, "path traversal refused");
    check((await get(port, "/api/status", "evil.example")).code === 403, "foreign Host header refused");
    check((await get(port, "/api/status", "localhost", "POST")).code === 405, "non-GET refused");
    const again = await new Promise((resolve) => {
      const p2 = spawn("node", [SERVER, "--port", String(port)], { env });
      let out = "";
      p2.stdout.on("data", (c) => (out += c));
      p2.on("exit", (code) => resolve({ code, out }));
    });
    check(again.code === 0 && again.out.includes("already running"), "second start on the same port reuses the running page");
  } finally {
    srv.kill();
    fs.rmSync(W, { recursive: true, force: true });
  }
  console.log(failed ? `${failed} failed` : "all passed");
  process.exit(failed ? 1 : 0);
})();
