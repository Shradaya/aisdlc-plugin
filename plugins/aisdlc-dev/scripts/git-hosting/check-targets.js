#!/usr/bin/env node
// Read-only dry-run merge check: how a branch would merge into each of several target branches, before any PR is
// opened or any branch is created. Never checks anything out, never writes a ref, a branch or a file in the working
// tree (git merge-tree only adds unreferenced objects to the object store).
//
//   node check-targets.js <repo-path> <source> <target...> [--no-fetch] [--no-imports] [--table]
//
// <source> is any ref: a local branch (the usual case, pushed or not), `origin/<b>`, a sha. Each <target> is a
// branch name; it is read as origin/<target> after `git fetch origin` (skip with --no-fetch).
//
// Per target:
//   merge "merged"     the source is already part of the target: nothing to merge
//         "clean"      no conflicts
//         "conflicts"  conflicting files; `same_as` names an earlier target whose conflict is identical (same file,
//                      same target-side content, same merge base), so one resolution serves both
//         "no-target"  origin/<target> does not exist
//   ahead / behind     commits only on the source / only on the target
//   tree_equal         the target's content is identical to the source's (a merge would change no file)
//   missing_exports    clean merges only (skipped with --no-imports): named imports in the JS/TS files the source
//                      changed, from other files of the same repo, that the merged result no longer exports. The
//                      source alone still builds, so only the merged tree reveals it. Barrel re-exports
//                      (`export * from`) and CommonJS modules cannot be checked and are skipped, never reported.
//
// Requires git 2.38+ (merge-tree --write-tree). Output: one JSON line, exit 0 whatever the merge results are, exit 1
// for a usage or git error (JSON { ok:false, error } on stdout). --table prints a Markdown table instead.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function fail(error) {
  console.log(JSON.stringify({ ok: false, error }));
  process.exit(1);
}

function git(repo, args) {
  const r = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) fail(`cannot run git: ${r.error.message}`);
  return { code: r.status, out: r.stdout || "", err: (r.stderr || "").trim() };
}

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// The names a module exports, or null when that cannot be told statically (re-exported barrels, CommonJS,
// multi-declarator `export const a = 1, b = 2`): such modules are skipped rather than risk a false alarm.
function exportedNames(raw) {
  const text = stripComments(raw);
  if (/\bexport\s*\*\s*(?:as\s+[\w$]+\s*)?from\b/.test(text)) return null;
  if (/\bmodule\.exports\b|\bexports\.[\w$]+\s*=/.test(text)) return null;
  if (
    /\bexport\s+(?:const|let|var)\s+[\w$]+[^;\n]*=[^;\n]*,\s*[\w$]+\s*=/.test(
      text,
    )
  )
    return null;
  const names = new Set();
  for (const m of text.matchAll(
    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum|interface|type|namespace)\s+([\w$]+)/g,
  ))
    names.add(m[1]);
  const destructured = (open, close) =>
    new RegExp(
      `\\bexport\\s+(?:const|let|var)\\s*\\${open}([^\\${close}]*)\\${close}\\s*=`,
      "g",
    );
  for (const re of [destructured("{", "}"), destructured("[", "]")])
    for (const m of text.matchAll(re))
      for (const p of m[1].split(",")) {
        const nm = p.split(":").pop().split("=")[0].replace(/[.\s]/g, "");
        if (nm) names.add(nm);
      }
  for (const m of text.matchAll(/\bexport\s*(?:type\s*)?\{([^}]*)\}/g))
    for (const p of m[1].split(",")) {
      const parts = p.trim().split(/\s+as\s+/);
      const nm = (parts[1] || parts[0]).replace(/^type\s+/, "").trim();
      if (nm) names.add(nm);
    }
  if (/\bexport\s+default\b/.test(text)) names.add("default");
  return names;
}

