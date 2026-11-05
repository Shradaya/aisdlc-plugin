#!/usr/bin/env node
// AISDLC server client: login, init --project, push <TICKET|*|plugin>, pull <TICKET|plugin>, resolve-repo-path.
// Canonical copy under packages/aisdlc-core/server/; vendored into each plugin (plugins/<p>/scripts/server/) by
// scripts/sync-core.js. Zero dependencies (Node 18+ for fetch).
//
// What lives where:
//   - credentials (bearer token): outside every workspace, in %APPDATA%\aisdlc\credentials.json
//     (or $XDG_CONFIG_HOME/aisdlc, ~/.config/aisdlc). Never printed. AISDLC_TOKEN overrides it.
//   - workspace binding and sync state: <workspace>/.aisdlc/{server.json,sync.json} (gitignored, no secrets)
//   - local paths for repositories: claude.env (AISDLC_REPO_<NAME>), written by resolve-repo-path
// The server decides, per role (workspace profile), which files init/pull download and push may upload.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;
const REPO_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const SKIP_DIRS = new Set([".git", ".aisdlc", "node_modules", "tasks", "logs", "web", "reviews", ".claude", ".kiro", ".auth", "test-results", "playwright-report", ".playwright-mcp", "preview"]);
const MAX_FILES_PER_REQUEST = 200;
const MAX_BYTES_PER_REQUEST = 15 * 1048576;

// ---------------------------------------------------------------------------------------------
// small utils

function die(msg, code = 1) {
  console.error("error: " + msg);
  process.exit(code);
}
const sha = (buf) => "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");
const posix = (p) => p.split(path.sep).join("/");
const readJson = (f, dflt) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return dflt;
  }
};
function writeJson(f, data, mode) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", mode ? { mode } : undefined);
  fs.renameSync(tmp, f);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) out[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// credentials (outside the workspace)

function configDir() {
  if (process.env.AISDLC_CONFIG_DIR) return path.resolve(process.env.AISDLC_CONFIG_DIR);
  if (process.platform === "win32" && process.env.APPDATA) return path.join(process.env.APPDATA, "aisdlc");
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, "aisdlc");
  return path.join(os.homedir(), ".config", "aisdlc");
}
const credFile = () => path.join(configDir(), "credentials.json");
const loadCreds = () => readJson(credFile(), { servers: {} });
function saveCreds(c) {
  writeJson(credFile(), c, 0o600);
  try {
    fs.chmodSync(credFile(), 0o600);
  } catch {}
}

function normalizeServer(url) {
  if (!url || typeof url !== "string") die("--server <url> is required (for example http://127.0.0.1:3001)");
  let u;
  try {
    u = new URL(url);
  } catch {
    die(`invalid server URL: ${url}`);
  }
  if (!/^https?:$/.test(u.protocol)) die("server URL must start with http:// or https://");
  if (u.protocol === "http:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) {
    console.error(`warning: ${u.host} uses plain http; your token is sent unencrypted. Use https outside your own machine.`);
  }
  return u.origin + u.pathname.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------------------------
// workspace binding

function findWorkspace(start) {
  if (process.env.AISDLC_ROOT) return path.resolve(process.env.AISDLC_ROOT.trim());
  for (let dir = path.resolve(start); dir; ) {
    if (fs.existsSync(path.join(dir, "config", "repositories.yaml")) || fs.existsSync(path.join(dir, ".aisdlc", "server.json"))) return dir;
    const parent = path.dirname(dir);
    dir = parent === dir ? null : parent;
  }
  return null;
}
const bindingFile = (root) => path.join(root, ".aisdlc", "server.json");
const syncFile = (root) => path.join(root, ".aisdlc", "sync.json");
function loadSync(root) {
  const s = readJson(syncFile(root), {});
  return { files: s.files || {}, repos: s.repos || {}, tickets: s.tickets || {} };
}
const saveSync = (root, s) => writeJson(syncFile(root), s);

function workspaceKind(root) {
  try {
    const text = fs.readFileSync(path.join(root, "config", "workspace.yaml"), "utf8").replace(/^\s*#.*$/gm, "");
    return (JSON.parse(text).workspace || {}).kind || null;
  } catch {
    return null;
  }
}
const KIND_TO_PROFILE = { dev: "dev", design: "design", qa: "qa", pm: "pm" };

/** Resolves the bound workspace (or dies with a hint). */
function bound(args) {
  const root = findWorkspace(args.root || process.cwd());
  if (!root) die("not inside an aisdlc workspace. Run init first: aisdlc-server init --server <url> --project <name>");
  const b = readJson(bindingFile(root), null);
  if (!b || !b.server || !b.project) die(`this workspace is not linked to a server yet. Run: aisdlc-server init --server <url> --project <name>`);
  if (args.profile) b.profile = args.profile;
  return { root, ...b };
}

// ---------------------------------------------------------------------------------------------
// HTTP

class ServerError extends Error {
  constructor(status, body) {
    super((body && body.message) || `HTTP ${status}`);
    this.status = status;
    this.body = body || {};
    this.code = this.body.error || "error";
  }
}

function tokenFor(server) {
  if (process.env.AISDLC_TOKEN) return process.env.AISDLC_TOKEN.trim();
  const c = loadCreds().servers[server];
  return c && c.token ? c.token : null;
}

async function http(server, method, p, body, { auth = true } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth) {
    const tok = tokenFor(server);
    if (!tok) die(`not logged in to ${server}. Run: aisdlc-server login --server ${server}`);
    headers.authorization = "Bearer " + tok;
  }
  let res;
  try {
    res = await fetch(server + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    die(`cannot reach ${server} (${e.cause && e.cause.code ? e.cause.code : e.message}). Is the server running?`);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (res.status === 401 && auth) die(`your session for ${server} expired or was revoked. Run: aisdlc-server login --server ${server}`);
  if (!res.ok) throw new ServerError(res.status, json);
  return json;
}

function fail(e) {
  if (!(e instanceof ServerError)) throw e;
  const b = e.body;
  if (e.code === "password_change_required") die("you must change your password first: aisdlc-server change-password (or in the web UI)");
  if (e.code === "profile_required") die(`you can work in several workspaces; pass --profile ${(b.profiles || []).join("|")}`);
  if (e.code === "stale_knowledge") {
    for (const s of b.stale || []) console.error(`  stale: ${s.repository ? "repositories/" + s.repository + "/" : s.path} (yours v${s.base}, server v${s.current})`);
    die("the server has newer versions. Run: aisdlc-server pull plugin, then push again");
  }
  if (e.code === "secret_detected") die(`${b.path} looks like it contains a secret (${b.rule}, line ${b.line}). Remove it and push again.`);
  die(`${e.code}: ${e.message}`);
}

const q = (o) => {
  const s = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return s ? "?" + s : "";
};
const P = (slug) => `/projects/${encodeURIComponent(slug)}`;

// ---------------------------------------------------------------------------------------------
// prompts (password input is never echoed)

function ask(question, { hidden = false } = {}) {
  if (!process.stdin.isTTY) return Promise.resolve(null);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = function (s) {
        if (s.includes(question)) rl.output.write(question);
        else if (s === "\r\n" || s === "\n") rl.output.write(s);
      };
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a);
    });
  });
}

