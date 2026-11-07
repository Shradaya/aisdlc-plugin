#!/usr/bin/env node
// Draft workspace settings from the repositories themselves, so a team starts from facts instead of template defaults.
// Usage: node aisdlc-detect.js [repo-path ...] [--root <workspace>] [--write]
// Repos: the given paths, else every repository registered in config/repositories.yaml that resolves on this machine,
// else the git folders directly under AISDLC_REPOS_ROOT. Reads git and project files only (no network).
// Prints a JSON report. With --write it updates only these lines in the workspace config, leaving comments intact:
//   workspace.yaml     git.base_branch, git.commit_format (only when the commit history clearly uses "TICKET: ")
//   integrations.yaml  git_hosting.provider, git_hosting.pr_target_branches (only when environment branches exist)
// Lint/test commands are printed for review and never written (they run outside permission prompts when used by on_edit).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ENV_ORDER = ["dev", "qa", "test", "staging", "uat", "preprod", "release"];
const ENV_ALIAS = { develop: "dev", development: "dev" };
const ENV_RE =
  /^(?:[a-z0-9]+-)?(develop|development|dev|qa|test|staging|uat|preprod|release)$/;
const CONVENTIONAL =
  /^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(\([^)]+\))?!?: /;
const HOSTS = {
  "github.com": "github",
  "bitbucket.org": "bitbucket",
  "gitlab.com": "gitlab",
};

function git(repo, ...args) {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}
const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
};
const readText = (p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
};
const count = (map, k) => map.set(k, (map.get(k) || 0) + 1);

function remoteBranches(repo) {
  const out = new Set();
  for (const l of git(repo, "branch", "-r", "--format=%(refname:short)").split(
    "\n",
  )) {
    const b = l.trim();
    if (b && !b.endsWith("/HEAD")) out.add(b.slice(b.indexOf("/") + 1));
  }
  return out;
}
function allBranchNames(repo) {
  return git(repo, "branch", "-a", "--format=%(refname:short)")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function gitSection(repos) {
  let url = "";
  for (const r of repos) {
    url = git(r, "remote", "get-url", "origin").trim();
    if (url) break;
  }
  const host = Object.keys(HOSTS).find((h) => url.includes(h));
  const m = url.match(/[:/]([^/:]+)\/[^/]+?(?:\.git)?$/);
  const branches = new Map();
  for (const r of repos) for (const b of remoteBranches(r)) count(branches, b);
  const base = ["main", "master"].find((b) => branches.has(b)) || null;
  const envs = new Map(); // env name -> actual branch name (most common wins)
  const seen = new Map();
  for (const b of branches.keys()) {
    const e = ENV_RE.exec(b);
    if (e && b !== base) seen.set(b, ENV_ALIAS[e[1]] || e[1]);
  }
  for (const [b, env] of seen) {
    if (!envs.has(env) || branches.get(b) > branches.get(envs.get(env)))
      envs.set(env, b);
  }
  const ordered = [...envs.keys()].sort(
    (a, b) => ENV_ORDER.indexOf(a) - ENV_ORDER.indexOf(b),
  );
  return {
    provider: host ? HOSTS[host] : null,
    org: m ? m[1] : null,
    base_branch: base,
    environments: ordered.map((env) => ({ name: env, branch: envs.get(env) })),
  };
}

function ticketPattern(repos) {
  const keys = new Map();
  for (const r of repos) {
    for (const n of allBranchNames(r)) {
      const m =
        /^(?:[^/]+\/)?(?:(?:feature|bugfix|hotfix|fix)\/)?([A-Z][A-Z0-9]+)-\d+/.exec(
          n,
        );
      if (m) count(keys, m[1]);
    }
  }
  const common = [...keys]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  if (!common.length)
    return { keys: [], pattern: "[A-Z][A-Z0-9]+-\\d+", detected: false };
  return {
    keys: common,
    pattern:
      common.length === 1
        ? `${common[0]}-\\d+`
        : `(?:${common.join("|")})-\\d+`,
    detected: true,
  };
}

function commitStyle(repos, pattern) {
  const subjects = repos.flatMap((r) =>
    git(r, "log", "-50", "--no-merges", "--format=%s")
      .split("\n")
      .filter(Boolean),
  );
  if (!subjects.length) return { style: "unknown", sample: 0 };
  const conventional = subjects.filter((s) => CONVENTIONAL.test(s)).length;
  const re = new RegExp(`^(?:${pattern}):? `);
  const ticketed = subjects.filter((s) => re.test(s)).length;
  let style = "none";
  if (conventional > subjects.length / 2) style = "conventional";
  else if (ticketed > subjects.length / 2) style = "ticket";
  return { style, sample: subjects.length };
}

function tooling(repo) {
  const out = {};
  const pkg = readJson(path.join(repo, "package.json"));
  const scripts = pkg.scripts || {};
  const run = (n) => `npm run ${n}`;
  for (const k of ["lint", "format", "test", "build"])
    if (scripts[k]) out[k] = run(k);
  const py = readText(path.join(repo, "pyproject.toml"));
  if (py) {
    if (/ruff/.test(py)) out.lint = out.lint || "ruff check .";
    else if (/black/.test(py)) out.format = out.format || "black .";
    if (/pytest/.test(py)) out.test = out.test || "pytest";
  }
  if (fs.existsSync(path.join(repo, "go.mod"))) {
    out.format = out.format || "gofmt -l .";
    out.test = out.test || "go test ./...";
  }
  return out;
}

function detect(repoPaths) {
  const repos = repoPaths.filter((p) => fs.existsSync(path.join(p, ".git")));
  const g = gitSection(repos);
  const tp = ticketPattern(repos);
  const cs = commitStyle(repos, tp.pattern);
  const notes = [];
  if (!repos.length) notes.push("No git repositories found.");
  if (g.base_branch && g.base_branch !== "main")
    notes.push(
      `Base branch is "${g.base_branch}"; the plugin's registry expects "main" (not written).`,
    );
  if (!g.base_branch && repos.length)
    notes.push("No main/master remote branch found (fetch first?).");
  return {
    repositories: repos.map((p) => ({
      name: path.basename(p),
      path: p,
      tooling: tooling(p),
    })),
    git: g,
    tickets: tp,
    commits: cs,
    notes,
  };
}

// Replace one JSON line value inside the config text, keeping comments and layout. Returns null if the key is absent.
function setLine(text, key, jsonValue) {
  const re = new RegExp(`("${key}"\\s*:\\s*)(\\[[^\\]]*\\]|"[^"]*")`);
  return re.test(text) ? text.replace(re, (_m, p) => p + jsonValue) : null;
}
function planWrites(d) {
  const w = [];
  if (d.git.base_branch === "main")
    w.push({
      file: "config/workspace.yaml",
      key: "base_branch",
      value: "main",
    });
  if (d.commits.style === "ticket")
    w.push({
      file: "config/workspace.yaml",
      key: "commit_format",
      value: "{ticket}: {summary}",
    });
  if (d.git.provider)
    w.push({
      file: "config/integrations.yaml",
      key: "provider",
      value: d.git.provider,
      scope: "git_hosting",
    });
  if (d.git.environments.length) {
    w.push({
      file: "config/integrations.yaml",
      key: "pr_target_branches",
      value: d.git.environments.map((e) => e.branch),
      scope: "git_hosting",
    });
  }
  return w;
}
function applyWrites(root, writes) {
  const done = [];
  for (const w of writes) {
    const file = path.join(root, w.file);
    let text = readText(file);
    if (!text) {
      done.push({ ...w, applied: false, reason: "file missing" });
      continue;
    }
    let next;
    if (w.scope) {
      // Limit the edit to the scope's block (from `"scope": {` to its closing brace at the same nesting level).
      const start = text.search(new RegExp(`"${w.scope}"\\s*:\\s*\\{`));
      if (start < 0) {
        done.push({ ...w, applied: false, reason: `no ${w.scope} block` });
        continue;
      }
      let depth = 0,
        end = -1;
      for (let i = text.indexOf("{", start); i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) {
          end = i + 1;
          break;
        }
      }
      const block = text.slice(start, end);
      const edited = setLine(block, w.key, JSON.stringify(w.value));
      next =
        edited === null
          ? null
          : text.slice(0, start) + edited + text.slice(end);
    } else {
      next = setLine(text, w.key, JSON.stringify(w.value));
    }
    if (next === null) {
      done.push({ ...w, applied: false, reason: "key not found" });
      continue;
    }
    if (next !== text) fs.writeFileSync(file, next);
    done.push({ ...w, applied: true, changed: next !== text });
  }
  return done;
}

