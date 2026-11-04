#!/usr/bin/env node
// Acceptance tests for the Jira REST client's request routing (scripts/lib/jira.js), driven through jira-fetch.js
// against a local mock that behaves like Atlassian Cloud: a classic token works on the site URL; a scoped token is
// anonymous there (401) and works only through the API gateway (/ex/jira/<cloudId>/...). No network, no credentials.
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { spawn } = require("child_process");
const SCRIPT = path.resolve(__dirname, "..", "jira", "jira-fetch.js");
const basic = (email, token) => "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
const CLASSIC = basic("me@x.com", "classic-tok"), SCOPED = basic("me@x.com", "scoped-tok");
const CLOUD_ID = "abc-123";

const W = fs.mkdtempSync(path.join(os.tmpdir(), "jira-client-"));
for (const d of ["config", "tasks", "logs"]) fs.mkdirSync(path.join(W, d));
fs.writeFileSync(path.join(W, "config/repositories.yaml"), '{"repositories":{}}');

let seen = [];
let tenantHasCloudId = true;
let probeStatus = null; // force a status on GET /rest/api/2/myself at the site URL (e.g. 500)
const issue = { key: "EL-1", fields: { summary: "Reminders", issuetype: { name: "Story" }, status: { name: "To Do" }, description: "d" } };
const srv = http.createServer((req, res) => {
  seen.push(req.url);
  const send = (s, b) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
  if (req.url === "/_edge/tenant_info") return tenantHasCloudId ? send(200, { cloudId: CLOUD_ID }) : send(200, {});
  const gw = req.url.startsWith(`/ex/jira/${CLOUD_ID}`);
  const apiPath = gw ? req.url.slice(`/ex/jira/${CLOUD_ID}`.length) : req.url;
  const a = req.headers.authorization;
  // site URL: classic only (a scoped token is anonymous); gateway: scoped (or classic) accepted
  const allowed = gw ? a === SCOPED || a === CLASSIC : a === CLASSIC;
  if (!gw && probeStatus && apiPath === "/rest/api/2/myself") return send(probeStatus, {});
  if (!allowed) return send(401, {});
  if (apiPath === "/rest/api/2/myself") return send(200, { displayName: "Me" });
  if (apiPath === "/rest/api/2/field") return send(200, []);
  if (apiPath.startsWith("/rest/api/2/issue/EL-1?")) return send(200, issue);
  send(404, { errorMessages: ["Issue does not exist"] });
});

const run = (args, env) => new Promise((resolve) => {
  const p = spawn(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH, AISDLC_ROOT: W, ...env } });
  let out = ""; p.stdout.on("data", (d) => (out += d));
  p.on("close", (code) => { let j = {}; try { j = JSON.parse(out); } catch {} resolve({ code, out: out.trim(), j }); });
});
let fail = 0;
const t = (name, ok) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };
const E = (token) => ({ JIRA_EMAIL: "me@x.com", JIRA_API_TOKEN: token });

srv.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  const cfg = (extra = {}) => fs.writeFileSync(path.join(W, "config/integrations.yaml"), JSON.stringify({ jira: { base_url: base, gateway_url: base, ...extra } }));
  const gwHits = () => seen.filter((u) => u.startsWith("/ex/jira/"));
  let r;

  // classic token, auto route: site URL, no gateway traffic
  cfg(); seen = [];
  r = await run(["issue", "EL-1"], E("classic-tok"));
  t("classic token: issue fetched", r.code === 0 && r.j.ok && r.j.issue.summary === "Reminders");
  t("classic token: stays on the site URL (no tenant_info, no gateway)", !seen.includes("/_edge/tenant_info") && gwHits().length === 0);

  // scoped token, auto route: probe 401 -> tenant_info -> gateway
  seen = [];
  r = await run(["issue", "EL-1"], E("scoped-tok"));
  t("scoped token: issue fetched through the gateway", r.code === 0 && r.j.ok && r.j.issue.summary === "Reminders");
  t("scoped token: probe, then tenant_info, then gateway", seen[0] === "/rest/api/2/myself" && seen[1] === "/_edge/tenant_info" && gwHits().length > 0);
  t("scoped token: browse link still uses the site URL", r.j.source && r.j.source.url === `${base}/browse/EL-1`);
  r = await run(["check"], E("scoped-tok"));
  t("check reports the route (gateway)", r.code === 0 && r.j.connected === true && r.j.route === "gateway");
  r = await run(["check"], E("classic-tok"));
  t("check reports the route (site)", r.code === 0 && r.j.route === "site");

  // api_route "gateway" + cloud_id: no probe, no tenant_info
  cfg({ api_route: "gateway", cloud_id: CLOUD_ID }); seen = [];
  r = await run(["issue", "EL-1"], E("scoped-tok"));
  t("api_route gateway + cloud_id: fetched without a probe or tenant_info", r.code === 0 && r.j.ok && !seen.includes("/_edge/tenant_info") && seen.every((u) => u.startsWith("/ex/jira/")));

  // api_route "site" with a scoped token: no gateway fallback, a clear 401
  cfg({ api_route: "site" }); seen = [];
  r = await run(["issue", "EL-1"], E("scoped-tok"));
  t("api_route site: scoped token is refused, no gateway fallback", r.code === 1 && r.j.status === 401 && gwHits().length === 0 && !seen.includes("/_edge/tenant_info"));

  // bearer (Data Center): never probes or uses the gateway
  cfg({ auth_scheme: "bearer" }); seen = [];
  r = await run(["issue", "EL-1"], { JIRA_API_TOKEN: "classic-tok" });
  t("bearer scheme: no probe, no gateway", seen.every((u) => !u.startsWith("/ex/jira/") && u !== "/_edge/tenant_info" && u !== "/rest/api/2/myself"));

  // wrong token on both routes: a 401 with a credentials hint, exit 1
  cfg(); seen = [];
  r = await run(["issue", "EL-1"], E("wrong-tok"));
  t("bad token: 401 with a credentials hint", r.code === 1 && r.j.status === 401 && /JIRA_API_TOKEN/.test(r.j.hint || ""));
  t("bad token: the token is never printed", !r.out.includes("wrong-tok"));

  // the probe failing for another reason is a real error, not a reason to try the gateway
  probeStatus = 500; seen = [];
  r = await run(["issue", "EL-1"], E("classic-tok"));
  t("probe 500: reported as an error, gateway not tried", r.code === 1 && r.j.status === 500 && gwHits().length === 0 && !seen.includes("/_edge/tenant_info"));
  probeStatus = null;

  // a site that does not publish a cloud id
  tenantHasCloudId = false; seen = [];
  r = await run(["issue", "EL-1"], E("scoped-tok"));
  t("no cloud id: clear error telling to set jira.cloud_id", r.code === 1 && /cloud id/.test(r.j.error || "") && /cloud_id/.test(r.j.hint || ""));
  tenantHasCloudId = true;

  // a missing issue on the gateway is a 404, not a routing problem
  cfg();
  r = await run(["issue", "EL-404"], E("scoped-tok"));
  t("gateway 404 is reported as not found", r.code === 1 && r.j.status === 404);

  // dry run needs no credentials and no network
  seen = [];
  r = await run(["issue", "EL-1", "--dry-run"], {});
  t("dry run: no credentials, no requests made", r.code === 0 && r.j.dry_run === true && seen.length === 0);

  srv.close(); fs.rmSync(W, { recursive: true, force: true });
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
});
