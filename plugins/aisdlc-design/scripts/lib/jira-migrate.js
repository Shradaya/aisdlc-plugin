// Migrate an existing aisdlc workspace from the Jira MCP adapter to the Jira REST helpers (see lib/jira.js).
// Shared by aisdlc-dev (scripts/init/aisdlc-init.js --migrate-jira) and aisdlc-qa (aisdlc-qa-init.js --migrate-jira),
// and by their SessionStart hooks (jiraMigrationNeeded, read-only).
//
// This file is the canonical copy under packages/aisdlc-core/; each plugin vendors it (scripts/sync-core.js).
//
// Config step (always):
//   config/integrations.yaml  jira.adapter "mcp" -> the template's adapter ("rest-api"); keys missing from our jira
//                             block are added from the plugin's template (script, auth_scheme,
//                             acceptance_criteria_field, ...), as are missing token_scopes entries; nothing that is
//                             already set is changed. An empty base_url is filled from JIRA_URL of a Jira MCP server in
//                             .mcp.json. A header comment that still describes the MCP adapter is replaced by the
//                             template's header.
//   config/workspace.yaml     integrations.jira.adapter "mcp" -> "rest-api".
// MCP cleanup step (only with removeMcp, after the REST connection was checked):
//   .mcp.json                 Jira MCP servers ("atlassian", or any running mcp-atlassian) are removed; the file is
//                             first copied to .mcp.json.aisdlc-jira-backup (never overwriting an existing backup);
//                             other servers (e.g. playwright-test) are kept; a file left with no servers is deleted.
//   .mcp.json.example         deleted when every server in it is a Jira MCP server (the old scaffold).
// Never reads or writes credentials, claude.env or .env. A corporate CA certificate mounted into the Jira MCP server
// is reported as ca_certificate, to be set as NODE_EXTRA_CA_CERTS (an environment variable) instead.
const fs = require("fs");
const path = require("path");

