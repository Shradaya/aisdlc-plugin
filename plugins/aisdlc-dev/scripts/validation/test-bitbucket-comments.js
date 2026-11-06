#!/usr/bin/env node
// Acceptance tests for `bitbucket-pr.js comments` (read-only) and `comment --parent` (reply) against a local mock
// of the Bitbucket Cloud API (AISDLC_BITBUCKET_API).
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync, spawn } = require("child_process");
const SCRIPT = path.resolve(__dirname, "..", "git-hosting", "bitbucket-pr.js");

const W = fs.mkdtempSync(path.join(os.tmpdir(), "bb-comments-"));
const REPO = path.join(W, "repo");
fs.mkdirSync(REPO);
execFileSync("git", ["init", "-q", "-b", "main", REPO]);
execFileSync("git", ["-C", REPO, "remote", "add", "origin", "git@bitbucket.org:acme/widgets.git"]);
fs.writeFileSync(path.join(W, "reply.txt"), "Done: fixed in abc123.");

const seen = [];
let posted = null;
const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (d) => chunks.push(d));
  req.on("end", () => {
    seen.push(`${req.method} ${req.url}`);
    const send = (s, b) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
    const u = new URL(req.url, "http://x");
    const base = "/repositories/acme/widgets/pullrequests/7/comments";
    if (req.method === "GET" && u.pathname === base) {
      if (!u.searchParams.get("page"))
        return send(200, {
          next: `http://127.0.0.1:${srv.address().port}${base}?page=2`,
          values: [
            { id: 1, user: { display_name: "Rae" }, content: { raw: "Issue: null deref." }, inline: { path: "src/a.js", to: 12 } },
            { id: 2, parent: { id: 1 }, user: { display_name: "Dev" }, content: { raw: "ok" } },
            { id: 3, deleted: true, user: { display_name: "Rae" }, content: { raw: "gone" } },
          ],
        });
      return send(200, { values: [{ id: 4, user: { display_name: "Rae" }, content: { raw: "General." }, resolution: { type: "x" } }] });
    }
    if (req.method === "POST" && u.pathname === base) {
      posted = JSON.parse(Buffer.concat(chunks).toString());
      return send(201, { id: 9, links: { html: { href: "https://bitbucket.org/c/9" } } });
    }
    send(500, { error: { message: "unexpected " + req.method + " " + req.url } });
  });
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
  let r = await run(["comments", REPO, "7"], env);
  t("comments follows pagination and drops deleted ones", r.code === 0 && r.j.count === 3 && r.j.comments.map((c) => c.id).join() === "1,2,4");
  t("an inline comment carries file and line", r.j.comments[0].file === "src/a.js" && r.j.comments[0].line === 12);
  t("a reply carries its parent id; resolved flag is set", r.j.comments[1].parent === 1 && r.j.comments[2].resolved === true && r.j.comments[0].resolved === false);
  t("comments only reads (GET)", seen.every((s) => s.startsWith("GET ")));
  r = await run(["comment", REPO, "7", "-", "0", path.join(W, "reply.txt"), "--parent", "1"], env);
  t("a reply is posted under its parent", r.code === 0 && r.j.id === 9 && posted.parent.id === 1 && !posted.inline && /Done/.test(posted.content.raw));
  r = await run(["comment", REPO, "7", "-", "0", path.join(W, "reply.txt"), "--parent", "abc"], env);
  t("a non-numeric parent is a usage error", r.code === 1 && /--parent/.test(r.j.error));
  r = await run(["comments", REPO], env);
  t("a missing PR id is a usage error", r.code === 1 && /usage/.test(r.j.error));
  r = await run(["comments", REPO, "7"], { AISDLC_BITBUCKET_API: env.AISDLC_BITBUCKET_API });
  t("missing credentials exit 2", r.code === 2);
  srv.close(); fs.rmSync(W, { recursive: true, force: true });
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
});
