#!/usr/bin/env node
// Git helper for the shared aisdlc repo. Deterministic: the skills call it, and the plugin's hook enforces the same rules.
//
//   node aisdlc-git.js status                       what would be committed (workflow paths only), the tickets and the branch
//   node aisdlc-git.js commit --message "KEY: text" stage the workflow paths and commit (one single-line message) on the current branch
//   node aisdlc-git.js push [--dry-run]             pull first (see below), then push the current branch (never force, never the
//                                                   base branch); --dry-run changes nothing
//   node aisdlc-git.js pull [--role ROLE]           get the latest of the current branch, then what is waiting for the role
//   node aisdlc-git.js help                         this text
// Anything else (an unknown command or flag) is refused without doing anything.
// A merge conflict is never resolved or aborted by this script: it stops, leaves git as it is and tells the person how to fix it.
//
// The team works on one branch (for example the sprint's S10), created and checked out by hand; every push and pull keeps
// the team in sync, and the work never reaches another branch. The base branch (main) is never committed or pushed to here.
// /aisdlc:push shows the branch and asks for confirmation before pushing it.
// Only these folders are ever staged: tasks/ designs/ system/ repositories/ config/. Env files, logs, QA tests and
// anything else stay out.
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const { baseBranch } = require("../lib/base");
const flow = require("../flow/flow");

const ALLOWED = ["tasks", "designs", "system", "repositories", "config"];
const MSG_RE = /^([A-Z][A-Z0-9]*-\d+): (\S.*)$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/;
const FLAGS = {
  status: {},
  commit: { message: "value" },
  push: { "dry-run": "bool" },
  pull: { role: "value" },
};
const USAGE =
  "usage: aisdlc-git.js status | commit --message M | push [--dry-run] | pull [--role R] | help";
const out = (o, code = 0) => {
  console.log(JSON.stringify(o, null, 2));
  process.exit(code);
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || ["help", "--help", "-h"].includes(cmd)) {
  console.log(
    USAGE +
      "\n" +
      fs
        .readFileSync(__filename, "utf8")
        .split("\n")
        .slice(1, 18)
        .map((l) => l.replace(/^\/\/ ?/, ""))
        .join("\n"),
  );
  process.exit(0);
}
if (!FLAGS[cmd])
  out({ ok: false, error: `unknown command '${cmd}'. ${USAGE}` }, 2);

const opt = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  const kind = a.startsWith("--") ? FLAGS[cmd][a.slice(2)] : undefined;
  if (!kind)
    out(
      {
        ok: false,
        error: `unknown option '${a}' for '${cmd}'. Nothing was done. ${USAGE}`,
      },
      2,
    );
  if (kind === "bool") opt[a.slice(2)] = true;
  else {
    if (rest[i + 1] === undefined || rest[i + 1].startsWith("--"))
      out({ ok: false, error: `${a} needs a value` }, 2);
    opt[a.slice(2)] = rest[++i];
  }
}

const root = resolveRoot();
if (!root) {
  console.error(NOT_WORKSPACE);
  process.exit(2);
}
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
const succeeds = (...a) =>
  spawnSync("git", a, { cwd: root, stdio: "ignore" }).status === 0;

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
const base = baseBranch(root);
const hasRemote = !!tryGit("remote");
const remoteHas = (b) => !!tryGit("ls-remote", "--heads", "origin", b);
const hasCommits = succeeds("rev-parse", "--verify", "HEAD");

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
const BRANCH_HELP = `Switch to the team's working branch first (git switch <branch>, for example S10; create it by hand if it does not exist).`;

if (cmd === "status") {
  const files = changed();
  out({
    ok: true,
    branch,
    base,
    on_base: branch === base,
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
  if (branch === base && hasCommits)
    out(
      {
        ok: false,
        on_base: true,
        base,
        error: `You are on ${base}, the base branch, which is not committed to. ${BRANCH_HELP} Nothing was committed.`,
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
    base,
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

function run(args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const text = ((r.stdout || "") + "\n" + (r.stderr || "")).trim();
  if (r.status === 0) return { ok: true, text };
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
  if (!upstream && !remoteHas(branch))
    return { ok: true, updated: false, first: true }; // the remote has no such branch yet
  const r = run(
    upstream
      ? ["pull", "--rebase", "--autostash"]
      : ["pull", "--rebase", "--autostash", "origin", branch],
  );
  if (!r.ok) return r;
  return { ok: true, updated: !/up to date/i.test(r.text) };
}

if (cmd === "push") {
  const first = branch === base && hasRemote && !remoteHas(base); // the very first push of a new repository
  if (branch === base && !first) {
    out(
      {
        ok: false,
        on_base: true,
        base,
        error: `You are on ${base}, the base branch. It is not pushed to. ${BRANCH_HELP}`,
      },
      2,
    );
  }
  if (opt["dry-run"])
    out({
      ok: true,
      dry_run: true,
      branch,
      base,
      would_pull: hasRemote,
      would_push: `origin ${branch}`,
      files: changed().length,
    });
  const i = integrate();
  if (!i.ok) out(i, 2);
  const r = spawnSync("git", ["push", "-u", "origin", branch], {
    cwd: root,
    encoding: "utf8",
  });
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
  out({ ok: true, branch, base, pulled: i.updated, pushed: true });
}

if (cmd === "pull") {
  const i = integrate();
  if (!i.ok) out(i, 2);
  for (const t of flow.tickets(root)) flow.writeChanges(root, t); // regenerate the local changes.md views
  const role = flow.resolveRole(root, opt.role);
  out({
    ok: true,
    branch,
    base,
    on_base: branch === base,
    updated: i.updated,
    role,
    waiting: flow.summary(root, role),
  });
}
