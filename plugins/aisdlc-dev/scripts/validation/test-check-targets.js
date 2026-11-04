#!/usr/bin/env node
// Acceptance tests for check-targets.js: real git repos (origin + a clone), real merges, real conflicts. No network.
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync, spawnSync } = require("child_process");
const SCRIPT = path.resolve(__dirname, "..", "git-hosting", "check-targets.js");

const W = fs.mkdtempSync(path.join(os.tmpdir(), "check-targets-"));
const BARE = path.join(W, "origin.git");
const REPO = path.join(W, "work");
execFileSync("git", ["init", "-q", "--bare", "-b", "main", BARE]);
execFileSync("git", ["clone", "-q", BARE, REPO]);
const g = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8" });
g("config", "user.email", "t@t"); g("config", "user.name", "t");
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(REPO, rel)), { recursive: true }); fs.writeFileSync(path.join(REPO, rel), text); };
const commit = (msg) => { g("add", "-A"); g("commit", "-q", "-m", msg); };
const push = (ref) => g("push", "-q", "origin", ref);

put("src/static/constants.js", "export const SINGLE = 1;\nexport const KEPT = 2;\n");
put("src/feature.js", "import { SINGLE, KEPT } from \"./static/constants\";\nconsole.log(SINGLE, KEPT);\n");
put("ok.txt", "base\n");
put("src/lib/index.js", "export const LIBX = 1;\nexport const LIBY = 2;\n");
commit("base"); push("main");

// dev: renames SINGLE away (a clean merge that silently breaks feature.js's import)
g("switch", "-q", "-c", "dev");
put("src/static/constants.js", "export const RENAMED = 1;\nexport const KEPT = 2;\n");
put("src/lib/index.js", "export const LIBY = 2;\n");
commit("dev baseline");
push("dev");

// qa: diverged further back, same file conflicts the same way as uat below
g("switch", "-q", "main"); g("switch", "-q", "-c", "qa");
put("ok.txt", "qa-side\n");
commit("qa baseline");
push("qa");

// uat: also touches ok.txt, same as qa's base content pattern is different (so NOT reused) -- see below for the
// "reused resolution" case, built separately with a shared ancestor.
g("switch", "-q", "main"); g("switch", "-q", "-c", "uat");
put("ok.txt", "uat-side\n");
commit("uat baseline");
push("uat");

// feature branch: touches ok.txt (conflicts with qa AND uat identically) and feature.js (clean merge into dev,
// breaking the import), cut from main
g("switch", "-q", "main"); g("switch", "-q", "-c", "feat/EL-1");
put("ok.txt", "feature-side\n");
put("src/feature.js", "import { SINGLE, KEPT } from \"./static/constants\";\nimport { OTHER } from \"./other\";\nimport { LIBX } from \"./lib\";\nconsole.log(SINGLE, KEPT, OTHER, LIBX);\n");
put("src/other.js", "export const OTHER = 3;\n");
commit("EL-1: touch ok.txt and feature.js");
push("feat/EL-1");

// merged-into: already contains the feature branch's tip (a target the feature was merged into earlier)
g("switch", "-q", "-c", "merged-into", "feat/EL-1");
put("later.txt", "after the feature\n"); commit("work after the feature merged");
push("merged-into");

const run = (...args) => {
  const r = spawnSync("node", [SCRIPT, REPO, ...args], { encoding: "utf8" });
  let j = null; try { j = JSON.parse(r.stdout); } catch {}
  return { code: r.status, out: r.stdout.trim(), j };
};

let fail = 0;
const t = (name, ok) => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };
const of = (res, target) => res.j.targets.find((x) => x.target === target);

t("usage error without enough args", run("feat/EL-1").code === 1);
t("non-repo path fails cleanly", spawnSync("node", [SCRIPT, path.join(W, "nope"), "feat/EL-1", "main"], { encoding: "utf8" }).status === 1);

let r = run("feat/EL-1", "dev", "qa", "uat", "merged-into", "no-such-branch");
t("exits 0 even with conflicts present", r.code === 0);
t("reports fetched", r.j.fetched === true);

const dev = of(r, "dev");
t("dev: clean merge", dev.merge === "clean");
t("dev: missing export detected (SINGLE renamed to RENAMED)", dev.missing_exports.some((m) => /`SINGLE`/.test(m)));
t("dev: a name removed from a directory module (./lib -> lib/index.js) is flagged", dev.missing_exports.some((m) => /`LIBX`/.test(m)));
t("dev: KEPT (still exported) not flagged", !dev.missing_exports.some((m) => /`KEPT`/.test(m)));
t("dev: OTHER (added by the feature branch, present in dev's tree via base) not flagged", !dev.missing_exports.some((m) => /`OTHER`/.test(m)));

