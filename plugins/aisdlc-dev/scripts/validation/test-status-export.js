#!/usr/bin/env node
// Acceptance tests for status-server.js --export (self-contained snapshot of the status page) and --markdown
// (one task's status as Markdown), against a throwaway workspace with real task state. The snapshot's embedded
// shim is executed in a sandbox to prove it answers the page's /api requests from the file alone.
const fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
const { execFileSync, spawnSync } = require("child_process");
const PLUGIN = path.resolve(__dirname, "..", "..");
const SERVER = path.join(PLUGIN, "scripts/status/status-server.js");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-export-"));
process.on("exit", () => fs.rmSync(W, { recursive: true, force: true }));
const env = { ...process.env, AISDLC_ROOT: W, CLAUDE_PLUGIN_ROOT: PLUGIN, JIRA_API_TOKEN: "super-secret-token-value" };
delete env.JIRA_EMAIL;
const state = (...a) => execFileSync("node", [path.join(PLUGIN, "scripts/state/aisdlc-state.js"), ...a], { env, stdio: "pipe" });
const server = (...a) => spawnSync("node", [SERVER, ...a], { env, encoding: "utf8" });
let failed = 0;
const check = (ok, name) => { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) failed++; };

execFileSync("node", [path.join(PLUGIN, "scripts/init/aisdlc-init.js"), W, "--only", "workspace"], { env, stdio: "pipe" });
const STATES = JSON.parse(fs.readFileSync(path.join(PLUGIN, "config", "task-types.yaml"), "utf8").replace(/^\s*#.*$/gm, "")).feature.states;
const GATE = STATES.indexOf("SPEC_APPROVED");
state("init", "EL-1", "feature", "api");
for (const s of STATES.slice(1, GATE)) state("transition", "EL-1", s);
const T1 = path.join(W, "tasks", "EL-1");
fs.writeFileSync(path.join(T1, "jira.md"), "# EL-1: Appointment reminders\n\n**Title:** Appointment reminders\n");
fs.writeFileSync(path.join(T1, "specification.md"), "# Spec\nSECRET-DOC-MARKER </script><script>alert(1)</script> \u2028 end\n");
fs.writeFileSync(path.join(T1, "chart.png"), Buffer.from("89504e470d0a1a0a", "hex"));
state("approve", "EL-1", "specification");
state("transition", "EL-1", "SPEC_APPROVED");
state("set", "EL-1", "commits", JSON.stringify({ api: "0123456789abcdef0123" }));
state("set", "EL-1", "pull_requests", JSON.stringify({ "api@lf-develop": "https://bitbucket.org/acme/api/pull-requests/7", "api@lf-qa": "https://bitbucket.org/acme/api/pull-requests/8" }));
state("set", "EL-1", "env_branches", JSON.stringify({ "api@lf-qa": "EL-1-qa" }));
state("init", "EL-2", "bug", "api");
state("transition", "EL-2", "TICKET_READY");
state("transition", "EL-2", "BLOCKED", "--reason", "waiting for | a contract");

// ---- --export -----------------------------------------------------------------------------------------------------
const OUT = path.join(W, "out", "dashboard.html");
let r = server("--export", OUT);
check(r.status === 0 && fs.existsSync(OUT), "--export writes the file (creating its folder)");
check(/Snapshot written/.test(r.stdout) && /2 tasks/.test(r.stdout) && /not included/.test(r.stdout), "the summary says how many tasks and that documents are left out");
let html = fs.readFileSync(OUT, "utf8");
const dataMatch = html.match(/<script id="aisdlc-snapshot" type="application\/json">([\s\S]*?)<\/script>/);
check(Boolean(dataMatch), "the snapshot data is in a JSON script block");
let snap = null;
try { snap = JSON.parse(dataMatch[1]); } catch {}
check(snap !== null, "the snapshot data block is valid JSON");
if (snap === null) { console.log(`\n${failed} failed`); process.exit(1); }
check(Object.keys(snap.tasks).sort().join() === "EL-1,EL-2" && snap.status.tasks.length === 2, "both tasks are in the snapshot");
check(snap.tasks["EL-1"].timeline.length > 0 && snap.tasks["EL-1"].approvals.some((a) => a.gate === "specification" && a.status === "approved"), "task detail carries the timeline and approvals");
check(snap.with_documents === false && Object.keys(snap.docs).length === 0, "documents are left out by default");
check(!html.includes("SECRET-DOC-MARKER"), "no document text is in the file by default");
check(!html.includes(W) && !JSON.stringify(snap.status.workspace).includes(os.tmpdir()), "the local workspace path is not in the file");
check(snap.status.workspace.name && !("root" in snap.status.workspace), "only the workspace name is kept");
check(snap.status.credentials.length === 0 && !html.includes("super-secret-token-value") && !html.includes("JIRA_API_TOKEN"), "credential status and values are not in the file");
check(!/<link |src="https?:|href="https?:/i.test(html), "the file references nothing external");
check(html.includes('id="aisdlc-snapshot-shim"') && html.indexOf("aisdlc-snapshot-shim") < html.indexOf("async function getJSON"), "the shim is defined before the page's own script");

// the shim, executed: it must answer the page's requests from the file alone
const shimCode = html.match(/<script id="aisdlc-snapshot-shim">([\s\S]*?)<\/script>/)[1];
function sandbox(snapshotJson) {
  const window = {};
  const ctx = vm.createContext({ window, document: { getElementById: (id) => (id === "aisdlc-snapshot" ? { textContent: snapshotJson } : null) }, URL, Response, JSON, Promise, Object, encodeURIComponent, decodeURIComponent });
  vm.runInContext(shimCode, ctx);
  return window;
}
(async () => {
  const win = sandbox(dataMatch[1]);
  const get = async (u) => { const res = await win.fetch(u, { cache: "no-store" }); return { status: res.status, body: await res.text() }; };
  let g = await get("/api/status");
  check(g.status === 200 && JSON.parse(g.body).tasks.length === 2, "shim: /api/status answers from the snapshot");
  g = await get("/api/tasks/EL-1");
  check(g.status === 200 && JSON.parse(g.body).summary.id === "EL-1", "shim: /api/tasks/<id> answers the task detail");
  g = await get("/api/tasks/EL-99");
  check(g.status === 404 && JSON.parse(g.body).error === "no such task", "shim: an unknown task is a 404 like the server");
  g = await get("/api/tasks/EL-1/doc?path=specification.md");
  check(g.status === 404 && /not included.*--with-docs/.test(JSON.parse(g.body).error), "shim: a document is a 404 that says how to include it");
  g = await get("/api/nothing");
  check(g.status === 404, "shim: anything else is a 404");
  check(win.AISDLC_SNAPSHOT && win.AISDLC_SNAPSHOT.with_documents === false && Boolean(win.AISDLC_SNAPSHOT.generated_at), "shim: marks the page as a snapshot");

  // ---- the page itself knows it is a snapshot ----
  check(/AISDLC_SNAPSHOT/.test(html) && /not live/.test(html), "the page says snapshot / not live");

  // ---- guard against overwriting; --force ----
  r = server("--export", OUT);
  check(r.status === 1 && /already exists/.test(r.stderr), "an existing file is not overwritten without --force");
  r = server("--export", OUT, "--force");
  check(r.status === 0, "--force overwrites");
  r = server("--export");
  check(r.status === 1 && /usage/.test(r.stderr), "--export without a file is a usage error");

  // ---- --with-docs ----
  const OUT2 = path.join(W, "out", "with-docs.html");
  r = server("--export", OUT2, "--with-docs");
  check(r.status === 0 && /included \(text only\)/.test(r.stdout), "--with-docs says documents are included");
  const html2 = fs.readFileSync(OUT2, "utf8");
  const m2 = html2.match(/<script id="aisdlc-snapshot" type="application\/json">([\s\S]*?)<\/script>/);
  let snap2 = null;
  try { snap2 = JSON.parse(m2[1]); } catch {}
  check(snap2 !== null, "with documents, the data block is still valid JSON (hostile text did not break it)");
  if (snap2 === null) { console.log(`\n${failed} failed`); process.exit(1); }
  check(snap2.with_documents === true && snap2.docs["EL-1"]["specification.md"].includes("SECRET-DOC-MARKER"), "--with-docs embeds the text documents");
  check(!("chart.png" in snap2.docs["EL-1"]), "--with-docs does not embed images or binaries");
  // hostile document text must not break out of the data block or the page
  const scriptTags = (html2.match(/<script/g) || []).length, closeTags = (html2.match(/<\/script>/g) || []).length;
  check(scriptTags === closeTags && scriptTags === 3, "a document containing </script> cannot add or close a script block (exactly 3 script blocks)");
  check(!m2[1].includes("</script") && !m2[1].includes("\u2028"), "the data block has no raw </script or line separator");
  check(snap2.docs["EL-1"]["specification.md"].includes("</script><script>alert(1)</script>"), "...and the document text still round-trips exactly");
  const win2 = sandbox(m2[1]);
  const res2 = await win2.fetch("/api/tasks/EL-1/doc?path=specification.md");
  check(res2.status === 200 && (await res2.text()).includes("SECRET-DOC-MARKER"), "shim: with docs, a document is served");
  const res3 = await win2.fetch("/api/tasks/EL-1/doc?path=chart.png");
  check(res3.status === 404 && /not included in the snapshot/.test((await res3.json()).error), "shim: an image is reported as not included");
  const res4 = await win2.fetch("/api/tasks/EL-1/doc?path=__proto__");
  check(res4.status === 404, "shim: a prototype key is not a document");

  // ---- --markdown ----
  r = server("--markdown", "EL-1");
  check(r.status === 0 && r.stdout.startsWith("# EL-1: Appointment reminders"), "--markdown prints the task's status with its title");
  check(/\| State \| `SPEC_APPROVED`/.test(r.stdout), "--markdown shows the state");
  check(/\*\*Next \(/.test(r.stdout), "--markdown shows the next step");
  check(/## Approvals/.test(r.stdout) && /\| specification \| approved \|/.test(r.stdout), "--markdown lists approvals with status");
  check(/`api`: `0123456789ab`/.test(r.stdout), "--markdown shows commits (short)");
  check(/`api@lf-qa` \(from `EL-1-qa`\): https:\/\/bitbucket\.org\/acme\/api\/pull-requests\/8/.test(r.stdout) && /`api@lf-develop`: https/.test(r.stdout), "--markdown shows pull requests and the environment branch they came from");
  check(/## Recent history/.test(r.stdout) && /state-transition/.test(r.stdout), "--markdown shows recent history");
  check(!r.stdout.includes(W) && !r.stdout.includes("super-secret-token-value"), "--markdown has no local path or secret");
  r = server("--markdown", "EL-2");
  check(/`BLOCKED`/.test(r.stdout) && /waiting for \\\| a contract/.test(r.stdout), "--markdown shows a blocked task with its reason, with table pipes escaped");
  r = server("--markdown", "EL-99");
  check(r.status === 1 && /no task record/.test(r.stderr), "--markdown for an unknown task is an error");
  r = server("--markdown", "not-a-ticket");
  check(r.status === 1 && /usage/.test(r.stderr), "--markdown with a malformed ticket is a usage error");
  const MD = path.join(W, "out", "EL-1.md");
  r = server("--markdown", "EL-1", "--out", MD);
  check(r.status === 0 && fs.readFileSync(MD, "utf8").startsWith("# EL-1"), "--markdown --out writes the file");

  // ---- the live server is unchanged ----
  r = server("--json");
  check(r.status === 0 && JSON.parse(r.stdout).tasks.length === 2 && JSON.parse(r.stdout).credentials.length > 0, "--json (live payload) still includes the full status, unchanged");

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})();
