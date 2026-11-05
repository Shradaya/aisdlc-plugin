// Tests for scripts/init/aisdlc-detect.js using real git repositories (a bare origin plus a clone).
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync, spawnSync } = require("child_process");
const { detect, planWrites, applyWrites, setLine } = require("../init/aisdlc-detect");
let fail = 0;
const t = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`); };
const sh = (cwd, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd, stdio: "pipe" });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-detect-"));

function makeRepo(name, { files = {}, branches = [], subjects = ["init"], url }) {
  const bare = path.join(tmp, name + ".git");
  const work = path.join(tmp, "repos", name);
  fs.mkdirSync(bare, { recursive: true });
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  fs.mkdirSync(work, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main", work]);
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(work, f), c);
  for (const s of subjects) { fs.writeFileSync(path.join(work, "f.txt"), s + Math.random()); sh(work, "add", "-A"); sh(work, "commit", "-q", "-m", s); }
  sh(work, "remote", "add", "origin", bare);
  sh(work, "push", "-q", "origin", "main");
  for (const b of branches) { sh(work, "branch", b); sh(work, "push", "-q", "origin", b); }
  if (url) sh(work, "remote", "set-url", "origin", url);
  else sh(work, "fetch", "-q", "origin");
  return work;
}
// URL swap hides the bare remote branches, so fetch before swapping.
function withUrl(name, opts, url) { const w = makeRepo(name, opts); sh(w, "fetch", "-q", "origin"); sh(w, "remote", "set-url", "origin", url); return w; }

const api = withUrl("api", {
  files: { "package.json": JSON.stringify({ scripts: { lint: "eslint .", test: "jest", seed: "node seed.js" } }) },
  branches: ["lf-develop", "lf-qa", "lf-uat", "PROJ-1", "PROJ-2"],
  subjects: ["PROJ-1: add thing", "PROJ-2: fix thing", "PROJ-3: more"],
}, "git@bitbucket.org:acme-co/api.git");
const web = withUrl("web", { branches: ["lf-develop", "PROJ-7"], subjects: ["PROJ-7: ui"] }, "https://bitbucket.org/acme-co/web.git");
const goRepo = makeRepo("svc", { files: { "go.mod": "module x\n" }, subjects: ["feat: a", "fix: b", "chore: c"] });

const d = detect([api, web]);
t("provider", d.git.provider, "bitbucket");
t("org", d.git.org, "acme-co");
t("base branch", d.git.base_branch, "main");
t("env branches ordered", d.git.environments, [{ name: "dev", branch: "lf-develop" }, { name: "qa", branch: "lf-qa" }, { name: "uat", branch: "lf-uat" }]);
t("ticket key detected", d.tickets.keys, ["PROJ"]);
t("ticket pattern", d.tickets.pattern, "PROJ-\\d+");
t("commit style ticket", d.commits.style, "ticket");
t("tooling from package.json", d.repositories[0].tooling, { lint: "npm run lint", test: "npm run test" });
t("no notes", d.notes, []);

const g = detect([goRepo]);
t("conventional commits", g.commits.style, "conventional");
t("go tooling", g.repositories[0].tooling, { format: "gofmt -l .", test: "go test ./..." });
t("no env branches", g.git.environments, []);
t("unknown remote -> no provider", g.git.provider, null);
t("ticket default when none", [g.tickets.detected, g.tickets.pattern], [false, "[A-Z][A-Z0-9]+-\\d+"]);
t("non-git path ignored", detect([tmp]).notes, ["No git repositories found."]);

// master as base is reported, never written
const m = path.join(tmp, "m"); fs.mkdirSync(m); execFileSync("git", ["init", "-q", "-b", "master", m]); sh(m, "commit", "-q", "--allow-empty", "-m", "x");
const mb = path.join(tmp, "m.git"); execFileSync("git", ["init", "-q", "--bare", "-b", "master", mb]); sh(m, "remote", "add", "origin", mb); sh(m, "push", "-q", "origin", "master"); sh(m, "fetch", "-q");
const md = detect([m]);
t("master detected", md.git.base_branch, "master");
t("master note", md.notes.length, 1);
t("master not planned", planWrites(md).some((w) => w.key === "base_branch"), false);

// --write keeps comments and unrelated lines
const ws = path.join(tmp, "ws"); fs.mkdirSync(path.join(ws, "config"), { recursive: true });
const wsText = '# keep me\n{\n  "git": {\n    "base_branch": "develop",\n    "commit_format": "{summary}",\n    "other": "x"\n  }\n}\n';
const intText = '# keep too\n{\n  "jira": { "provider": "jira" },\n  "git_hosting": {\n    "provider": "github",\n    "pr_target_branches": ["a", "b"],\n    "x": 1\n  }\n}\n';
fs.writeFileSync(path.join(ws, "config", "workspace.yaml"), wsText);
fs.writeFileSync(path.join(ws, "config", "integrations.yaml"), intText);
const res = applyWrites(ws, planWrites(d));
const w1 = fs.readFileSync(path.join(ws, "config", "workspace.yaml"), "utf8");
const w2 = fs.readFileSync(path.join(ws, "config", "integrations.yaml"), "utf8");
t("all writes applied", res.every((r) => r.applied), true);
t("base_branch written", /"base_branch": "main"/.test(w1), true);
t("commit_format written", /"commit_format": "\{ticket\}: \{summary\}"/.test(w1), true);
t("workspace comment and other keys kept", w1.startsWith("# keep me\n") && w1.includes('"other": "x"'), true);
t("pr_target_branches written", /"pr_target_branches": \["lf-develop","lf-qa","lf-uat"\]/.test(w2), true);
t("provider written in git_hosting only", /"git_hosting": \{\s+"provider": "bitbucket"/.test(w2) && w2.includes('"jira": { "provider": "jira" }'), true);
t("integrations comment kept", w2.startsWith("# keep too\n"), true);
t("integrations stays parseable", (() => { try { JSON.parse(w2.replace(/^\s*#.*$/gm, "")); return true; } catch { return false; } })(), true);
t("rerun is idempotent", applyWrites(ws, planWrites(d)).every((r) => r.applied && r.changed === false), true);
t("missing file reported", applyWrites(path.join(tmp, "nope"), planWrites(d))[0].applied, false);
t("setLine absent key", setLine('{"a":"b"}', "zzz", '"x"'), null);

// CLI: draft prints and changes nothing; --write applies
const cli = path.resolve(__dirname, "..", "init", "aisdlc-detect.js");
fs.writeFileSync(path.join(ws, "config", "workspace.yaml"), wsText);
const draft = spawnSync("node", [cli, api, web, "--root", ws], { encoding: "utf8" });
t("cli draft exits 0", draft.status, 0);
t("cli draft is JSON with git section", JSON.parse(draft.stdout).git.provider, "bitbucket");
t("cli draft leaves files alone", fs.readFileSync(path.join(ws, "config", "workspace.yaml"), "utf8"), wsText);
const wr = spawnSync("node", [cli, api, web, "--root", ws, "--write"], { encoding: "utf8" });
t("cli --write changes workspace.yaml", /"base_branch": "main"/.test(fs.readFileSync(path.join(ws, "config", "workspace.yaml"), "utf8")), true);
t("cli --write reports written", JSON.parse(wr.stdout).written.length, 4);

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
