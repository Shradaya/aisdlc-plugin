// Unit tests for scripts/lib/repo-paths.js
const fs = require("fs"), path = require("path"), os = require("os");
const { parseEnv, envKey, resolveRepoPath, loadEnv } = require("../lib/repo-paths");
let fail = 0;
const t = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`); };
const R = path.resolve("/w");

t("envKey", envKey("rest-api-evoke"), "AISDLC_REPO_REST_API_EVOKE");
t("parse quotes, comments, export", parseEnv('# c\nA="x y"\nexport B=2 # note\n\nC=\'q\''), { A: "x y", B: "2", C: "q" });
t("per-repo wins over root", resolveRepoPath("api", {}, R, { AISDLC_REPO_API: "/a/api", AISDLC_REPOS_ROOT: "/r" }).path, path.resolve("/a/api"));
t("root/<name>", resolveRepoPath("api", {}, R, { AISDLC_REPOS_ROOT: "/r" }).path, path.resolve("/r/api"));
t("legacy registry path", resolveRepoPath("api", { path: "/legacy/api" }, R, {}).source, "registry path");
t("${VAR} expansion", resolveRepoPath("api", { path: "${HOME_X}/api" }, R, { HOME_X: "/h" }).path, path.resolve("/h/api"));
t("registry path beats root", resolveRepoPath("api", { path: "/legacy" }, R, { AISDLC_REPOS_ROOT: "/r" }).source, "registry path");
t("unset ${VAR} falls through to root", resolveRepoPath("api", { path: "${NOPE}/api" }, R, { AISDLC_REPOS_ROOT: "/r" }).source, "AISDLC_REPOS_ROOT");
t("unset ${VAR} and no root", resolveRepoPath("api", { path: "${NOPE}/api" }, R, {}), null);
t("nothing configured", resolveRepoPath("api", {}, R, {}), null);

const d = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-env-"));
fs.writeFileSync(path.join(d, "claude.env"), "AISDLC_REPOS_ROOT=/from-claude\nAISDLC_REPO_X=/x-claude\n");
fs.writeFileSync(path.join(d, ".env"), "AISDLC_REPO_X=/x-dev\n");
const e = loadEnv(d);
t(".env overrides claude.env", e.AISDLC_REPO_X, "/x-dev");
t("claude.env supplies the rest", e.AISDLC_REPOS_ROOT, "/from-claude");
t("missing files tolerated", typeof loadEnv(path.join(d, "none")), "object");
process.exit(fail ? 1 : 0);
