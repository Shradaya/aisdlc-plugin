// Target-environment resolution and production guard for the QA plugin. Used by env-check.js, run-tests.js and the
// PreToolUse hook. The workspace's playwright.config.ts applies the same guard at test time (it cannot load the plugin).
//
// Environment name: explicit argument, else QA_ENV (real env var > .env > claude.env), else environments.yaml "default".
// An environment is usable only when it has a base_url, allow_automation === true, and its host matches neither the
// workspace's blocked_hosts nor the policy's blocked_host_patterns.
const fs = require("fs");
const path = require("path");
const { configPath } = require("../lib/root");
const { readYaml } = require("../lib/yaml");
const { loadEnv } = require("../lib/repo-paths");

function environmentsConfig(root) {
  return readYaml(path.join(root, "config", "environments.yaml"), null);
}

// Returns { ok, name, base_url, host, login, data, reason }.
function resolveEnv(root, name) {
  const cfg = environmentsConfig(root);
  if (!cfg) return { ok: false, reason: "config/environments.yaml is missing or unreadable." };
  const env = loadEnv(root);
  const chosen = name || env.QA_ENV || cfg.default;
  if (!chosen) return { ok: false, reason: "No environment chosen: pass one, set QA_ENV, or set \"default\" in config/environments.yaml." };
  const e = (cfg.environments || {})[chosen];
  if (!e) return { ok: false, name: chosen, reason: `Environment '${chosen}' is not defined in config/environments.yaml.` };
  if (!e.base_url) return { ok: false, name: chosen, reason: `Environment '${chosen}' has no base_url in config/environments.yaml.` };
  let host;
  try { host = new URL(e.base_url).hostname.toLowerCase(); }
  catch { return { ok: false, name: chosen, reason: `Environment '${chosen}' has an invalid base_url.` }; }
  const base = { name: chosen, base_url: e.base_url, host, login: e.login || { mode: "none" }, data: e.data || "synthetic" };
  if (e.allow_automation !== true) return { ok: false, ...base, reason: `Environment '${chosen}' does not allow automation (allow_automation is not true).` };
  const blocked = blockedReason(root, host, cfg);
  if (blocked) return { ok: false, ...base, reason: blocked };
  return { ok: true, ...base };
}

// Does a blocked_hosts entry cover this host? "=h" is exact; "h" also covers its subdomains.
// Keep identical to hostBlocked() in templates/workspace/fixtures/env.ts.
function hostBlocked(entry, host) {
  const e = String(entry).toLowerCase();
  return e.startsWith("=") ? host === e.slice(1) : host === e || host.endsWith("." + e);
}

function blockedReason(root, host, cfg = environmentsConfig(root) || {}) {
  const hit = (cfg.blocked_hosts || []).find((h) => hostBlocked(h, host));
  if (hit) return `Host ${host} is blocked by blocked_hosts entry "${hit}"; automation never runs against production.`;
  const policy = readYaml(configPath(root, "qa-policy.yaml"), {}) || {};
  const patterns = ((policy.environments || {}).blocked_host_patterns || []);
  const pattern = patterns.find((p) => new RegExp(p, "i").test(host));
  if (pattern) return `Host ${host} looks like production (matches ${pattern}); automation never runs against production. Fix the base_url or the policy override if this is wrong.`;
  return null;
}

// The Playwright CLI inside the workspace (run with `node`, so no shell quoting or npx.cmd issues on Windows).
function playwrightCli(root) {
  const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
  return fs.existsSync(cli) ? cli : null;
}

// Environment for a Playwright child process. NO_COLOR is dropped: next to FORCE_COLOR it makes npx/Playwright print a
// warning on stderr, which Windows PowerShell 5.1 turns into a NativeCommandError that looks like a failure.
// Judge Playwright runs by exit code and the JSON report, never by stderr.
function playwrightEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NO_COLOR;
  return env;
}

// Where a credential is set, without ever returning its value: "environment", ".env" or null.
// QA_* may come from the workspace .env (gitignored, Claude has no access); JIRA_* only from the environment, because
// jira-attach.js reads them from there. claude.env never counts.
function credentialStatus(root, name) {
  if (process.env[name]) return "environment";
  if (/^JIRA_/.test(name)) return null;
  const f = path.join(root, ".env");
  if (!fs.existsSync(f)) return null;
  const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(\\S.*)$`, "m");
  const m = fs.readFileSync(f, "utf8").match(re);
  return m && m[1].replace(/^(['"])(.*)\1\s*$/, "$2").trim() ? ".env" : null;
}

module.exports = { resolveEnv, blockedReason, hostBlocked, environmentsConfig, playwrightCli, playwrightEnv, credentialStatus };
