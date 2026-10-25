#!/usr/bin/env node
// Bitbucket Cloud pull request helper (REST API). Credentials come from environment variables only
// (names in config/integrations.yaml, git_hosting.credentials); values are never printed.
//
//   comment <repo-path> <pr-id> <file|-> <line> <text-file>         add a PR comment (inline when file is not "-")
//   create <repo-path> <source> <dest> <title> <description-file> [--draft]
//                                                                   create a PR (or report the existing open one);
//                                                                   --draft opens it as a draft pull request
//   status <repo-path> <pr-id>                                      print state, draft flag and source/destination
//
// Output: one JSON line. Exit codes: 0 ok, 1 error, 2 credentials missing.
const fs = require("fs");
const { execFileSync } = require("child_process");

const API = "https://api.bitbucket.org/2.0";
// Exit after stdout is flushed and the HTTP sockets have closed (an immediate process.exit trips a libuv assertion on Windows).
// Throwing a sentinel stops the caller's flow, so nothing after out() runs.
class Done extends Error {}
const out = (o, code = 0) => {
  console.log(JSON.stringify(o));
  process.exitCode = code;
  throw new Done();
};

const email = process.env.BITBUCKET_EMAIL;
const token = process.env.BITBUCKET_API_TOKEN;
const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

function repoSlug(repoPath) {
  const url = execFileSync("git", ["-C", repoPath, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  const m = url.match(/bitbucket\.org[:/]+([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) out({ ok: false, error: "origin is not a bitbucket.org remote" }, 1);
  return `${m[1]}/${m[2]}`;
}

async function call(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) out({ ok: false, status: r.status, error: String(json.error?.message || "request failed").slice(0, 300) }, 1);
  return json;
}

const q = (s) => encodeURIComponent(s);

async function main() {
  if (!email || !token) out({ ok: false, error: "BITBUCKET_EMAIL and BITBUCKET_API_TOKEN must both be set" }, 2);
  const [cmd, repoPath, ...rest] = process.argv.slice(2);
  if (!cmd || !repoPath) out({ ok: false, error: "usage: create|status <repo-path> ..." }, 1);
  const slug = repoSlug(repoPath);

  if (cmd === "create") {
    const draft = rest.includes("--draft");
    const [source, dest, title, descFile] = rest.filter((a) => a !== "--draft");
    if (!source || !dest || !title || !descFile) out({ ok: false, error: "usage: create <repo-path> <source> <dest> <title> <description-file> [--draft]" }, 1);
    const filter = `state="OPEN" AND source.branch.name="${source}" AND destination.branch.name="${dest}"`;
    const existing = await call("GET", `/repositories/${slug}/pullrequests?q=${q(filter)}&fields=values.id,values.links.html.href`);
    if (existing.values?.length) {
      const pr = existing.values[0];
      out({ ok: true, existing: true, id: pr.id, url: pr.links.html.href });
    }
    const pr = await call("POST", `/repositories/${slug}/pullrequests`, {
      title,
      description: fs.readFileSync(descFile, "utf8"),
      source: { branch: { name: source } },
      destination: { branch: { name: dest } },
      close_source_branch: false,
      ...(draft ? { draft: true } : {}),
    });
    out({ ok: true, existing: false, id: pr.id, url: pr.links.html.href, source, destination: dest, draft: Boolean(pr.draft) });
  } else if (cmd === "status") {
    const pr = await call("GET", `/repositories/${slug}/pullrequests/${q(rest[0])}?fields=id,state,draft,source.branch.name,destination.branch.name,links.html.href`);
    out({ ok: true, id: pr.id, state: pr.state, draft: Boolean(pr.draft), source: pr.source.branch.name, destination: pr.destination.branch.name, url: pr.links.html.href });
  } else if (cmd === "comment") {
    const [prId, file, line, textFile] = rest;
    if (!prId || !file || !line || !textFile) out({ ok: false, error: "usage: comment <repo-path> <pr-id> <file|-> <line> <text-file>" }, 1);
    const body = { content: { raw: fs.readFileSync(textFile, "utf8") } };
    if (file !== "-") body.inline = { path: file, to: Number(line) };
    const c = await call("POST", `/repositories/${slug}/pullrequests/${q(prId)}/comments`, body);
    out({ ok: true, id: c.id, inline: Boolean(body.inline), url: c.links?.html?.href });
  } else out({ ok: false, error: `unknown command ${cmd}` }, 1);
}
main().catch((e) => {
  if (e instanceof Done) return;
  console.log(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 300) }));
  process.exitCode = 1;
});