// ---------------------------------------------------------------------------------------------
// commands: login / logout / whoami / change-password

async function cmdLogin(args) {
  const root = findWorkspace(process.cwd());
  const b = root ? readJson(bindingFile(root), null) : null;
  const server = normalizeServer(args.server || (b && b.server));
  const username = args.username || process.env.AISDLC_USERNAME || (await ask("Username: "));
  const password = process.env.AISDLC_PASSWORD || (await ask("Password: ", { hidden: true }));
  if (!username || !password) die("username and password are required (interactive terminal, or AISDLC_USERNAME and AISDLC_PASSWORD)");
  let r;
  try {
    r = await http(server, "POST", "/auth/login", { username, password, client: "cli" }, { auth: false });
  } catch (e) {
    if (e instanceof ServerError && e.status === 401) die("invalid username or password");
    if (e instanceof ServerError && e.status === 429) die("too many failed attempts; wait and try again");
    return fail(e);
  }
  const c = loadCreds();
  c.servers[server] = { token: r.token, username: r.user.username, expiresAt: r.expiresAt };
  saveCreds(c);
  console.log(`logged in to ${server} as ${r.user.username} (${r.user.role || "user"})`);
  console.log(`token stored in ${credFile()} (outside your workspace; never commit or print it)`);
  if (r.mustChangePassword) console.log("you must change your password before continuing: aisdlc-server change-password");
}

async function cmdLogout(args) {
  const root = findWorkspace(process.cwd());
  const b = root ? readJson(bindingFile(root), null) : null;
  const server = normalizeServer(args.server || (b && b.server));
  const c = loadCreds();
  if (c.servers[server]) {
    try {
      await http(server, "POST", "/auth/logout");
    } catch {}
    delete c.servers[server];
    saveCreds(c);
  }
  console.log(`logged out of ${server}`);
}

async function cmdWhoami(args) {
  const root = findWorkspace(process.cwd());
  const b = root ? readJson(bindingFile(root), null) : null;
  const server = normalizeServer(args.server || (b && b.server));
  const me = await http(server, "GET", "/me").catch(fail);
  console.log(`${me.user.username} (${me.user.displayName}) on ${server}`);
  console.log(`role: ${me.role || me.user.role}`);
  console.log(`projects: ${me.projects.map((p) => p.slug).join(", ") || "(none)"}`);
  if (b) console.log(`this workspace: project ${b.project}, profile ${b.profile}`);
}

async function cmdChangePassword(args) {
  const root = findWorkspace(process.cwd());
  const b = root ? readJson(bindingFile(root), null) : null;
  const server = normalizeServer(args.server || (b && b.server));
  const current = await ask("Current password: ", { hidden: true });
  const next = await ask("New password (8+ characters): ", { hidden: true });
  const again = await ask("Repeat new password: ", { hidden: true });
  if (!current || !next) die("run this in an interactive terminal");
  if (next !== again) die("the new passwords do not match");
  await http(server, "POST", "/auth/change-password", { current, new: next }).catch(fail);
  console.log("password changed");
}

// ---------------------------------------------------------------------------------------------
// file helpers

