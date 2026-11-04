#!/usr/bin/env node
// Checks the live status page (scripts/status/status-server.js) against a throwaway workspace:
// lifecycle timeline (past/current/future/interrupted), approvals with change detection, next step, history,
// documents, and the safety rules (read-only, localhost Host only, nothing outside tasks/<ticket>/, no .env).
// Usage: node test-status-page.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, execFileSync } = require("child_process");

const PLUGIN = path.resolve(__dirname, "..", "..");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-status-"));
// Remove the temp workspace even when setup throws: a leftover one is found by other tests' workspace discovery.
process.on("exit", () => fs.rmSync(W, { recursive: true, force: true }));
const env = { ...process.env, AISDLC_ROOT: W, CLAUDE_PLUGIN_ROOT: PLUGIN, JIRA_API_TOKEN: "x" };
delete env.JIRA_EMAIL;
const state = (...a) => execFileSync("node", [path.join(PLUGIN, "scripts/state/aisdlc-state.js"), ...a], { env, stdio: "pipe" });
let failed = 0;
const check = (ok, name) => {
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) failed++;
};

execFileSync("node", [path.join(PLUGIN, "scripts/init/aisdlc-init.js"), W, "--only", "workspace"], { env, stdio: "pipe" });
// Walk the feature lifecycle from config, so the test follows lifecycle changes: every state up to the one before
// SPEC_APPROVED (the specification gate), then approve and enter SPEC_APPROVED.
const STATES = JSON.parse(fs.readFileSync(path.join(PLUGIN, "config", "task-types.yaml"), "utf8").replace(/^\s*#.*$/gm, "")).feature.states;
const GATE = STATES.indexOf("SPEC_APPROVED");
state("init", "EL-1", "feature", "api");
for (const s of STATES.slice(1, GATE)) state("transition", "EL-1", s);
const T = path.join(W, "tasks", "EL-1");
const touch = (f, minutesAgo) => fs.utimesSync(f, new Date(Date.now() - minutesAgo * 60000), new Date(Date.now() - minutesAgo * 60000));
fs.writeFileSync(path.join(T, "jira.md"), "# EL-1: Appointment reminders\n\n**Title:** Appointment reminders\n");
fs.writeFileSync(path.join(T, "specification.md"), "# Spec\n");
const waiting = JSON.parse(execFileSync("node", [path.join(PLUGIN, "scripts/status/status-server.js"), "--json"], { env, encoding: "utf8" }));
state("approve", "EL-1", "specification");
state("transition", "EL-1", "SPEC_APPROVED");
state("transition", "EL-1", "BLOCKED", "--reason", "waiting for contract");
fs.appendFileSync(path.join(T, "specification.md"), "edited after approval\n");
fs.mkdirSync(path.join(T, "evidence"));
fs.writeFileSync(path.join(T, "evidence", "run.json"), "{}");
fs.writeFileSync(path.join(T, ".env"), "X=1\n");
touch(path.join(T, "jira.md"), 60);
touch(path.join(T, "evidence", "run.json"), 30);
fs.writeFileSync(path.join(W, "outside.md"), "outside\n");
state("init", "EL-2", "bug");

const get = (port, p, host = "localhost", method = "GET") =>
  new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers: { Host: host } }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve({ code: res.statusCode, body: b, type: res.headers["content-type"] || "" }));
    });
    req.end();
  });

