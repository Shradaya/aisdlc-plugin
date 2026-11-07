#!/usr/bin/env node
// Bitbucket Cloud pull request helper (REST API). Credentials come from environment variables only
// (names in config/integrations.yaml, git_hosting.credentials); values are never printed.
//
//   comment <repo-path> <pr-id> <file|-> <line> <text-file> [--parent <comment-id>]
//                                                                   add a PR comment (inline when file is not "-");
//                                                                   --parent posts it as a reply to that comment
//   comments <repo-path> <pr-id>                                    read-only: all live comments (id, parent, author, file,
//                                                                   line, text, resolved) as one JSON line
//   create <repo-path> <source> <dest> <title> <description-file> [--draft]
//                                                                   create a PR (or report the existing open one);
//                                                                   --draft opens it as a draft pull request
//   status <repo-path> <pr-id>                                      print state, draft flag and source/destination
//   find <repo-path> <source> <dest>                                read-only: the open PR from <source> into <dest>, if any
//
// Output: one JSON line. Exit codes: 0 ok, 1 error, 2 credentials missing.
const fs = require("fs");
const { execFileSync } = require("child_process");

// AISDLC_BITBUCKET_API points the helper at a local mock for tests; it is never set in normal use.
const API = process.env.AISDLC_BITBUCKET_API || "https://api.bitbucket.org/2.0";

// Finishing the process reliably on Windows is the whole trick here.
//   - We must print exactly one JSON line and have it captured by the caller.
//   - We must exit with the intended code (0/1/2), not hang.
// Three historical failure modes to avoid:
//   1. Calling process.exit() while a handle is mid-close (the undici/fetch socket tearing down)
//      trips "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" on Windows. So we must NOT
//      hard-exit on the network paths; we let the loop end on its own once nothing keeps it alive.
//   2. Relying on the loop to drain naturally while fetch's keepalive socket stays open: the process
//      lingers, the caller times out (exit code -1) and buffered stdout is lost. Fixed by closing
//      undici's global dispatcher (destroyConnections) after the response so no socket lingers.
//   3. Losing stdout if the process ends before the OS buffer flushed. Fixed by writing with a
//      drain callback and setting process.exitCode (not process.exit) so the natural exit uses it.
// Flow: out() records the result and code and throws a Done sentinel to unwind; the single top-level
// finalizer writes the JSON line, sets process.exitCode, and tears down the HTTP agent so the loop
// can end cleanly with that code.
class Done extends Error {}
let RESULT = null; // { payload, code }
const out = (o, code = 0) => {
  RESULT = { payload: o, code };
  throw new Done();
};

// Best-effort teardown of Node's global fetch (undici) dispatcher so no keepalive socket keeps the
// event loop alive. Guarded: older/newer runtimes may not expose these symbols.
async function closeHttp() {
  try {
    const sym = Object.getOwnPropertySymbols(globalThis).find(
      (s) => s.description === "undici.globalDispatcher.1",
    );
    const dispatcher = sym && globalThis[sym];
    if (dispatcher && typeof dispatcher.close === "function") {
      await dispatcher.close();
    }
  } catch {
    // ignore: if we cannot close it, the setTimeout safety net below still bounds the run.
  }
}

// Write one line to stdout, flush it, set the exit code, then let the loop end naturally.
// A hard process.exit() is avoided here because it crashes on Windows when the HTTP socket is
// mid-close (failure mode 1 above). If something still holds the loop open, the unref'd timer
// forces an exit as a last resort well after any in-flight teardown has settled.
async function finish(payload, code) {
  const line = JSON.stringify(payload) + "\n";
  process.exitCode = code;
  await new Promise((resolve) => process.stdout.write(line, resolve));
  await closeHttp();
  setTimeout(() => process.exit(code), 3000).unref();
}

const email = process.env.BITBUCKET_EMAIL;
const token = process.env.BITBUCKET_API_TOKEN;
const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