function writeServerFile(root, rel, f) {
  const abs = path.join(root, ...rel.split("/"));
  if (!abs.startsWith(path.resolve(root) + path.sep)) die(`refusing to write outside the workspace: ${rel}`);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, f.encoding === "base64" ? Buffer.from(f.content, "base64") : Buffer.from(f.content, "utf8"));
}

/**
 * Writes server files into the workspace without losing local edits. Returns counts.
 * A local file that changed since the last sync and also changed on the server is kept; the server copy is
 * written next to it as <file>.server so you can merge by hand.
 */
function applyServerFiles(root, files, sync, { dryRun, force, log }) {
  const out = { written: 0, same: 0, keptLocal: 0, conflicts: [] };
  for (const f of files) {
    const abs = path.join(root, ...f.path.split("/"));
    const local = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    const prev = sync.files[f.path];
    const localHash = local ? sha(local) : null;
    if (localHash === f.sha256) {
      out.same++;
    } else if (!local || force || (prev && localHash === prev.sha256)) {
      if (!dryRun) writeServerFile(root, f.path, f);
      log(`  ${local ? "update" : "add   "} ${f.path} (v${f.version})`);
      out.written++;
    } else if (prev && prev.version === f.version) {
      out.keptLocal++; // you changed it locally; the server has not moved: push it when ready
      continue;
    } else {
      if (!dryRun) writeServerFile(root, f.path + ".server", f);
      out.conflicts.push(f.path);
      log(`  CONFLICT ${f.path}: kept your copy, server v${f.version} saved as ${f.path}.server`);
      continue; // keep the old base so the next push is refused until merged
    }
    if (!dryRun) sync.files[f.path] = { version: f.version, sha256: f.sha256, scope: f.scope };
  }
  return out;
}

function walk(root, dir = root, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") && e.name !== ".claude") {
      if (e.isDirectory()) continue;
    }
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === root && SKIP_DIRS.has(e.name)) continue;
      if (e.name === "node_modules" || e.name === ".git") continue;
      walk(root, abs, out);
    } else if (e.isFile() && !e.name.endsWith(".server") && !e.name.endsWith(".tmp")) {
      out.push(posix(path.relative(root, abs)));
    }
  }
  return out;
}

