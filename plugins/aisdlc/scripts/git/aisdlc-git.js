#!/usr/bin/env node
// Git helper for the shared aisdlc repo. Deterministic: the skills call it, and the plugin's hook enforces the same rules.
//
//   node aisdlc-git.js status                       what would be committed (workflow paths only) and the tickets involved
//   node aisdlc-git.js commit --message "KEY: text" stage the workflow paths and commit (one single-line message)
//   node aisdlc-git.js push                         pull first (see below), then git push (sets the upstream when there is none); never force
//   node aisdlc-git.js pull [--role ROLE]           git pull --rebase --autostash, then what is waiting for the role
// A merge conflict is never resolved or aborted by this script: it stops, leaves git as it is and tells the person how to fix it.
//
// Only these folders are ever staged: tasks/ designs/ system/ repositories/ config/. Env files, logs, QA tests and
// anything else stay out. Commits go to the current branch (normally main); there are no ticket branches.
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const flow = require("../flow/flow");

const ALLOWED = ["tasks", "designs", "system", "repositories", "config"];
const MSG_RE = /^([A-Z][A-Z0-9]*-\d+): (\S.*)$/;

const root = resolveRoot();
if (!root) {
  console.error(NOT_WORKSPACE);
  process.exit(2);
}
const out = (o, code = 0) => {
  console.log(JSON.stringify(o, null, 2));
  process.exit(code);
};
const git = (...a) =>
  execFileSync("git", a, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const tryGit = (...a) => {
  try {
    return git(...a);
  } catch {
    return null;
  }
};

const [cmd, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i++)
  if (rest[i].startsWith("--")) {
    opt[rest[i].slice(2)] =
      rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true;
  }

if (!tryGit("rev-parse", "--is-inside-work-tree"))
  out(
    {
      ok: false,
      error:
        "this folder is not a git repository (git init, and add the remote)",
    },
    2,
  );
const branch = tryGit("rev-parse", "--abbrev-ref", "HEAD");
const hasRemote = !!tryGit("remote");

function changed() {
  // not trimmed: a leading space is part of the first line's status code (" M path")
  const txt = execFileSync(
    "git",
    ["status", "--porcelain=v1", "-uall", "--", ...ALLOWED],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return txt
    .split("\n")
    .filter(Boolean)
    .map((l) => ({
      code: l.slice(0, 2).trim(),
      file: l.slice(3).replace(/^"|"$/g, ""),
    }));
}
const ticketsOf = (files) => [
  ...new Set(
    files
      .map(
        (f) =>
          (f.file.match(/^(?:tasks|designs)\/([A-Z][A-Z0-9]*-\d+)\//) || [])[1],
      )
      .filter(Boolean),
  ),
];

if (cmd === "status") {
  const files = changed();
  out({
    ok: true,
    branch,
    remote: hasRemote,
    files,
    tickets: ticketsOf(files),
  });
}

if (cmd === "commit") {
  const msg = typeof opt.message === "string" ? opt.message : "";
  const m = msg.match(MSG_RE);
  if (!m || msg.includes("\n"))
    out(
      {
        ok: false,
        error:
          "message must be one line: '<TICKET>: <summary>' (e.g. EL-101: Add acceptance criteria)",
      },
      2,
    );
  const files = changed();
  if (!files.length)
    out(
      {
        ok: false,
        error:
          "nothing to commit in tasks/, designs/, system/, repositories/ or config/",
      },
      2,
    );
  const tickets = ticketsOf(files);
  if (tickets.length && !tickets.includes(m[1]))
    out(
      {
        ok: false,
        error: `message ticket ${m[1]} is not among the changed tickets (${tickets.join(", ")})`,
      },
      2,
    );
  git("add", "--", ...ALLOWED);
  const r = spawnSync("git", ["commit", "-m", msg], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0)
    out(
      {
        ok: false,
        error: (r.stderr || r.stdout || "git commit failed").trim(),
      },
      2,
    );
  out({
    ok: true,
    commit: git("rev-parse", "--short", "HEAD"),
    branch,
    files: files.length,
  });
}

// Bring in the latest changes first (rebase, with uncommitted workflow files set aside and restored). A conflict is never
// resolved or aborted here: the repository is left as git leaves it and the person fixes it by hand.
const gitDir = path.resolve(root, tryGit("rev-parse", "--git-dir") || ".git");
const midOperation = () =>
  ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD"].some((n) =>
    fs.existsSync(path.join(gitDir, n)),
  );
const CONFLICT_HELP =
  "Nothing was discarded. Resolve it by hand: run 'git status', fix the files listed as conflicted, 'git add' them, then 'git rebase --continue' (or 'git rebase --abort' to go back), and run /aisdlc:push again.";

function integrate() {
  if (!hasRemote)
    return {
      ok: false,
      error: "no git remote configured (git remote add origin <url>)",
    };
  if (midOperation())
    return {
      ok: false,
      conflict: true,
      error:
        "A merge or rebase is already in progress in this repository. " +
        CONFLICT_HELP,
    };
  const upstream = tryGit(
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  );
  let args = ["pull", "--rebase", "--autostash"];
  if (!upstream) {
    if (!tryGit("ls-remote", "--heads", "origin", branch))
      return { ok: true, updated: false, first: true }; // the remote has no such branch yet
    args = ["pull", "--rebase", "--autostash", "origin", branch];
  }
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const text = ((r.stdout || "") + "\n" + (r.stderr || "")).trim();
  if (r.status !== 0) {
    const conflict =
      midOperation() || /CONFLICT|could not apply|merge conflict/i.test(text);
    return {
      ok: false,
      conflict,
      error: conflict
        ? "Merge conflict while bringing in the latest changes. " +
          CONFLICT_HELP +
          "\n" +
          text
        : text,
    };
  }
  return { ok: true, updated: !/up to date/i.test(text) };
}

if (cmd === "push") {
  const i = integrate();
  if (!i.ok) out(i, 2);
  const upstream = tryGit(
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  );
  const r = spawnSync(
    "git",
    upstream ? ["push"] : ["push", "-u", "origin", branch],
    { cwd: root, encoding: "utf8" },
  );
  if (r.status !== 0)
    out(
      {
        ok: false,
        error: (
          (r.stderr || r.stdout) +
          "\nThe remote changed again while pushing; run /aisdlc:push once more."
        ).trim(),
      },
      2,
    );
  out({ ok: true, branch, pulled: i.updated, pushed: true });
}

if (cmd === "pull") {
  const i = integrate();
  if (!i.ok) out(i, 2);
  for (const t of flow.tickets(root)) flow.writeChanges(root, t); // regenerate the local changes.md views
  const role = flow.resolveRole(root, opt.role);
  out({
    ok: true,
    updated: i.updated,
    role,
    waiting: flow.summary(root, role),
  });
}

out(
  {
    ok: false,
    error:
      "usage: aisdlc-git.js status|commit --message M|push|pull [--role R]",
  },
  2,
);
