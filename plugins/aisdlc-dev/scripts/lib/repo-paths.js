// Resolves where each registered repository lives on THIS machine (the registry holds no machine paths).
// Canonical copy under packages/aisdlc-core/; vendored into each plugin. See lib/root.js for why.
//
// Sources, highest precedence first:
//   1. real environment variables
//   2. .env          the developer's own file (Claude is denied access to it, with all .env.*)
//   3. claude.env    local paths, readable and writable by Claude (written by /aisdlc-dev:add-repo)
// For repository <name>, first match wins:
//   a. AISDLC_REPO_<NAME>       (NAME = upper-case, non-alphanumerics -> "_")
//   b. "path" in config/repositories.yaml, e.g. "${AISDLC_REPOS_ROOT}/<name>" (${VAR} comes from the sources above)
//   c. AISDLC_REPOS_ROOT/<name> (one folder holding all clones)
// Neither env file may hold secrets; paths only.
const fs = require("fs");
const path = require("path");

const ROOT = require("./root").resolveRoot() || process.cwd();
const ENV_FILES = ["claude.env", ".env"]; // later files override earlier ones

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

function loadEnv(root = ROOT) {
  let merged = {};
  for (const f of ENV_FILES) {
    try {
      merged = {
        ...merged,
        ...parseEnv(fs.readFileSync(path.join(root, f), "utf8")),
      };
    } catch {}
  }
  return { ...merged, ...process.env };
}

const envKey = (name) =>
  "AISDLC_REPO_" + name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
// Expands ${VAR}; returns null if any referenced variable is unset (never a half-built path).
function expand(s, env) {
  let missing = false;
  const out = String(s).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, k) => {
    if (!env[k]) missing = true;
    return env[k] ?? "";
  });
  return missing ? null : out;
}

// Returns { path, source } or null when nothing usable is configured.
function resolveRepoPath(name, entry = {}, root = ROOT, env = loadEnv(root)) {
  const candidates = [];
  if (env[envKey(name)]) candidates.push([env[envKey(name)], envKey(name)]);
  if (entry.path) candidates.push([entry.path, "registry path"]);
  if (env.AISDLC_REPOS_ROOT)
    candidates.push([
      path.join(env.AISDLC_REPOS_ROOT, name),
      "AISDLC_REPOS_ROOT",
    ]);
  for (const [raw, source] of candidates) {
    const p = expand(raw, env);
    if (p) return { path: path.resolve(root, p), source };
  }
  return null;
}

module.exports = {
  ROOT,
  ENV_FILES,
  parseEnv,
  loadEnv,
  envKey,
  resolveRepoPath,
};