const compileRules = (rules) => rules.map((r) => ({ re: new RegExp(`^(?:${r.pattern})$`), binary: !!r.binary }));
const matchRule = (rules, p) => rules.find((r) => r.re.test(p)) || null;
const wildcard = (list, name) =>
  list.some((e) => (e.includes("*") ? new RegExp("^" + e.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9._-]*") + "$").test(name) : e === name));

function ensureGitignore(root) {
  const gi = path.join(root, ".gitignore");
  const have = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  const lines = [".aisdlc/", "*.server"].filter((l) => !have.split(/\r?\n/).includes(l));
  if (lines.length) fs.appendFileSync(gi, (have && !have.endsWith("\n") ? "\n" : "") + "# aisdlc server sync (local only)\n" + lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------------------------
// init / status / repos

async function cmdInit(args) {
  const server = normalizeServer(args.server);
  const project = args.project;
  if (!project || project === true) die("--project <name> is required");
  const target = path.resolve(args.target || args._[0] || process.cwd());
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  const dryRun = !!args["dry-run"];
  const profile = args.profile || KIND_TO_PROFILE[workspaceKind(target)] || undefined;

  const boot = await http(server, "GET", `${P(project)}/bootstrap${q({ profile })}`).catch(fail);
  const prof = boot.profile.id;
  console.log(`${boot.project.displayName} (${boot.project.slug}) on ${server}`);
  console.log(`you: ${boot.caller.username}, role ${boot.caller.roles.join(", ")} -> ${prof} workspace (${boot.profile.description})`);
  console.log(`${dryRun ? "would write" : "writing"} into ${target}`);

  const sync = loadSync(target);
  const files = (await http(server, "GET", `${P(project)}/knowledge/files${q({ profile: prof })}`).catch(fail)).files;
  const res = applyServerFiles(target, files, sync, { dryRun, force: !!args.force, log: console.log });

  // The folder must be a workspace for the plugin's hooks and CLIs (config/repositories.yaml marks it).
  const marker = path.join(target, "config", "repositories.yaml");
  if (!fs.existsSync(marker) && !dryRun) {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, '# aisdlc workspace marker\n{"repositories": {}}\n');
  }

  let repos = [];
  if (boot.repositories) {
    const want = args["all-repos"] ? boot.repositories.filter((r) => r.docCount > 0).map((r) => r.name) : args.repos ? String(args.repos).split(",").map((s) => s.trim()).filter(Boolean) : [];
    for (const r of want) if (!boot.repositories.some((x) => x.name === r)) die(`unknown repository ${r}; see: aisdlc-server repos`);
    repos = await fetchRepos(server, project, prof, target, want, sync, { dryRun, force: !!args.force });
  }

  if (!dryRun) {
    writeJson(bindingFile(target), { server, project, profile: prof, repos, linkedAt: new Date().toISOString() });
    saveSync(target, sync);
    ensureGitignore(target);
  }
  console.log(`\n${res.written} file(s) written, ${res.same} already up to date${res.conflicts.length ? `, ${res.conflicts.length} conflict(s)` : ""}`);
  if (boot.repositories) {
    const sel = new Set(repos);
    console.log(`\nrepositories (${boot.repositories.length} on the server, ${sel.size} downloaded):`);
    for (const r of boot.repositories) console.log(`  ${sel.has(r.name) ? "*" : " "} ${r.name}${r.role ? " - " + r.role : ""}${r.docCount ? "" : " (no docs yet)"}`);
    if (sel.size === 0) console.log("\npick the repositories you work on: aisdlc-server add-repos <name,name>");
    else {
      console.log("\nnext: clone each repository you selected and tell the workspace where it is:");
      for (const r of boot.repositories.filter((x) => sel.has(x.name))) {
        console.log(`  git clone ${r.remote || "<remote>"}   then   aisdlc-server resolve-repo-path ${r.name} <path-to-clone>`);
      }
    }
  }
}

async function fetchRepos(server, project, profile, root, names, sync, { dryRun, force }) {
  if (names.length === 0) return [];
  const got = [];
  for (let i = 0; i < names.length; i += 20) {
    const chunk = names.slice(i, i + 20);
    const r = await http(server, "POST", `${P(project)}/knowledge/repositories/fetch${q({ profile })}`, { repos: chunk }).catch(fail);
    for (const pkg of r.repositories) {
      console.log(`repository ${pkg.name} (package v${pkg.packageVersion}${pkg.analyzedCommit ? ", analyzed " + String(pkg.analyzedCommit).slice(0, 10) : ""})`);
      applyServerFiles(root, pkg.files, sync, { dryRun, force, log: console.log });
      if (!dryRun) sync.repos[pkg.name] = pkg.packageVersion;
      got.push(pkg.name);
    }
  }
  return got;
}

async function cmdRepos(args) {
  const b = bound(args);
  const boot = await http(b.server, "GET", `${P(b.project)}/bootstrap${q({ profile: b.profile })}`).catch(fail);
  if (!boot.repositories) die(`the ${b.profile} workspace does not include repository knowledge`);
  const sel = new Set(b.repos || []);
  for (const r of boot.repositories) {
    console.log(`${sel.has(r.name) ? "*" : " "} ${r.name.padEnd(32)} v${r.packageVersion}  ${r.role || ""}${r.docCount ? "" : " (no docs yet)"}`);
  }
  console.log("\n* = downloaded into this workspace. Add more with: aisdlc-server add-repos <name,name>");
}

async function cmdAddRepos(args) {
  const b = bound(args);
  const names = String(args._[1] || args.repos || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) die("usage: aisdlc-server add-repos <name,name>");
  for (const n of names) if (!REPO_RE.test(n)) die(`invalid repository name ${n}`);
  const sync = loadSync(b.root);
  const got = await fetchRepos(b.server, b.project, b.profile, b.root, names, sync, { dryRun: !!args["dry-run"], force: !!args.force });
  if (!args["dry-run"]) {
    writeJson(bindingFile(b.root), { ...readJson(bindingFile(b.root), {}), repos: [...new Set([...(b.repos || []), ...got])] });
    saveSync(b.root, sync);
  }
  console.log(`added ${got.join(", ")}. Clone them, then: aisdlc-server resolve-repo-path <name> <path>`);
}

async function cmdStatus(args) {
  const b = bound(args);
  const me = await http(b.server, "GET", "/me").catch(fail);
  const sync = loadSync(b.root);
  console.log(`workspace ${b.root}`);
  console.log(`server ${b.server}, project ${b.project}, profile ${b.profile}, you ${me.user.username} (${me.role || me.user.role})`);
  console.log(`synced files: ${Object.keys(sync.files).length}, repositories: ${(b.repos || []).join(", ") || "none"}, tickets: ${Object.keys(sync.tickets).join(", ") || "none"}`);
}

// ---------------------------------------------------------------------------------------------
// tickets: what is waiting on me

/** Lifecycle id for a ticket type ("feature" tickets run the "unified" lifecycle). */
const lifecycleIdFor = (type) => (type === "feature" ? "unified" : type);

async function cmdTickets(args) {
  const b = bound(args);
  const me = await http(b.server, "GET", "/me").catch(fail);
  const role = me.role || (me.user && me.user.role);
  const list = (await http(b.server, "GET", `${P(b.project)}/tickets`).catch(fail)).tickets;
  const lifecycles = (await http(b.server, "GET", "/lifecycles").catch(fail)).lifecycles || {};
  const rows = list.map((t) => {
    const lc = lifecycles[lifecycleIdFor(t.type)];
    // A failure state (BLOCKED, ...) belongs to the phase the ticket left.
    const phase = lc && lc.failureStates && lc.failureStates.includes(t.status) && t.resumeState ? t.resumeState : t.status;
    const def = lc && lc.states.find((s) => s.id === phase);
    const owners = def ? def.ownerRoles : [];
    const mine = t.access !== "read" && (role === "admin" ? false : owners.includes(role));
    return { ...t, owners, mine };
  });
  const shown = args.all ? rows : rows.filter((r) => r.mine);
  if (shown.length === 0) {
    return console.log(args.all ? "no tickets visible to you" : `nothing is waiting on ${role}. (--all lists every ticket you can see)`);
  }
  console.log(args.all ? `tickets visible to ${me.user.username} (${role}); * = waiting on you` : `waiting on ${role} (${me.user.username}):`);
  for (const r of shown.sort((x, y) => String(x.key).localeCompare(String(y.key)))) {
    const flag = r.mine ? "*" : " ";
    const failure = r.resumeState && r.resumeState !== r.status ? ` (resume at ${r.resumeState})` : "";
    const owner = r.owners.length ? `owner: ${r.owners.join("/")}` : "";
    console.log(`${flag} ${r.key}  ${r.status}${failure}  ${r.type}  ${owner}  ${r.title}`);
  }
}

// ---------------------------------------------------------------------------------------------
// pull

async function cmdPull(args) {
  const target = args._[1];
  if (!target) die("usage: aisdlc-server pull <TICKET>|plugin");
  const b = bound(args);
  const sync = loadSync(b.root);
  const dryRun = !!args["dry-run"];

  if (target === "plugin") {
    const files = (await http(b.server, "GET", `${P(b.project)}/knowledge/files${q({ profile: b.profile })}`).catch(fail)).files;
    const r = applyServerFiles(b.root, files, sync, { dryRun, force: !!args.force, log: console.log });
    if (b.repos && b.repos.length) await fetchRepos(b.server, b.project, b.profile, b.root, b.repos, sync, { dryRun, force: !!args.force });
    if (!dryRun) saveSync(b.root, sync);
    console.log(`pull plugin: ${r.written} updated, ${r.same} unchanged, ${r.keptLocal} local edits kept${r.conflicts.length ? `, ${r.conflicts.length} conflict(s) (see *.server files)` : ""}`);
    return;
  }

  if (!TICKET_RE.test(target)) die(`not a ticket key: ${target} (expected like EL-123)`);
  const r = await http(b.server, "GET", `${P(b.project)}/tickets/${encodeURIComponent(target)}/pull${q({ profile: b.profile })}`).catch(fail);
  const dir = `tasks/${target}`;
  const t = sync.tickets[target] || { artifacts: {}, logLines: 0 };
  const files = r.artifacts.map((a) => ({ path: `${dir}/${a.name}`, version: a.version, sha256: a.sha256, encoding: a.encoding, content: a.content }));
  const shadow = { files: Object.fromEntries(Object.entries(t.artifacts).map(([n, v]) => [`${dir}/${n}`, v])) };
  const res = applyServerFiles(b.root, files, shadow, { dryRun, force: !!args.force, log: console.log });
  if (!dryRun) {
    fs.mkdirSync(path.join(b.root, "tasks", target), { recursive: true });
    const tk = r.ticket;
    writeJson(path.join(b.root, "tasks", target, "server-ticket.json"), {
      key: tk.key,
      title: tk.title,
      type: tk.type,
      status: tk.status,
      access: tk.access,
      stateVersion: tk.stateVersion,
      owners: tk.owners,
      gates: tk.gates.map((g) => ({ gate: g.gate, status: g.status, artifact: g.artifact, version: g.version })),
      nextStates: tk.nextStates.filter((n) => n.allowed).map((n) => n.to),
      pulledAt: new Date().toISOString()
    });
    t.artifacts = Object.fromEntries(Object.entries(shadow.files).map(([p, v]) => [p.slice(dir.length + 1), { version: v.version, sha256: v.sha256 }]));
    t.stateVersion = r.ticket.stateVersion;
    sync.tickets[target] = t;
    saveSync(b.root, sync);
  }
  console.log(`${target}: ${r.ticket.title}`);
  console.log(`phase ${r.ticket.status}${r.ticket.access === "read" ? " (view only: outside your phases)" : ""}; ${res.written} file(s) updated, ${res.same} unchanged`);
  const open = r.ticket.nextStates.filter((n) => n.allowed).map((n) => n.to);
  if (open.length) console.log(`you can move it to: ${open.join(", ")}  (aisdlc-server push ${target} --to <PHASE>)`);
  if (!fs.existsSync(path.join(b.root, "tasks", target, "task.yaml"))) {
    console.log(`note: no local task record yet; start the local workflow for ${target} with your plugin's command (for example /aisdlc-dev:feature ${target}).`);
  }
}

// ---------------------------------------------------------------------------------------------
// push

function ticketArtifacts(root, key, profile, prevArtifacts) {
  const dir = path.join(root, "tasks", key);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (!fs.statSync(abs).isFile() || !wildcard(profile.ticket.push, name)) continue;
    const data = fs.readFileSync(abs);
    const h = sha(data);
    if (prevArtifacts[name] && prevArtifacts[name].sha256 === h) continue; // unchanged since last sync
    out.push({ name, content_base64: data.toString("base64"), sha256: h });
  }
  return out;
}

function newLogEvents(root, key, fromLine) {
  const f = path.join(root, "tasks", key, "execution-log.jsonl");
  if (!fs.existsSync(f)) return { events: [], lines: fromLine };
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean);
  const events = [];
  for (const line of lines.slice(fromLine).slice(0, 500)) {
    try {
      const e = JSON.parse(line);
      const name = String(e.event || "event").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+/, "").slice(0, 60) || "event";
      const { event, timestamp, task, ...rest } = e;
      events.push({ event: name, ts: typeof timestamp === "string" ? timestamp.slice(0, 40) : undefined, payload: rest });
    } catch {}
  }
  return { events, lines: Math.min(lines.length, fromLine + 500) };
}