// Named (non type-only) imports of a file: [{ name, spec }].
function namedImports(raw) {
  const out = [];
  const re =
    /\bimport\s+(?!type\b)(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  for (const m of stripComments(raw).matchAll(re)) {
    for (const p of m[1].split(",")) {
      const item = p.trim();
      if (!item || /^type\s/.test(item)) continue;
      out.push({ name: item.split(/\s+as\s+/)[0].trim(), spec: m[2] });
    }
  }
  return out;
}

// Which in-repo file does an import specifier point at? Relative ("./x"), the "@/" alias for src/, or an app-rooted
// path ("static/constants" resolved under src/, the usual baseUrl). Package imports return null.
function candidates(importer, spec) {
  let base;
  if (spec.startsWith("."))
    base = path.posix.normalize(
      path.posix.join(path.posix.dirname(importer), spec),
    );
  else if (spec.startsWith("@/")) base = path.posix.join("src", spec.slice(2));
  else if (spec.includes("/") && !spec.startsWith("@"))
    base = path.posix.join("src", spec);
  else return [];
  return [
    base,
    ...SOURCE_EXT.map((e) => base + e),
    ...SOURCE_EXT.map((e) => path.posix.join(base, "index" + e)),
  ];
}

function missingExports(repo, tree, changedFiles) {
  const files = changedFiles.filter((f) =>
    SOURCE_EXT.includes(path.posix.extname(f)),
  );
  if (!files.length) return [];
  const listing = git(repo, ["ls-tree", "-r", "--name-only", tree]);
  if (listing.code !== 0) return [];
  const inTree = new Set(listing.out.split("\n").filter(Boolean));
  const blob = (f) => {
    const r = git(repo, ["cat-file", "blob", `${tree}:${f}`]);
    return r.code === 0 ? r.out : null;
  };
  const exportsCache = new Map();
  const exportsOf = (f) => {
    if (!exportsCache.has(f)) {
      const t = blob(f);
      exportsCache.set(f, t == null ? null : exportedNames(t));
    }
    return exportsCache.get(f);
  };
  const found = [];
  for (const f of files) {
    if (!inTree.has(f)) continue;
    const src = blob(f);
    if (!src) continue;
    for (const { name, spec } of namedImports(src)) {
      const target = candidates(f, spec).find((c) => inTree.has(c));
      if (!target) continue;
      const names = exportsOf(target);
      if (names && !names.has(name))
        found.push(`${f}: \`${name}\` from ${spec}`);
    }
  }
  return found;
}

function check(repo, source, targets, { fetch, imports }) {
  const result = { ok: true, repo, source, fetched: null, targets: [] };
  if (fetch) {
    const f = git(repo, ["fetch", "-q", "origin"]);
    result.fetched = f.code === 0;
    if (f.code !== 0) result.fetch_error = f.err.slice(0, 200);
  }
  const src = git(repo, ["rev-parse", "-q", "--verify", `${source}^{commit}`]);
  if (src.code !== 0) fail(`source ref not found: ${source}`);
  const seen = new Map(); // conflict signature -> first target that had it
  for (const target of targets) {
    const ref = `origin/${target}`;
    if (
      git(repo, ["rev-parse", "-q", "--verify", `${ref}^{commit}`]).code !== 0
    ) {
      result.targets.push({ target, merge: "no-target" });
      continue;
    }
    const lr = git(repo, [
      "rev-list",
      "--left-right",
      "--count",
      `${source}...${ref}`,
    ])
      .out.trim()
      .split(/\s+/)
      .map(Number);
    const entry = {
      target,
      ahead: lr[0] || 0,
      behind: lr[1] || 0,
      tree_equal: git(repo, ["diff", "--quiet", ref, source]).code === 0,
    };
    if (git(repo, ["merge-base", "--is-ancestor", source, ref]).code === 0) {
      result.targets.push({ ...entry, merge: "merged" });
      continue;
    }
    const mt = git(repo, [
      "merge-tree",
      "--write-tree",
      "--name-only",
      "-z",
      source,
      ref,
    ]);
    if (mt.code !== 0 && mt.code !== 1)
      fail(
        `git merge-tree failed (git 2.38+ is required): ${mt.err || "exit " + mt.code}`,
      );
    const parts = mt.out.split("\0");
    if (mt.code === 0) {
      const changed = git(repo, [
        "diff",
        "--name-only",
        "--diff-filter=AM",
        git(repo, ["merge-base", source, ref]).out.trim(),
        source,
      ])
        .out.split("\n")
        .filter(Boolean);
      result.targets.push({
        ...entry,
        merge: "clean",
        missing_exports: imports ? missingExports(repo, parts[0], changed) : [],
      });
      continue;
    }
    // -z output: <tree> NUL <conflicted file> NUL ... NUL (empty entry) <informational messages...>
    const files = [];
    for (let i = 1; i < parts.length && parts[i] !== ""; i++)
      files.push(parts[i]);
    const mb = git(repo, ["merge-base", source, ref]).out.trim();
    const conflicts = files.map((file) => {
      const blobOf = (rev) => {
        const r = git(repo, ["rev-parse", "-q", "--verify", `${rev}:${file}`]);
        return r.code === 0 ? r.out.trim() : "";
      };
      // Same resolution only if the target-side AND base-side content match: base differs when the targets diverged.
      const sig = [file, blobOf(ref), mb ? blobOf(mb) : ""].join("\0");
      const same = seen.get(sig) || null;
      if (!seen.has(sig)) seen.set(sig, target);
      return { file, same_as: same };
    });
    result.targets.push({ ...entry, merge: "conflicts", conflicts });
  }
  return result;
}

function table(r) {
  const rows = ["| Target | Merge | Notes |", "|---|---|---|"];
  for (const t of r.targets) {
    if (t.merge === "no-target")
      rows.push(`| ${t.target} | – | no such branch |`);
    else if (t.merge === "merged")
      rows.push(`| ${t.target} | already merged | nothing to merge |`);
    else if (t.merge === "clean")
      rows.push(
        `| ${t.target} | clean | ${t.missing_exports.length ? "**missing exports:** " + t.missing_exports.join("; ") : "imports resolve"} |`,
      );
    else {
      const reuse = [
        ...new Set(t.conflicts.map((c) => c.same_as).filter(Boolean)),
      ];
      rows.push(
        `| ${t.target} | **conflicts** (${t.conflicts.length}): ${t.conflicts.map((c) => c.file).join(", ")} | ${reuse.length ? "same conflict as " + reuse.join(", ") + ": reuse its resolution" : "resolve by hand"} |`,
      );
    }
  }
  return rows.join("\n");
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const [repo, source, ...targets] = argv.filter((a) => !a.startsWith("--"));
if (!repo || !source || !targets.length)
  fail(
    "usage: check-targets.js <repo-path> <source> <target...> [--no-fetch] [--no-imports] [--table]",
  );
if (!fs.existsSync(repo) || git(repo, ["rev-parse", "--git-dir"]).code !== 0)
  fail(`not a git repository: ${repo}`);
const result = check(repo, source, targets, {
  fetch: !flags.has("--no-fetch"),
  imports: !flags.has("--no-imports"),
});
console.log(flags.has("--table") ? table(result) : JSON.stringify(result));
