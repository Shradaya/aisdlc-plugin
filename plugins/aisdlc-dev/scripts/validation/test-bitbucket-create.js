#!/usr/bin/env node
// Acceptance tests for `bitbucket-pr.js create` against a local mock of the Bitbucket Cloud API (AISDLC_BITBUCKET_API):
// a new PR carries the repository's default reviewers, the author is dropped when Bitbucket rejects them, a missing
// reviewer scope still creates the PR, and an open PR for the same branches is returned without a second POST.
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync, spawn } = require("child_process");
const SCRIPT = path.resolve(__dirname, "..", "git-hosting", "bitbucket-pr.js");

const W = fs.mkdtempSync(path.join(os.tmpdir(), "bb-create-"));
const REPO = path.join(W, "repo");
fs.mkdirSync(REPO);
execFileSync("git", ["init", "-q", "-b", "main", REPO]);
execFileSync("git", ["-C", REPO, "remote", "add", "origin", "git@bitbucket.org:acme/widgets.git"]);
const DESC = path.join(W, "desc.md");
fs.writeFileSync(DESC, "# Description\n\nTest PR\n");
const AUTH = "Basic " + Buffer.from("me@x.com:tok").toString("base64");

const ALICE = { uuid: "{a}", display_name: "Alice Reviewer" };
const BOB = { uuid: "{b}", display_name: "Bob Reviewer" };
const ME = { uuid: "{me}", display_name: "Pat Author" };

// Per-test mock behaviour
let mode = "normal";
let posts = [];
const seen = [];
const srv = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    seen.push(`${req.method} ${req.url}`);
    const send = (s, b) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
    if (req.headers.authorization !== AUTH) return send(401, { error: { message: "bad credentials" } });
    const u = new URL(req.url, "http://x");
    if (req.method === "GET" && u.pathname === "/repositories/acme/widgets/pullrequests") {
      if (mode === "existing") return send(200, { values: [{ id: 7, links: { html: { href: "https://bitbucket.org/acme/widgets/pull-requests/7" } } }] });
      return send(200, { values: [] });
    }
    if (req.method === "GET" && u.pathname === "/repositories/acme/widgets/effective-default-reviewers") {
      if (mode === "no-scope") return send(403, { error: { message: "forbidden" } });
      const users = mode === "author" ? [ALICE, ME, BOB] : [ALICE, BOB];
      return send(200, { values: users.map((user) => ({ user, reviewer_type: "repository" })) });
    }
    if (req.method === "POST" && u.pathname === "/repositories/acme/widgets/pullrequests") {
      const body = JSON.parse(raw || "{}");
      posts.push(body);
      const ids = (body.reviewers || []).map((r) => r.uuid);
      if (ids.includes(ME.uuid)) return send(400, { error: { message: `${ME.display_name} is the author and cannot be included as a reviewer.` } });
      const all = [ALICE, BOB, ME];
      return send(201, {
        id: 9, draft: Boolean(body.draft),
        reviewers: all.filter((x) => ids.includes(x.uuid)),
        links: { html: { href: "https://bitbucket.org/acme/widgets/pull-requests/9" } },
      });
    }
    send(500, { error: { message: "unexpected request " + req.method + " " + req.url } });
  });
});

const run = (args, env) => new Promise((resolve) => {
  const p = spawn(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH, ...env } });
  let out = ""; p.stdout.on("data", (d) => (out += d));
  p.on("close", (code) => { let j = {}; try { j = JSON.parse(out); } catch {} resolve({ code, out: out.trim(), j }); });
});
let fail = 0;
const t = (name, ok) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };
const create = (env, extra = []) => run(["create", REPO, "EL-1", "lf-qa", "EL-1: Test", DESC, ...extra], env);

srv.listen(0, async () => {
  const env = { AISDLC_BITBUCKET_API: `http://127.0.0.1:${srv.address().port}`, BITBUCKET_EMAIL: "me@x.com", BITBUCKET_API_TOKEN: "tok" };

  mode = "normal"; posts = [];
  let r = await create(env);
  t("a new PR is created with the repository's default reviewers", r.code === 0 && r.j.existing === false && r.j.id === 9
    && posts.length === 1 && posts[0].reviewers.map((x) => x.uuid).join() === "{a},{b}");
  t("the reviewer names are reported", JSON.stringify(r.j.reviewers) === JSON.stringify(["Alice Reviewer", "Bob Reviewer"]) && !r.j.reviewers_error);

  mode = "normal"; posts = [];
  r = await create(env, ["--draft"]);
  t("--draft still carries the default reviewers", r.code === 0 && r.j.draft === true && posts[0].draft === true && posts[0].reviewers.length === 2);

  mode = "author"; posts = [];
  r = await create(env);
  t("the author is dropped when Bitbucket rejects them, with one retry", r.code === 0 && posts.length === 2
    && !posts[1].reviewers.some((x) => x.uuid === ME.uuid) && r.j.reviewers.length === 2);

  mode = "no-scope"; posts = [];
  r = await create(env);
  t("without the scope to read default reviewers the PR is still created and the gap reported", r.code === 0 && r.j.id === 9
    && posts[0].reviewers.length === 0 && /default reviewers not read \(HTTP 403\)/.test(r.j.reviewers_error));

  mode = "existing"; posts = [];
  r = await create(env);
  t("an open PR for the same branches is returned, never duplicated", r.code === 0 && r.j.existing === true && r.j.id === 7 && posts.length === 0);

  r = await create({ ...env, BITBUCKET_API_TOKEN: "wrong" });
  t("bad credentials: a clear failure, token never printed", r.code === 1 && r.j.ok === false && !r.out.includes("wrong"));

  srv.close(); fs.rmSync(W, { recursive: true, force: true });
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
});