/** The plugin's local task state (tasks/<T>/task.yaml, JSON), or null. */
function localTaskState(root, key) {
  const t = readJson(path.join(root, "tasks", key, "task.yaml"), null);
  if (!t || !t.task || typeof t.task.status !== "string") return null;
  return { status: t.task.status, reason: typeof t.task.reason === "string" ? t.task.reason.slice(0, 2000) : undefined };
}

/** Plugin kind for local_state: the workspace marker, else the profile (pm now has a plugin state machine too). */
function pluginKind(root, profile) {
  const k = workspaceKind(root) || profile;
  return k === "dev" || k === "design" || k === "qa" || k === "pm" ? k : null;
}

async function pushTicketBody(b, key, prof, sync, args) {
  const t = sync.tickets[key] || { artifacts: {}, logLines: 0 };
  const artifacts = ticketArtifacts(b.root, key, prof, t.artifacts);
  const log = newLogEvents(b.root, key, t.logLines || 0);
  const transitions = args.to ? [{ to: String(args.to).toUpperCase(), reason: args.reason || undefined }] : [];
  // Without an explicit --to, the server follows the plugin's own state (mapped to its phase).
  const kind = pluginKind(b.root, b.profile);
  const local = kind && !args.to && !args["no-state"] ? localTaskState(b.root, key) : null;
  const stateChanged = local && local.status !== t.localStatus;
  const local_state = local && stateChanged ? { plugin: kind, status: local.status, reason: local.reason } : undefined;
  return { t, artifacts, log, transitions, local_state, localStatus: local && local.status };
}