const MCP_JIRA_BACKUP = ".mcp.json.aisdlc-jira-backup";
const stripComments = (text) => text.replace(/^\s*#.*$/gm, "");
const readJson = (f) => JSON.parse(stripComments(fs.readFileSync(f, "utf8")));
const tryJson = (f) => { try { return fs.existsSync(f) ? readJson(f) : null; } catch { return null; } };

// Leading '#' comment lines of a JSON-compatible YAML file.
function header(text) {
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((l) => l.trim() && !l.trim().startsWith("#"));
  return lines.slice(0, end < 0 ? 0 : end);
}
function writeYaml(f, headerLines, obj) {
  fs.writeFileSync(f, (headerLines.length ? headerLines.join("\n") + "\n" : "") + JSON.stringify(obj, null, 2) + "\n");
}

const isJiraServer = (name, s) =>
  name === "atlassian" || /mcp-atlassian/i.test(JSON.stringify(s || {}));

function jiraServers(mcp) {
  return Object.entries((mcp && mcp.mcpServers) || {}).filter(([n, s]) => isJiraServer(n, s));
}

// Corporate CA mounted into a dockerized Jira MCP server ("-v <host>.pem:/certs/<x>.pem[:ro]").
function caMount(servers) {
  for (const [, s] of servers) {
    const arg = (s.args || []).map(String).find((a) => /:\/certs\/[^:]+\.pem(:ro)?$/.test(a));
    if (arg) return arg.replace(/:\/certs\/[^:]+\.pem(:ro)?$/, "");
  }
  return null;
}

// Why this workspace still needs `--migrate-jira`, or null. Read-only; never throws.
function jiraMigrationNeeded(root) {
  try {
    const integ = tryJson(path.join(root, "config", "integrations.yaml"));
    if (integ && integ.jira && integ.jira.adapter === "mcp") return "config/integrations.yaml still uses the Jira MCP adapter";
    const ws = tryJson(path.join(root, "config", "workspace.yaml"));
    if (ws && ws.integrations && ws.integrations.jira && ws.integrations.jira.adapter === "mcp") return "config/workspace.yaml still uses the Jira MCP adapter";
    if (jiraServers(tryJson(path.join(root, ".mcp.json"))).length) return ".mcp.json still has a Jira MCP server (no longer needed)";
  } catch {}
  return null;
}

// templatePath: the plugin's templates/workspace/config/integrations.yaml.
function migrateJira(root, { templatePath, removeMcp = false, dryRun = false } = {}) {
  const changes = [], warnings = [];
  const report = { ok: true, dry_run: dryRun, workspace: root, changes, warnings };
  const mcpFile = path.join(root, ".mcp.json");
  let mcp = null;
  try { mcp = fs.existsSync(mcpFile) ? readJson(mcpFile) : null; }
  catch (e) { warnings.push(`.mcp.json is not valid JSON, left untouched (${e.message})`); }
  const servers = jiraServers(mcp);

  // config/integrations.yaml
  const integFile = path.join(root, "config", "integrations.yaml");
  if (!fs.existsSync(integFile)) warnings.push("config/integrations.yaml not found; run init first");
  else {
    const text = fs.readFileSync(integFile, "utf8");
    let cfg = null;
    try { cfg = JSON.parse(stripComments(text)); } catch (e) { warnings.push(`config/integrations.yaml is not valid JSON-compatible YAML, left untouched (${e.message})`); }
    let tpl = {}, tplText = "";
    try { tplText = fs.readFileSync(templatePath, "utf8"); tpl = JSON.parse(stripComments(tplText)); }
    catch { warnings.push("plugin template integrations.yaml not found; only the adapter is switched"); }
    if (cfg) {
      const jira = cfg.jira || (cfg.jira = {});
      const tj = tpl.jira || {};
      let changed = false;
      const want = tj.adapter || "rest-api";
      if (jira.adapter !== want && (jira.adapter === "mcp" || jira.adapter == null)) {
        changes.push(`config/integrations.yaml: jira.adapter ${JSON.stringify(jira.adapter || null)} -> "${want}"`);
        jira.adapter = want; changed = true;
      }
      for (const [k, v] of Object.entries(tj)) {
        if (k === "adapter" || k in jira) continue;
        jira[k] = v; changed = true;
        changes.push(`config/integrations.yaml: + jira.${k} = ${JSON.stringify(v)}`);
      }
      if (tj.token_scopes && jira.token_scopes && typeof jira.token_scopes === "object") {
        for (const [k, v] of Object.entries(tj.token_scopes)) {
          if (k in jira.token_scopes) continue;
          jira.token_scopes[k] = v; changed = true;
          changes.push(`config/integrations.yaml: + jira.token_scopes.${k}`);
        }
      }
      if (!jira.base_url) {
        const url = servers.map(([, s]) => (s.env || {}).JIRA_URL).find((u) => /^https?:\/\//.test(u || ""));
        if (url) { jira.base_url = url.replace(/\/+$/, ""); changed = true; changes.push(`config/integrations.yaml: jira.base_url = ${jira.base_url} (from .mcp.json)`); }
        else warnings.push("jira.base_url is empty: set your Jira site URL in config/integrations.yaml");
      }
      let head = header(text);
      // Only the old wording ("MCP/connector-backed", "the Jira MCP adapter"); the new header mentions MCP too.
      if (head.some((l) => /MCP\/connector|MCP adapter/i.test(l)) && tplText) {
        head = header(tplText); changed = true;
        changes.push("config/integrations.yaml: header comment updated to the REST description");
      }
      if (changed && !dryRun) writeYaml(integFile, head, cfg);
    }
  }

  // config/workspace.yaml (dev workspaces mirror the adapter there)
  const wsFile = path.join(root, "config", "workspace.yaml");
  if (fs.existsSync(wsFile)) {
    try {
      const text = fs.readFileSync(wsFile, "utf8");
      const ws = JSON.parse(stripComments(text));
      const j = ws.integrations && ws.integrations.jira;
      if (j && j.adapter === "mcp") {
        j.adapter = "rest-api";
        changes.push('config/workspace.yaml: integrations.jira.adapter "mcp" -> "rest-api"');
        if (!dryRun) writeYaml(wsFile, header(text), ws);
      }
    } catch (e) { warnings.push(`config/workspace.yaml is not valid JSON-compatible YAML, left untouched (${e.message})`); }
  }

  const ca = caMount(servers);
  if (ca) report.ca_certificate = { path: ca, set: process.env.NODE_EXTRA_CA_CERTS ? "set" : "missing", hint: `set NODE_EXTRA_CA_CERTS=${ca} before starting the session` };

  // MCP cleanup
  if (servers.length) {
    const names = servers.map(([n]) => n);
    if (!removeMcp) report.pending = `.mcp.json still has Jira MCP server(s) ${names.join(", ")}; once the REST check passes, re-run with --remove-mcp`;
    else {
      const backup = path.join(root, MCP_JIRA_BACKUP);
      const keep = Object.fromEntries(Object.entries(mcp.mcpServers).filter(([n, s]) => !isJiraServer(n, s)));
      const rest = { ...mcp, mcpServers: keep };
      const empty = !Object.keys(keep).length && Object.keys(rest).length === 1;
      const hadBackup = fs.existsSync(backup);
      if (!dryRun) {
        if (!hadBackup) fs.copyFileSync(mcpFile, backup);
        if (empty) fs.unlinkSync(mcpFile);
        else fs.writeFileSync(mcpFile, JSON.stringify(rest, null, 2) + "\n");
      }
      changes.push(hadBackup ? `.mcp.json: an earlier ${MCP_JIRA_BACKUP} exists and was kept` : `.mcp.json: backed up to ${MCP_JIRA_BACKUP}`);
      changes.push(`.mcp.json: removed Jira MCP server(s) ${names.join(", ")}${empty ? " (no servers left: file deleted)" : `; kept ${Object.keys(keep).join(", ")}`}`);
      // Keep the backup out of git (machine-specific paths).
      const gi = path.join(root, ".gitignore");
      if (fs.existsSync(gi) && !fs.readFileSync(gi, "utf8").split(/\r?\n/).includes(MCP_JIRA_BACKUP)) {
        if (!dryRun) fs.writeFileSync(gi, fs.readFileSync(gi, "utf8").trimEnd() + "\n" + MCP_JIRA_BACKUP + "\n");
        changes.push(`.gitignore: + ${MCP_JIRA_BACKUP}`);
      }
    }
  }
  if (removeMcp) {
    const ex = path.join(root, ".mcp.json.example");
    const exJson = tryJson(ex);
    const exServers = Object.entries((exJson && exJson.mcpServers) || {});
    if (exServers.length && exServers.every(([n, s]) => isJiraServer(n, s))) {
      if (!dryRun) fs.unlinkSync(ex);
      changes.push(".mcp.json.example: deleted (it only described the Jira MCP server)");
    }
  }

  if (!changes.length && !report.pending) report.note = "nothing to migrate: Jira already uses the REST helpers";
  return report;
}

module.exports = { migrateJira, jiraMigrationNeeded, MCP_JIRA_BACKUP };