const qa = of(r, "qa"), uat = of(r, "uat");
t("qa: conflicts on ok.txt", qa.merge === "conflicts" && qa.conflicts.some((c) => c.file === "ok.txt"));
t("uat: conflicts on ok.txt", uat.merge === "conflicts" && uat.conflicts.some((c) => c.file === "ok.txt"));
// qa and uat diverged from different content and from different bases relative to each other's tip, so this
// conflict is NOT the same signature (different target-side blob) - must not claim reuse.
t("qa and uat conflicts are not falsely claimed reusable (different target content)",
  qa.conflicts.find((c) => c.file === "ok.txt").same_as === null);

t("merged-into: already contains the branch tip -> merged, not clean/conflicts", of(r, "merged-into").merge === "merged");
t("no-such-branch: reported, not a crash", of(r, "no-such-branch").merge === "no-target");

t("ahead/behind reported for a real divergence", qa.ahead > 0 && qa.behind > 0);
t("tree_equal false when content actually differs", qa.tree_equal === false);

// --- identical-conflict reuse: two targets with the exact same divergent content for the same file -------------
g("switch", "-q", "main"); g("switch", "-q", "-c", "env-a");
put("shared.txt", "env side\n"); commit("env-a change"); push("env-a");
g("switch", "-q", "main"); g("switch", "-q", "-c", "env-b", "env-a"); // same tip, same content -> identical conflict
push("env-b");
g("switch", "-q", "main"); g("switch", "-q", "-c", "feat/EL-2");
put("shared.txt", "feature side\n"); commit("EL-2: touch shared.txt"); push("feat/EL-2");
const reuse = run("feat/EL-2", "env-a", "env-b");
const a = of(reuse, "env-a"), b = of(reuse, "env-b");
t("first target with a conflict has no same_as", a.conflicts[0].same_as === null);
t("second target with the identical conflict is marked reusable", b.conflicts[0].same_as === "env-a");

// --- --no-fetch and --no-imports -----------------------------------------------------------------------------
const noFetch = run("feat/EL-1", "--no-fetch", "dev");
t("--no-fetch skips fetching", noFetch.j.fetched === null);
const noImports = run("feat/EL-1", "--no-imports", "dev");
t("--no-imports skips the export check", noImports.j.targets[0].missing_exports.length === 0);

// --- barrel re-export and non-JS files are never flagged -------------------------------------------------------
g("switch", "-q", "main"); g("switch", "-q", "-c", "barrel-target");
put("src/static/constants.js", "export * from \"./constants2\";\n");
put("src/static/constants2.js", "export const SINGLE = 9;\n");
commit("barrel re-export"); push("barrel-target");
const barrel = run("feat/EL-1", "barrel-target");
t("a barrel re-export is skipped, never flagged as missing", barrel.j.targets[0].missing_exports.length === 0);

// --- post-release sync: main only gained the release merge commit (its content equals the target's) -----------------
g("switch", "-q", "main"); g("switch", "-q", "-c", "uat-rel");
put("released.txt", "shipped\n"); commit("shipped on uat"); push("uat-rel");
g("switch", "-q", "main"); g("switch", "-q", "-c", "main-after-release");
g("merge", "-q", "--no-ff", "-m", "release", "uat-rel"); push("main-after-release");
const rel = run("origin/main-after-release", "uat-rel").j.targets[0];
t("release merge only: not 'merged' (the release merge commit is not in the target)", rel.merge === "clean");
t("release merge only: content identical to the target", rel.tree_equal === true);
t("release merge only: the target has nothing the source lacks (behind 0)", rel.behind === 0);
t("release merge only: the source is ahead by the merge commit", rel.ahead === 1);
// ...but a hotfix on main changes the content: a real sync
g("switch", "-q", "main-after-release"); put("hotfix.txt", "fixed on main\n"); commit("hotfix on main"); push("main-after-release");
const hot = run("origin/main-after-release", "uat-rel").j.targets[0];
t("a hotfix on main: content differs, so it is a real sync", hot.tree_equal === false && hot.behind === 0 && hot.ahead === 2);

// --- table output ---------------------------------------------------------------------------------------------
const tbl = spawnSync("node", [SCRIPT, REPO, "feat/EL-1", "dev", "qa", "--table"], { encoding: "utf8" }).stdout;
t("--table renders a Markdown table", tbl.startsWith("| Target | Merge | Notes |") && /missing exports/.test(tbl));

// --- never writes to the repo (no checkout change, no new local branch, no uncommitted changes) ----------------
const before = g("status", "--porcelain");
const branchesBefore = g("branch", "--list").trim();
const headBefore = g("rev-parse", "--abbrev-ref", "HEAD").trim();
run("feat/EL-1", "dev", "qa", "uat");
t("working tree unchanged after a run", g("status", "--porcelain") === before);
t("no local branch created by a run", g("branch", "--list").trim() === branchesBefore);
t("HEAD still on the same branch", g("rev-parse", "--abbrev-ref", "HEAD").trim() === headBefore);

fs.rmSync(W, { recursive: true, force: true });
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
