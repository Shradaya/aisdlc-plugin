#!/usr/bin/env node
// Acceptance tests for `bitbucket-pr.js find` against a local mock of the Bitbucket Cloud API (AISDLC_BITBUCKET_API).
// `find` is read-only: it must never create or change a pull request.
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync, spawn } = require("child_process");
const SCRIPT = path.resolve(__dirname, "..", "git-hosting", "bitbucket-pr.js");

const W = fs.mkdtempSync(path.join(os.tmpdir(), "bb-find-"));
const REPO = path.join(W, "repo");
fs.mkdirSync(REPO);
execFileSync("git", ["init", "-q", "-b", "main", REPO]);
execFileSync("git", ["-C", REPO, "remote", "add", "origin", "git@bitbucket.org:acme/widgets.git"]);
const AUTH = "Basic " + Buffer.from("me@x.com:tok").toString("base64");

const seen = [];
const srv = http.createServer((req, res) => {
  seen.push(`${req.method} ${req.url}`);
  const send = (s, b) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
  if (req.headers.authorization !== AUTH) return send(401, { error: { message: "bad credentials" } });
  const u = new URL(req.url, "http://x");
  if (req.method === "GET" && u.pathname === "/repositories/acme/widgets/pullrequests") {
    const q = u.searchParams.get("q") || "";
    if (/source\.branch\.name="main"/.test(q) && /destination\.branch\.name="lf-qa"/.test(q))
      return send(200, { values: [{ id: 41, draft: false, links: { html: { href: "https://bitbucket.org/acme/widgets/pull-requests/41" } } }] });
    if (/source\.branch\.name="main-qa-20261105"/.test(q) && /destination\.branch\.name="lf-qa"/.test(q))
      return send(200, { values: [{ id: 42, draft: true, links: { html: { href: "https://bitbucket.org/acme/widgets/pull-requests/42" } } }] });
    return send(200, { values: [] });
  }
  send(500, { error: { message: "unexpected request " + req.method + " " + req.url } });
});

const run = (args, env) => new Promise((resolve) => {
  const p = spawn(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH, ...env } });
  let out = ""; p.stdout.on("data", (d) => (out += d));
  p.on("close", (code) => { let j = {}; try { j = JSON.parse(out); } catch {} resolve({ code, out: out.trim(), j }); });
});
let fail = 0;
const t = (name, ok) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };

srv.listen(0, async () => {
  const env = { AISDLC_BITBUCKET_API: `http://127.0.0.1:${srv.address().port}`, BITBUCKET_EMAIL: "me@x.com", BITBUCKET_API_TOKEN: "tok" };
  let r = await run(["find", REPO, "main", "lf-qa"], env);
  t("an open PR is found with its id, url and draft flag", r.code === 0 && r.j.found === true && r.j.id === 41 && /pull-requests\/41$/.test(r.j.url) && r.j.draft === false);
  r = await run(["find", REPO, "main-qa-20261105", "lf-qa"], env);
  t("a draft PR is reported as a draft", r.code === 0 && r.j.found === true && r.j.id === 42 && r.j.draft === true);
  r = await run(["find", REPO, "main", "lf-uat"], env);
  t("no open PR: found is false, still exit 0", r.code === 0 && r.j.ok === true && r.j.found === false);
  t("find only ever reads (GET), never creates or changes a PR", seen.length > 0 && seen.every((s) => s.startsWith("GET ")));
  r = await run(["find", REPO, "main"], env);
  t("a missing argument is a usage error", r.code === 1 && r.j.ok === false && /usage/.test(r.j.error));
  r = await run(["find", REPO, "main", "lf-qa"], { ...env, BITBUCKET_API_TOKEN: "wrong" });
  t("bad credentials: a clear failure, token never printed", r.code === 1 && r.j.ok === false && r.j.status === 401 && !r.out.includes("wrong"));
  r = await run(["find", REPO, "main", "lf-qa"], { AISDLC_BITBUCKET_API: env.AISDLC_BITBUCKET_API });
  t("missing credentials exit 2", r.code === 2);
  srv.close(); fs.rmSync(W, { recursive: true, force: true });
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
});