function describeSync(s) {
  if (!s) return "";
  if (s.skipped) return `\n  local state ${s.localStatus}: ${s.skipped}`;
  const moved = s.from === s.reached ? `stays at ${s.reached}` : `${s.from} -> ${s.reached}`;
  return `\n  local state ${s.localStatus} -> server ${moved}${s.stopped ? `\n  stopped before ${s.stopped.at}: ${s.stopped.message}` : ""}`;
}

function recordTicketPush(sync, key, t, artifacts, log, stateVersion, res, localStatus) {
  for (const a of artifacts) t.artifacts[a.name] = { version: null, sha256: a.sha256 };
  t.logLines = log.lines;
  t.stateVersion = stateVersion;
  // Remember the local state only once the server reached it, so a stopped sync is retried on the next push.
  if (localStatus && res && res.sync && !res.sync.stopped) t.localStatus = localStatus;
  sync.tickets[key] = t;
}

async function cmdPush(args) {
  const target = args._[1];
  if (!target) die("usage: aisdlc-server push <TICKET>|*|plugin [--to PHASE --reason ...] [--dry-run]");
  const b = bound(args);
  if (target === "plugin") return pushPlugin(b, args);
  const boot = await http(b.server, "GET", `${P(b.project)}/bootstrap${q({ profile: b.profile })}`).catch(fail);
  const prof = boot.profile;
  const sync = loadSync(b.root);
  const dryRun = !!args["dry-run"];

  if (target === "*" || target === "all") {
    const keys = fs.existsSync(path.join(b.root, "tasks")) ? fs.readdirSync(path.join(b.root, "tasks")).filter((k) => TICKET_RE.test(k)) : [];
    if (keys.length === 0) die("no local tickets under tasks/");
    const visible = new Map((await http(b.server, "GET", `${P(b.project)}/tickets`).catch(fail)).tickets.map((x) => [x.key, x]));
    const items = [];
    const plans = {};
    for (const key of keys) {
      const v = visible.get(key);
      if (!v) {
        console.log(`  skip ${key}: not on the server or not in your phases`);
        continue;
      }
      if (v.access === "read") {
        console.log(`  skip ${key}: view only (outside your phases)`);
        continue;
      }
      const p = await pushTicketBody(b, key, prof, sync, {});
      if (p.artifacts.length === 0 && p.log.events.length === 0 && !p.local_state) {
        console.log(`  ok   ${key}: nothing new`);
        continue;
      }
      plans[key] = p;
      items.push({ key, expected_state_version: v.stateVersion, artifacts: p.artifacts, audit_events: p.log.events, local_state: p.local_state });
      console.log(
        `  push ${key}: ${p.artifacts.map((a) => a.name).join(", ") || "no files"}${p.log.events.length ? `, ${p.log.events.length} log event(s)` : ""}${p.local_state ? `, state ${p.local_state.status}` : ""}`
      );
    }
    if (dryRun || items.length === 0) return console.log(dryRun ? "(dry run: nothing sent)" : "nothing to push");
    const r = await http(b.server, "POST", `${P(b.project)}/push`, { tickets: items }).catch(fail);
    let ok = 0;
    for (const res of r.results) {
      if (res.ok) {
        const p = plans[res.key];
        recordTicketPush(sync, res.key, p.t, p.artifacts, p.log, res.stateVersion, res, p.localStatus);
        if (res.sync) console.log(`  ${res.key}:${describeSync(res.sync)}`);
        ok++;
      } else console.log(`  FAILED ${res.key}: ${res.error}: ${res.message}`);
    }
    saveSync(b.root, sync);
    console.log(`push *: ${ok}/${r.results.length} ticket(s) pushed`);
    return;
  }

  if (!TICKET_RE.test(target)) die(`not a ticket key: ${target}`);
  let ticket = null;
  try {
    ticket = await http(b.server, "GET", `${P(b.project)}/tickets/${encodeURIComponent(target)}`);
  } catch (e) {
    if (!(e instanceof ServerError) || e.status !== 404) return fail(e);
  }
  const p = await pushTicketBody(b, target, prof, sync, args);
  if (!ticket) {
    if (!args.create) die(`${target} is not on the server (or not in your phases). A PM or admin creates tickets; or pass --create --title "..."`);
    if (!args.title || args.title === true) die('--create needs --title "<ticket title>"');
    if (dryRun) return console.log(`would create ${target} "${args.title}" and push ${p.artifacts.length} file(s)`);
    ticket = await http(b.server, "POST", `${P(b.project)}/tickets`, { key: target, type: args.type || "feature", title: args.title }).catch(fail);
    console.log(`created ${target} on the server`);
  }
  if (ticket.access === "read") die(`${target} is view only for you (it is outside your phases)`);
  if (p.artifacts.length === 0 && p.log.events.length === 0 && p.transitions.length === 0 && !p.local_state) {
    return console.log(`${target}: nothing new to push (phase ${ticket.status})`);
  }
  console.log(
    `${target}: ${p.artifacts.map((a) => a.name).join(", ") || "no files"}${p.log.events.length ? `, ${p.log.events.length} log event(s)` : ""}${
      p.transitions.length ? `, move to ${p.transitions[0].to}` : ""
    }${p.local_state ? `, local state ${p.local_state.status}` : ""}`
  );
  if (dryRun) return console.log("(dry run: nothing sent)");
  const r = await http(b.server, "POST", `${P(b.project)}/tickets/${encodeURIComponent(target)}/push`, {
    expected_state_version: ticket.stateVersion,
    artifacts: p.artifacts,
    transitions: p.transitions,
    audit_events: p.log.events,
    local_state: p.local_state
  }).catch((e) => {
    if (e instanceof ServerError && e.body && e.body.error === "artifact_not_in_profile") die(`${e.body.name} is not a file your workspace pushes`);
    if (e instanceof ServerError && e.status === 422) die(`${e.code}: ${e.message}`);
    return fail(e);
  });
  recordTicketPush(sync, target, p.t, p.artifacts, p.log, r.stateVersion, r, p.localStatus);
  saveSync(b.root, sync);
  console.log(`pushed ${target}: phase ${r.status}, version ${r.stateVersion}${describeSync(r.sync)}`);
}

