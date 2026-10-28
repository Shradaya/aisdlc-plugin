#!/usr/bin/env node
// Add or update a target environment in the workspace's config/environments.yaml, keeping its header comments.
// Usage:
//   node add-env.js <name> --base-url <url> [--login none|form|manual] [--login-path /login]
//        [--username-label Email] [--password-label Password] [--submit-name "Sign in"] [--success-url "**/home"]
//        [--username-selector "#email"] [--password-selector "#password"] [--submit-selector "button[type=submit]"]
//        [--test-id-attribute data-testid] [--disabled] [--default] [--force] [--dry-run]
//   node add-env.js --block-host <host>|=<host> [--dry-run]  add a production host to blocked_hosts (=host: exact host only)
// A new environment allows automation unless --disabled; --force is needed to change an existing one. The production
// guard runs before anything is written: a blocked or production-looking host is refused.
// Output: one JSON line. Exit 0 ok, 1 refused/error, 2 not a workspace.
const fs = require("fs");
const path = require("path");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const { blockedReason, hostBlocked } = require("./env");

const ROOT = resolveRoot();
const args = process.argv.slice(2);
const VALUED = ["--base-url", "--login", "--login-path", "--username-label", "--password-label", "--submit-name", "--success-url", "--test-id-attribute", "--block-host", "--username-selector", "--password-selector", "--submit-selector"];
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);
const name = args.find((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]));
const done = (o, code) => { console.log(JSON.stringify(o)); process.exit(code); };

if (!ROOT) done({ ok: false, error: NOT_WORKSPACE }, 2);
const file = path.join(ROOT, "config", "environments.yaml");
const HEADER = "# Target environments for QA test runs (see /aisdlc-qa:add-env). JSON-compatible YAML; '#' comments only on their own lines.\n";
const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : HEADER + "{}\n";
// Keep the leading comment block; the rest is JSON (full-line comments inside it are dropped on rewrite).
const lines = text.split(/\r?\n/);
const firstJson = lines.findIndex((l) => l.trim() && !l.trim().startsWith("#"));
const header = lines.slice(0, Math.max(0, firstJson)).join("\n");
let cfg;
try { cfg = JSON.parse(lines.slice(firstJson).join("\n").replace(/^\s*#.*$/gm, "")); }
catch (e) { done({ ok: false, error: `config/environments.yaml is not valid: ${e.message}` }, 1); }
cfg.environments = cfg.environments || {};
cfg.blocked_hosts = cfg.blocked_hosts || [];
const changes = [];

const blockHost = opt("--block-host");
if (blockHost) {
  // "host" blocks the host and its subdomains; "=host" blocks only that exact host.
  const exact = blockHost.startsWith("=");
  const h = blockHost.replace(/^=/, "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+$/.test(h)) done({ ok: false, error: `not a host name: ${blockHost}` }, 1);
  const entry = (exact ? "=" : "") + h;
  // Never write a block that refuses an environment configured for automation: say which, and offer the exact form.
  const hit = Object.entries(cfg.environments).filter(([, e]) => {
    if (e.allow_automation !== true) return false;
    try { return hostBlocked(entry, new URL(e.base_url).hostname.toLowerCase()); } catch { return false; }
  }).map(([n, e]) => `${n} (${e.base_url})`);
  if (hit.length)
    done({ ok: false, error: `blocking "${entry}" would also block ${hit.join(", ")}.` +
      (!exact && hit.every((x) => !x.includes(`//${h}`)) ? ` To block only ${h} itself (not its subdomains), use --block-host "=${h}".` : " Disable or change that environment first.") }, 1);
  if (!cfg.blocked_hosts.includes(entry)) { cfg.blocked_hosts.push(entry); changes.push(`blocked_hosts += ${entry}`); }
}

if (name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) done({ ok: false, error: "environment name must be lowercase letters, digits and dashes (e.g. qa, uat, staging-2)" }, 1);
  const existing = cfg.environments[name];
  if (existing && !flag("--force")) done({ ok: false, error: `environment '${name}' already exists; pass --force to change it`, current: existing }, 1);
  const baseUrl = opt("--base-url") || (existing && existing.base_url);
  if (!baseUrl) done({ ok: false, error: "--base-url is required" }, 1);
  let host;
  try {
    const u = new URL(baseUrl);
    if (!/^https?:$/.test(u.protocol)) throw new Error("not http(s)");
    host = u.hostname.toLowerCase();
  } catch { done({ ok: false, error: `not a valid http(s) URL: ${baseUrl}` }, 1); }
  const blocked = blockedReason(ROOT, host, cfg);
  if (blocked) done({ ok: false, error: blocked }, 1);
  const mode = opt("--login") || (existing && existing.login && existing.login.mode) || "none";
  if (!["none", "form", "manual"].includes(mode)) done({ ok: false, error: "--login must be none, form or manual" }, 1);
  for (const k of ["username", "password", "submit"]) {
    const sel = opt(`--${k}-selector`);
    if (sel && /\.(css-[a-z0-9]+|jss\d+|Mui[A-Za-z]+-|sc-[a-zA-Z]{5,})/.test(sel))
      done({ ok: false, error: `--${k}-selector "${sel}" uses generated class names, which change between builds; use an id ("#email"), name ("[name=password]"), type ("button[type=submit]") or the visible label instead` }, 1);
  }
  const prev = (existing && existing.login) || {};
  const login = mode === "form"
    ? {
        mode,
        path: opt("--login-path") || prev.path || "/login",
        username_label: opt("--username-label") || prev.username_label || "Email",
        password_label: opt("--password-label") || prev.password_label || "Password",
        submit_name: opt("--submit-name") || prev.submit_name || "Sign in",
        success_url: opt("--success-url") ?? prev.success_url ?? "",
        // Optional selectors win over the labels; never generated class-name chains.
        ...Object.fromEntries(["username", "password", "submit"].map((k) => [`${k}_selector`, opt(`--${k}-selector`) ?? prev[`${k}_selector`]]).filter(([, v]) => v)),
      }
    : { mode };
  cfg.environments[name] = {
    base_url: baseUrl,
    allow_automation: !flag("--disabled"),
    data: "synthetic",
    test_id_attribute: opt("--test-id-attribute") || (existing && existing.test_id_attribute) || "data-testid",
    login,
  };
  changes.push(`${existing ? "updated" : "added"} environment ${name} (${baseUrl}, login ${mode}${flag("--disabled") ? ", automation off" : ""})`);
  if (flag("--default") || !cfg.default) { cfg.default = name; changes.push(`default = ${name}`); }
}

if (!name && !blockHost) done({ ok: false, error: "usage: add-env.js <name> --base-url <url> [...] | --block-host <host>" }, 1);
const ordered = { default: cfg.default, environments: cfg.environments, blocked_hosts: cfg.blocked_hosts };
for (const [k, v] of Object.entries(cfg)) if (!(k in ordered)) ordered[k] = v;
const out = (header ? header + "\n" : HEADER) + JSON.stringify(ordered, null, 2) + "\n";
if (!flag("--dry-run")) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
}
done({ ok: true, dry_run: flag("--dry-run"), file: "config/environments.yaml", changes, environment: name ? cfg.environments[name] : undefined }, 0);