function repoSlug(repoPath) {
  const url = execFileSync(
    "git",
    ["-C", repoPath, "remote", "get-url", "origin"],
    { encoding: "utf8" },
  ).trim();
  const m = url.match(/bitbucket\.org[:/]+([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) out({ ok: false, error: "origin is not a bitbucket.org remote" }, 1);
  return `${m[1]}/${m[2]}`;
}

async function call(method, path, body) {
  const r = await fetch(API + path, {
    method,
    // keepalive:false so the connection does not hold the event loop open after the response is read.
    keepalive: false,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      Connection: "close",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok)
    out(
      {
        ok: false,
        status: r.status,
        error: String(json.error?.message || "request failed").slice(0, 300),
      },
      1,
    );
  return json;
}

const q = (s) => encodeURIComponent(s);

async function main() {
  if (!email || !token)
    out(
      {
        ok: false,
        error: "BITBUCKET_EMAIL and BITBUCKET_API_TOKEN must both be set",
      },
      2,
    );
  const [cmd, repoPath, ...rest] = process.argv.slice(2);
  if (!cmd || !repoPath)
    out(
      {
        ok: false,
        error: "usage: create|status|find|comment|comments <repo-path> ...",
      },
      1,
    );
  const slug = repoSlug(repoPath);

  if (cmd === "create") {
    const draft = rest.includes("--draft");
    const [source, dest, title, descFile] = rest.filter((a) => a !== "--draft");
    if (!source || !dest || !title || !descFile)
      out(
        {
          ok: false,
          error:
            "usage: create <repo-path> <source> <dest> <title> <description-file> [--draft]",
        },
        1,
      );
    const filter = `state="OPEN" AND source.branch.name="${source}" AND destination.branch.name="${dest}"`;
    const existing = await call(
      "GET",
      `/repositories/${slug}/pullrequests?q=${q(filter)}&fields=values.id,values.links.html.href`,
    );
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
    out({
      ok: true,
      existing: false,
      id: pr.id,
      url: pr.links.html.href,
      source,
      destination: dest,
      draft: Boolean(pr.draft),
    });
  } else if (cmd === "find") {
    const [source, dest] = rest;
    if (!source || !dest)
      out({ ok: false, error: "usage: find <repo-path> <source> <dest>" }, 1);
    const filter = `state="OPEN" AND source.branch.name="${source}" AND destination.branch.name="${dest}"`;
    const found = await call(
      "GET",
      `/repositories/${slug}/pullrequests?q=${q(filter)}&fields=values.id,values.draft,values.links.html.href`,
    );
    const pr = found.values?.[0];
    out(
      pr
        ? {
            ok: true,
            found: true,
            id: pr.id,
            url: pr.links.html.href,
            draft: Boolean(pr.draft),
            source,
            destination: dest,
          }
        : { ok: true, found: false, source, destination: dest },
    );
  } else if (cmd === "status") {
    const pr = await call(
      "GET",
      `/repositories/${slug}/pullrequests/${q(rest[0])}?fields=id,state,draft,source.branch.name,destination.branch.name,links.html.href`,
    );
    out({
      ok: true,
      id: pr.id,
      state: pr.state,
      draft: Boolean(pr.draft),
      source: pr.source.branch.name,
      destination: pr.destination.branch.name,
      url: pr.links.html.href,
    });
  } else if (cmd === "comments") {
    if (!rest[0])
      out({ ok: false, error: "usage: comments <repo-path> <pr-id>" }, 1);
    const fields =
      "next,values.id,values.parent.id,values.deleted,values.resolution,values.user.display_name,values.content.raw,values.inline.path,values.inline.to";
    let url = `/repositories/${slug}/pullrequests/${q(rest[0])}/comments?pagelen=100&fields=${q(fields)}`;
    const all = [];
    for (let page = 0; url && page < 20; page++) {
      const j = await call("GET", url);
      all.push(...(j.values || []));
      url = j.next
        ? j.next
            .replace(/^https?:\/\/[^/]+\/2\.0/, "")
            .replace(/^https?:\/\/[^/]+/, "")
        : null;
    }
    const comments = all
      .filter((c) => !c.deleted)
      .map((c) => ({
        id: c.id,
        parent: c.parent?.id ?? null,
        author: c.user?.display_name || "unknown",
        file: c.inline?.path ?? null,
        line: c.inline?.to ?? null,
        resolved: Boolean(c.resolution),
        text: String(c.content?.raw || "").slice(0, 2000),
      }));
    out({ ok: true, count: comments.length, comments });
  } else if (cmd === "comment") {
    const pi = rest.indexOf("--parent");
    const parent = pi >= 0 ? rest[pi + 1] : null;
    if (pi >= 0 && !/^\d+$/.test(parent || ""))
      out({ ok: false, error: "--parent needs a numeric comment id" }, 1);
    const [prId, file, line, textFile] =
      pi >= 0 ? rest.filter((_, i) => i !== pi && i !== pi + 1) : rest;
    if (!prId || !file || !line || !textFile)
      out(
        {
          ok: false,
          error:
            "usage: comment <repo-path> <pr-id> <file|-> <line> <text-file>",
        },
        1,
      );
    const body = { content: { raw: fs.readFileSync(textFile, "utf8") } };
    if (file !== "-") body.inline = { path: file, to: Number(line) };
    if (parent) body.parent = { id: Number(parent) };
    const c = await call(
      "POST",
      `/repositories/${slug}/pullrequests/${q(prId)}/comments`,
      body,
    );
    out({
      ok: true,
      id: c.id,
      inline: Boolean(body.inline),
      url: c.links?.html?.href,
    });
  } else out({ ok: false, error: `unknown command ${cmd}` }, 1);
}

main()
  .then(() => {
    // main always finishes by calling out() (which throws Done); reaching here means no result was
    // recorded, which is a logic error.
    if (!RESULT)
      RESULT = { payload: { ok: false, error: "no result produced" }, code: 1 };
  })
  .catch((e) => {
    if (e instanceof Done) return; // expected unwind; RESULT is already set
    RESULT = {
      payload: { ok: false, error: String(e.message || e).slice(0, 300) },
      code: 1,
    };
  })
  .finally(() => {
    finish(RESULT.payload, RESULT.code);
  });