async function pushPlugin(b, args) {
  const boot = await http(b.server, "GET", `${P(b.project)}/bootstrap${q({ profile: b.profile })}`).catch(fail);
  const rules = compileRules(boot.profile.knowledge.write);
  const repoRw = boot.profile.knowledge.repositories === "read-write";
  const sync = loadSync(b.root);
  const repoGroups = {};
  const shared = [];
  for (const rel of walk(b.root)) {
    const rule = matchRule(rules, rel);
    if (!rule) continue;
    const data = fs.readFileSync(path.join(b.root, ...rel.split("/")));
    const h = sha(data);
    const prev = sync.files[rel];
    if (prev && prev.sha256 === h) continue; // unchanged since last sync
    const file = { path: rel, content: rule.binary ? data.toString("base64") : data.toString("utf8"), encoding: rule.binary ? "base64" : "utf8" };
    const m = /^repositories\/([^/]+)\//.exec(rel);
    if (m) {
      if (!repoRw) continue;
      (repoGroups[m[1]] = repoGroups[m[1]] || []).push({ ...file, _sha: h, _size: data.length });
    } else shared.push({ ...file, base_version: prev ? prev.version : 0, _sha: h, _size: data.length });
  }
  const repoNames = Object.keys(repoGroups);
  const total = shared.length + repoNames.reduce((n, r) => n + repoGroups[r].length, 0);
  if (total === 0) return console.log("push plugin: nothing changed since the last sync");
  for (const r of repoNames) console.log(`  repositories/${r}/: ${repoGroups[r].map((f) => f.path.split("/").pop()).join(", ")}`);
  for (const s of shared) console.log(`  ${s.path}${s.base_version ? "" : " (new)"}`);
  if (args["dry-run"]) return console.log(`(dry run: ${total} file(s) would be pushed)`);

  // Send in batches: each repository package goes whole; shared docs are split by count and size.
  const batches = [];
  let cur = { repositories: [], shared: [], n: 0, bytes: 0 };
  const flush = () => {
    if (cur.n) batches.push(cur);
    cur = { repositories: [], shared: [], n: 0, bytes: 0 };
  };
  for (const r of repoNames) {
    const files = repoGroups[r];
    const bytes = files.reduce((n, f) => n + f._size, 0);
    if (cur.n + files.length > MAX_FILES_PER_REQUEST || cur.bytes + bytes > MAX_BYTES_PER_REQUEST) flush();
    cur.repositories.push({ name: r, base_package_version: sync.repos[r] || 0, files });
    cur.n += files.length;
    cur.bytes += bytes;
  }
  for (const s of shared) {
    if (cur.n + 1 > MAX_FILES_PER_REQUEST || cur.bytes + s._size > MAX_BYTES_PER_REQUEST) flush();
    cur.shared.push(s);
    cur.n++;
    cur.bytes += s._size;
  }
  flush();

  let changed = 0;
  for (const batch of batches) {
    const strip = (f) => ({ path: f.path, content: f.content, encoding: f.encoding });
    const body = {
      repositories: batch.repositories.length ? batch.repositories.map((r) => ({ name: r.name, base_package_version: r.base_package_version, files: r.files.map(strip) })) : undefined,
      shared: batch.shared.length ? batch.shared.map((s) => ({ ...strip(s), base_version: s.base_version })) : undefined
    };
    const r = await http(b.server, "POST", `${P(b.project)}/knowledge/push${q({ profile: b.profile })}`, body).catch(fail);
    for (const repo of r.repositories) {
      sync.repos[repo.name] = repo.packageVersion;
      for (const f of batch.repositories.find((x) => x.name === repo.name).files) sync.files[f.path] = { version: null, sha256: f._sha, scope: "shared" };
      changed += repo.changed.length;
    }
    for (const s of r.shared) {
      const sent = batch.shared.find((x) => x.path === s.path);
      sync.files[s.path] = { version: s.version, sha256: sent ? sent._sha : null, scope: s.scope };
      if (s.changed) changed++;
    }
    saveSync(b.root, sync);
  }
  console.log(`push plugin: ${changed} file(s) stored on the server (${total - changed} identical)`);
  const repos = [...new Set([...(b.repos || []), ...repoNames])];
  writeJson(bindingFile(b.root), { ...readJson(bindingFile(b.root), {}), repos });
}

