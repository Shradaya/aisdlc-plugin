#!/usr/bin/env node
// Acceptance tests for `bitbucket-pr.js decline-pr` against a local mock of the Bitbucket Cloud API (AISDLC_BITBUCKET_API):
// both argument forms (`decline-pr <pr-id>` in the repo folder, `decline-pr <repo-name|repo-path> <pr-id>`), only an open PR
// is declined, an already declined PR is reported without a second decline, and a merged PR is refused.
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync, spawn } = require("child_process");
const SCRIPT = path.resolve(__dirname, "..", "git-hosting", "bitbucket-pr.js");

const W = fs.mkdtempSync(path.join(os.tmpdir(), "bb-decline-"));
const REPO = path.join(W, "widgets");
fs.mkdirSync(REPO);
execFileSync("git", ["init", "-q", "-b", "main", REPO]);
execFileSync("git", ["-C", REPO, "remote", "add", "origin", "git@bitbucket.org:acme/widgets.git"]);
// A workspace that registers the repository by name, so `decline-pr widgets <id>` can resolve it
const WS = path.join(W, "workspace");
fs.mkdirSync(path.join(WS, "config"), { recursive: true });
fs.writeFileSync(path.join(WS, "config", "repositories.yaml"), JSON.stringify({ repositories: { widgets: { path: REPO } } }));
const AUTH = "Basic " + Buffer.from("me@x.com:tok").toString("base64");

let prs;
const reset = () => {
  prs = {
    5: { state: "OPEN", title: "EL-1: Open one", source: "EL-1", destination: "lf-qa" },
    6: { state: "DECLINED", title: "EL-1: Declined one", source: "EL-1", destination: "lf-develop" },
    7: { state: "MERGED", title: "EL-1: Merged one", source: "EL-1", destination: "lf-uat" },
  };
};
const seen = [];
const view = (id) => {
  const p = prs[id];
  return { id: Number(id), state: p.state, title: p.title, source: { branch: { name: p.source } }, destination: { branch: { name: p.destination } },
    links: { html: { href: `https://bitbucket.org/acme/widgets/pull-requests/${id}` } } };
};
const srv = http.createServer((req, res) => {
  seen.push(`${req.method} ${req.url}`);
  const send = (s, b) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
  if (req.headers.authorization !== AUTH) return send(401, { error: { message: "bad credentials" } });
  const u = new URL(req.url, "http://x");
  let m = u.pathname.match(/^\/repositories\/acme\/widgets\/pullrequests\/(\d+)$/);
  if (req.method === "GET" && m) return prs[m[1]] ? send(200, view(m[1])) : send(404, { error: { message: "not found" } });
  m = u.pathname.match(/^\/repositories\/acme\/widgets\/pullrequests\/(\d+)\/decline$/);
  if (req.method === "POST" && m) {
    if (!prs[m[1]] || prs[m[1]].state !== "OPEN") return send(400, { error: { message: "only open PRs can be declined" } });
    prs[m[1]].state = "DECLINED";
    return send(200, view(m[1]));
  }
  send(500, { error: { message: "unexpected request " + req.method + " " + req.url } });
});

const run = (args, env, cwd = W) => new Promise((resolve) => {
  const p = spawn(process.execPath, [SCRIPT, ...args], { cwd, env: { PATH: process.env.PATH, ...env } });
  let out = ""; p.stdout.on("data", (d) => (out += d));
  p.on("close", (code) => { let j = {}; try { j = JSON.parse(out); } catch {} resolve({ code, out: out.trim(), j }); });
});
const posts = () => seen.filter((s) => s.startsWith("POST "));
let fail = 0;
const t = (name, ok) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };

srv.listen(0, async () => {
  const env = { AISDLC_BITBUCKET_API: `http://127.0.0.1:${srv.address().port}`, BITBUCKET_EMAIL: "me@x.com", BITBUCKET_API_TOKEN: "tok" };

  reset(); seen.length = 0;
  let r = await run(["decline-pr", "5"], env, REPO);
  t("decline-pr <pr-id> declines an open PR of the repo in the current folder", r.code === 0 && r.j.declined === true && r.j.state === "DECLINED"
    && r.j.id === 5 && r.j.source === "EL-1" && r.j.destination === "lf-qa" && posts().length === 1 && /\/pullrequests\/5\/decline$/.test(posts()[0]));

  reset(); seen.length = 0;
  r = await run(["decline-pr", REPO, "5"], env);
  t("decline-pr <repo-path> <pr-id> declines it", r.code === 0 && r.j.declined === true && posts().length === 1);

  reset(); seen.length = 0;
  r = await run(["decline-pr", "widgets", "5"], { ...env, AISDLC_ROOT: WS });
  t("decline-pr <repo-name> <pr-id> resolves a registered repository and declines it", r.code === 0 && r.j.declined === true && posts().length === 1);

  reset(); seen.length = 0;
  r = await run(["decline-pr", REPO, "6"], env);
  t("an already declined PR is reported, not declined again", r.code === 0 && r.j.ok === true && r.j.declined === false
    && r.j.already_declined === true && posts().length === 0);

  reset(); seen.length = 0;
  r = await run(["decline-pr", REPO, "7"], env);
  t("a merged PR is refused and nothing is posted", r.code === 1 && r.j.ok === false && r.j.state === "MERGED" && /only an open PR/.test(r.j.error) && posts().length === 0);

  reset(); seen.length = 0;
  r = await run(["decline-pr", REPO, "abc"], env);
  t("a non-numeric PR id is a usage error, nothing is called", r.code === 1 && /usage/.test(r.j.error) && seen.length === 0);

  r = await run(["decline-pr", "nope", "5"], { ...env, AISDLC_ROOT: WS });
  t("an unknown repository name is a clear error", r.code === 1 && /unknown repository nope/.test(r.j.error));

  r = await run(["decline-pr"], env);
  t("no arguments is a usage error", r.code === 1 && /usage: decline-pr/.test(r.j.error));

  reset();
  r = await run(["decline-pr", REPO, "5"], { ...env, BITBUCKET_API_TOKEN: "wrong" });
  t("bad credentials: a clear failure, token never printed", r.code === 1 && r.j.status === 401 && !r.out.includes("wrong"));

  r = await run(["decline-pr", REPO, "5"], { AISDLC_BITBUCKET_API: env.AISDLC_BITBUCKET_API });
  t("missing credentials exit 2", r.code === 2);

  srv.close(); fs.rmSync(W, { recursive: true, force: true });
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
});
