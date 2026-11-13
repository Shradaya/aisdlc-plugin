// Tests for scripts/version-check.js using a throwaway git repository.
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync, spawnSync } = require("child_process");
const { check, cmp, changelogTop } = require("./version-check");
let fail = 0;
const t = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`); };
const root = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-ver-"));
const g = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: root, stdio: "pipe" });
const put = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const setVersion = (p, v, log = v) => {
  put(`plugins/${p}/.claude-plugin/plugin.json`, JSON.stringify({ name: p, version: v }));
  put(`plugins/${p}/CHANGELOG.md`, `# Changelog\n\n## ${log} (2026-01-01)\nx\n\n## 0.0.1\nold\n`);
};
const commit = (m) => { g("add", "-A"); g("commit", "-q", "-m", m); };

t("cmp lower", cmp("1.0.0", "1.0.1"), -1);
t("cmp numeric not lexical", cmp("1.10.0", "1.9.0"), 1);
t("cmp equal", cmp("2.0.0", "2.0.0"), 0);
// The real changelog's top heading is the version in plugin.json (not a fixed number, so bumps don't break this)
t("changelog top heading", changelogTop(path.join(__dirname, "..", "plugins", "aisdlc-dev", "CHANGELOG.md")),
  require(path.join(__dirname, "..", "plugins", "aisdlc-dev", ".claude-plugin", "plugin.json")).version);

g("init", "-q", "-b", "main");
setVersion("a", "1.0.0"); setVersion("b", "2.1.0");
put("plugins/a/scripts/x.js", "1"); put("plugins/a/README.md", "r");
commit("base");
t("clean tree passes", check(root), []);

// changelog / version agreement
setVersion("a", "1.1.0", "1.0.0");
t("changelog behind plugin.json", check(root).length, 1);
t("message names the plugin", /^a: plugin\.json is 1\.1\.0/.test(check(root)[0]), true);
setVersion("a", "1.0.0");
put("plugins/a/CHANGELOG.md", "# Changelog\nnothing\n");
t("no heading", /missing/.test(check(root)[0]), true);
fs.unlinkSync(path.join(root, "plugins/a/CHANGELOG.md"));
t("missing changelog", /CHANGELOG\.md is missing/.test(check(root)[0]), true);
setVersion("a", "1.0");
t("bad semver", /not MAJOR\.MINOR\.PATCH/.test(check(root)[0]), true);
setVersion("a", "1.0.0");
t("restored passes", check(root), []);

// base comparison
g("checkout", "-q", "-b", "feature");
put("plugins/a/README.md", "changed readme"); put("plugins/a/scripts/validation/test-x.js", "t"); put("plugins/a/templates/web/docs/g.md", "d");
setVersion("a", "1.0.0");
commit("docs and tests only");
t("exempt files need no bump", check(root, "main"), []);
put("plugins/a/scripts/x.js", "2"); commit("behavior");
const bad = check(root, "main");
t("behavior change without bump fails", bad.length, 1);
t("message points at the file", /scripts\/x\.js/.test(bad[0]) && /Bump plugin\.json/.test(bad[0]), true);
put("plugins/a/skills/s/SKILL.md", "s"); commit("skill is behavior");
t("two behavior files counted", /2 files/.test(check(root, "main")[0]), true);
setVersion("a", "1.0.1"); commit("bump");
t("bump satisfies", check(root, "main"), []);
setVersion("a", "0.9.0"); commit("downgrade");
t("downgrade fails", check(root, "main").length, 1);
setVersion("a", "1.0.1"); commit("back");
put("plugins/b/hooks/h.js", "1"); commit("other plugin behavior");
t("other plugin flagged separately", check(root, "main").map((p) => p.split(":")[0]), ["b"]);
t("unknown base is reported", /cannot compare with base/.test(check(root, "nope")[0]), true);

// CLI
const cli = path.join(__dirname, "version-check.js");
const bad2 = spawnSync("node", [cli, "--root", root, "--base", "main"], { encoding: "utf8" });
t("cli exits 1 on problems", bad2.status, 1);
t("cli prints the problem", /b: behavior changed/.test(bad2.stderr), true);
const ok = spawnSync("node", [cli], { encoding: "utf8" });
t("cli ok on this repo", [ok.status, /version check ok/.test(ok.stdout)], [0, true]);

fs.rmSync(root, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