// ---------------------------------------------------------------------------------------------
// resolve-repo-path: local clone location -> claude.env (never sent to the server)

function cmdResolveRepoPath(args) {
  const [, name, p] = args._;
  if (!name || !p) die("usage: aisdlc-server resolve-repo-path <repository> <path-to-local-clone>");
  if (!REPO_RE.test(name)) die(`invalid repository name ${name}`);
  const root = findWorkspace(process.cwd());
  if (!root) die("not inside an aisdlc workspace");
  const abs = path.resolve(p);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) die(`folder not found: ${abs}`);
  if (!fs.existsSync(path.join(abs, ".git"))) console.error(`warning: ${abs} does not look like a git clone`);
  const key = "AISDLC_REPO_" + name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const envFile = path.join(root, "claude.env");
  const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").split(/\r?\n/) : ["# Local repository paths for this machine (paths only, never secrets). Not committed."];
  const line = `${key}=${abs}`;
  const i = lines.findIndex((l) => new RegExp(`^\\s*(export\\s+)?${key}\\s*=`).test(l));
  if (i >= 0) lines[i] = line;
  else lines.push(line);
  fs.writeFileSync(envFile, lines.filter((l, idx) => l !== "" || idx < lines.length - 1).join("\n") + "\n");
  const gi = path.join(root, ".gitignore");
  if (fs.existsSync(gi) && !/^claude\.env$/m.test(fs.readFileSync(gi, "utf8"))) fs.appendFileSync(gi, "\nclaude.env\n");
  console.log(`${key} set in claude.env -> ${abs}`);
}

// ---------------------------------------------------------------------------------------------

const HELP = `aisdlc-server <command>

  login --server <url> [--username <u>]       sign in (password prompt; or AISDLC_USERNAME/AISDLC_PASSWORD)
  change-password | whoami | logout
  init --server <url> --project <name> [--profile pm|design|dev|qa] [--repos a,b | --all-repos] [--target <dir>] [--dry-run]
                                              download your role's workspace files (and chosen repositories)
  repos                                       list the project's repositories (* = downloaded here)
  add-repos <a,b>                             download more repository packages
  resolve-repo-path <repo> <path>             record where a repository is cloned on this machine (claude.env)
  pull <TICKET> | plugin                      fetch a ticket's files for your role, or refresh workspace files
  push <TICKET> [--to PHASE --reason "..."] [--create --title "..."] [--no-state]
                                              (without --to the server follows your local task.yaml state)
  push * | plugin [--dry-run]                 send ticket files, all local tickets, or workspace knowledge
  tickets [--all]                             tickets waiting on your role (--all: every ticket you can see)
  status                                      show how this workspace is linked`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  switch (cmd) {
    case "login":
      return cmdLogin(args);
    case "logout":
      return cmdLogout(args);
    case "whoami":
      return cmdWhoami(args);
    case "change-password":
      return cmdChangePassword(args);
    case "init":
      return cmdInit(args);
    case "repos":
      return cmdRepos(args);
    case "add-repos":
      return cmdAddRepos(args);
    case "status":
      return cmdStatus(args);
    case "tickets":
      return cmdTickets(args);
    case "pull":
      return cmdPull(args);
    case "push":
      return cmdPush(args);
    case "resolve-repo-path":
      return cmdResolveRepoPath(args);
    default:
      console.log(HELP);
      if (cmd && cmd !== "help" && cmd !== "--help") process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("error: " + (e && e.message ? e.message : String(e)));
    process.exit(1);
  });
}

module.exports = { parseArgs, normalizeServer, wildcard, sha };