function registeredRepos(root, env) {
  const { readYaml } = require("../lib/yaml");
  const { resolveRepoPath } = require("../lib/repo-paths");
  const reg =
    readYaml(path.join(root, "config", "repositories.yaml"), {}) || {};
  const out = [];
  for (const [name, entry] of Object.entries(reg.repositories || {})) {
    const r = resolveRepoPath(name, entry, root, env);
    if (r && fs.existsSync(r.path)) out.push(r.path);
  }
  return out;
}
function rootRepos(env) {
  const base = env.AISDLC_REPOS_ROOT;
  if (!base || !fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith(".") &&
        fs.existsSync(path.join(base, e.name, ".git")),
    )
    .map((e) => path.join(base, e.name));
}

module.exports = { detect, planWrites, applyWrites, setLine };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ri = args.indexOf("--root");
  const root = path.resolve(ri >= 0 ? args[ri + 1] : process.cwd());
  const write = args.includes("--write");
  const given = args
    .filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--root")
    .map((a) => path.resolve(a));
  let repos = given;
  if (!repos.length) {
    const { loadEnv } = require("../lib/repo-paths");
    const env = loadEnv(root);
    repos = registeredRepos(root, env);
    if (!repos.length) repos = rootRepos(env);
  }
  const d = detect(repos);
  const out = { workspace: root, ...d };
  if (write) out.written = applyWrites(root, planWrites(d));
  console.log(JSON.stringify(out, null, 2));
  if (!write)
    console.error(
      "Draft only. Review it, then re-run with --write to apply git.base_branch, commit_format, provider and pr_target_branches.",
    );
}