(async () => {
  const json = JSON.parse(execFileSync("node", [path.join(PLUGIN, "scripts/status/status-server.js"), "--json"], { env, encoding: "utf8" }));
  check(json.tasks.length === 2, "--json lists both tasks");
  const w1 = waiting.tasks.find((t) => t.id === "EL-1");
  check(w1.awaiting_approval === "specification" && waiting.pending_approvals.includes("EL-1"), "task before SPEC_APPROVED with a pending spec is awaiting approval");
  const s1 = json.tasks.find((t) => t.id === "EL-1");
  check(s1.title === "Appointment reminders", "title comes from jira.md");
  check(s1.failure && s1.resume_state === "SPEC_APPROVED" && s1.position === GATE + 1, "failure state keeps its place in the lifecycle");
  check(!s1.awaiting_approval, "approved spec is no longer awaiting approval");
  check(s1.next && s1.next.who === "you" && s1.next.text.includes("EL-1"), "next step for BLOCKED");
  check(json.issues.some((i) => i.ref === "EL-1"), "blocked task is a blocking issue");
  const cred = Object.fromEntries(json.credentials.map((c) => [c.name, c.set]));
  check(cred.JIRA_API_TOKEN === true && cred.JIRA_EMAIL === false && !JSON.stringify(json).includes('"x"'), "credentials as set/missing, no values");

  const srv = spawn("node", [path.join(PLUGIN, "scripts/status/status-server.js"), "--port", "0"], { env });
  const port = await new Promise((resolve, reject) => {
    srv.stdout.on("data", (d) => {
      const m = String(d).match(/localhost:(\d+)/);
      if (m) resolve(Number(m[1]));
    });
    srv.on("exit", () => reject(new Error("server exited")));
  });
  try {
    const page = await get(port, "/");
    check(page.code === 200 && page.type.startsWith("text/html"), "page served");
    const d = JSON.parse((await get(port, "/api/tasks/EL-1")).body);
    const st = Object.fromEntries(d.timeline.map((x) => [x.state, x.status]));
    check(STATES.slice(0, GATE).every((s) => st[s] === "done") && d.timeline.find((x) => x.state === "TICKET_READY").visits.length === 1, "past states done with entry times");
    check(st.SPEC_APPROVED === "interrupted", "current state shown as interrupted while BLOCKED");
    check(STATES.slice(GATE + 1).every((s) => st[s] === "future"), "upcoming states shown as future");
    check(d.timeline.find((x) => x.state === "SPEC_APPROVED").gate && !d.timeline.find((x) => x.state === "CREATED").gate, "approval states marked as gates");
    const spec = d.approvals.find((a) => a.gate === "specification");
    check(spec.status === "approved" && spec.changed_since_approval === true, "approval flags a changed artifact");
    check(d.history.some((e) => e.event === "approval-granted") && d.history.some((e) => e.to === "BLOCKED"), "history from execution-log.jsonl");
    const docs = d.documents.map((x) => x.path);
    check(docs.includes("jira.md") && docs.includes("specification.md") && docs.includes("evidence/run.json"), "documents listed, including subfolders");
    check(!docs.includes(".env"), ".env not listed");
    const mod = d.documents.map((x) => x.modified);
    check(mod.every((m, i) => i === 0 || mod[i - 1] >= m) && docs.indexOf("evidence/run.json") < docs.indexOf("jira.md") && docs.at(-1) === "jira.md", "documents listed newest first");
    const md = await get(port, "/api/tasks/EL-1/doc?path=jira.md");
    check(md.code === 200 && md.body.includes("Appointment reminders") && md.type.startsWith("text/plain"), "document served as text");
    check((await get(port, "/api/tasks/EL-1/doc?path=evidence%2Frun.json")).code === 200, "document in a subfolder served");
    check((await get(port, "/api/tasks/EL-1/doc?path=.env")).code === 404, ".env refused");
    check((await get(port, "/api/tasks/EL-1/doc?path=..%2F..%2Foutside.md")).code === 404, "path traversal refused");
    check((await get(port, "/api/tasks/EL-1/doc?path=" + encodeURIComponent(path.join(W, "outside.md")))).code === 404, "absolute path refused");
    check((await get(port, "/api/tasks/..%2Fconfig")).code === 404, "bad ticket id refused");
    check((await get(port, "/api/status", "evil.example")).code === 403, "foreign Host header refused");
    check((await get(port, "/api/status", "localhost", "POST")).code === 405, "non-GET refused");
    const d2 = JSON.parse((await get(port, "/api/tasks/EL-2")).body);
    check(d2.lifecycle.name === "bug" && d2.timeline[0].status === "current", "bug lifecycle, new task at CREATED");
    const again = await new Promise((resolve) => {
      const p2 = spawn("node", [path.join(PLUGIN, "scripts/status/status-server.js"), "--port", String(port)], { env });
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
