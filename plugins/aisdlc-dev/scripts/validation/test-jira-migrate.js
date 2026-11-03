#!/usr/bin/env node
// Acceptance tests for `aisdlc-init.js --migrate-jira`: an existing dev workspace on the Jira MCP adapter is moved to
// the REST helper without losing anything already configured. No network needed.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync } = require("child_process");
const SRC = path.resolve(__dirname, "..", "..");
const INIT = path.join(SRC, "scripts/init/aisdlc-init.js");
const W = fs.mkdtempSync(path.join(os.tmpdir(), "aisdlc-jira-migrate-"));
let fail = 0;
const t = (name, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} (got ${got}, want ${want})`); };
const read = (rel) => JSON.parse(fs.readFileSync(path.join(W, rel), "utf8").replace(/^\s*#.*$/gm, ""));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(W, rel)), { recursive: true }); fs.writeFileSync(path.join(W, rel), text); };
const run = (...a) => spawnSync("node", [INIT, W, ...a], { encoding: "utf8", env: { ...process.env, AISDLC_ROOT: W } });

// An old workspace: MCP adapter, a custom transition and token scope, the atlassian server next to another one.
put("config/repositories.yaml", '{"repositories":{}}');
put("config/integrations.yaml", `# External integrations.
# Adapters are MCP/connector-backed.
{
  "jira": {
    "adapter": "mcp",
    "base_url": "",
    "write": { "add_comment": true, "add_pr_link": false, "status_transitions": { "in_review": "Code Review" } },
    "credentials": { "email_env": "MY_JIRA_EMAIL", "api_token_env": "MY_JIRA_TOKEN" },
    "token_scopes": { "read:issue:jira": "custom note" }
  },
  "git_hosting": { "adapter": "rest-api", "provider": "bitbucket" }
}
`);
put("config/workspace.yaml", '# ws\n{"workspace":{"name":"x"},"integrations":{"jira":{"required_for_ticket_fetch":false,"adapter":"mcp"}}}\n');
const mcp = { mcpServers: {
  atlassian: { command: "docker", args: ["run", "-v", "C:/ProgramData/Cloudflare/installed_cert.pem:/certs/ca.pem:ro", "ghcr.io/sooperset/mcp-atlassian:latest"],
    env: { JIRA_URL: "https://example.atlassian.net/", JIRA_USERNAME: "${JIRA_EMAIL}", JIRA_API_TOKEN: "${JIRA_API_TOKEN}" } },
  other: { command: "npx", args: ["some-other-server"] },
} };
put(".mcp.json", JSON.stringify(mcp, null, 2));
put(".mcp.json.example", JSON.stringify({ mcpServers: { atlassian: mcp.mcpServers.atlassian } }));
put(".gitignore", ".env\n.mcp.json\n");

// The session-start hook points at the migration.
const hook = spawnSync("node", [path.join(SRC, "hooks/session-start.js")], { encoding: "utf8", env: { ...process.env, AISDLC_ROOT: W } });
t("session-start reports the pending Jira migration", /Jira MCP adapter.*--migrate-jira/.test(hook.stdout), true);

const before = fs.readFileSync(path.join(W, "config/integrations.yaml"), "utf8");
const dry = run("--migrate-jira", "--dry-run");
t("dry run exits 0", dry.status, 0);
t("dry run changes nothing", fs.readFileSync(path.join(W, "config/integrations.yaml"), "utf8"), before);
t("dry run reports the adapter switch", JSON.parse(dry.stdout).changes.some((c) => /jira\.adapter "mcp" -> "rest-api"/.test(c)), true);

const r = run("--migrate-jira");
const rep = JSON.parse(r.stdout);
const j = read("config/integrations.yaml").jira;
t("adapter switched to rest-api", j.adapter, "rest-api");
t("script added", /jira-fetch\.js$/.test(j.script), true);
t("auth_scheme added", j.auth_scheme, "basic");
t("acceptance_criteria_field added", j.acceptance_criteria_field, "");
t("base_url taken from the MCP server's JIRA_URL", j.base_url, "https://example.atlassian.net");
t("existing write switches kept", j.write.add_comment === true && j.write.status_transitions.in_review === "Code Review", true);
t("custom credential names kept", j.credentials.email_env + "/" + j.credentials.api_token_env, "MY_JIRA_EMAIL/MY_JIRA_TOKEN");
t("existing token scope note kept, missing ones added", j.token_scopes["read:issue:jira"] === "custom note" && "read:field:jira" in j.token_scopes, true);
t("other integrations untouched", JSON.stringify(read("config/integrations.yaml").git_hosting), JSON.stringify({ adapter: "rest-api", provider: "bitbucket" }));
t("MCP header comment replaced", /MCP\/connector/.test(fs.readFileSync(path.join(W, "config/integrations.yaml"), "utf8")), false);
t("workspace.yaml adapter switched", read("config/workspace.yaml").integrations.jira.adapter, "rest-api");
t("corporate CA reported for NODE_EXTRA_CA_CERTS", rep.ca_certificate && rep.ca_certificate.path, "C:/ProgramData/Cloudflare/installed_cert.pem");
t("without --remove-mcp the MCP server stays", !!JSON.parse(fs.readFileSync(path.join(W, ".mcp.json"), "utf8")).mcpServers.atlassian, true);
t("pending MCP removal reported", /--remove-mcp/.test(rep.pending || ""), true);

const again = JSON.parse(run("--migrate-jira").stdout);
t("second run changes no config", again.changes.length, 0);

const rm = run("--migrate-jira", "--remove-mcp");
t("--remove-mcp exits 0", rm.status, 0);
const after = JSON.parse(fs.readFileSync(path.join(W, ".mcp.json"), "utf8"));
t("Jira MCP server removed, other server kept", Object.keys(after.mcpServers).join(","), "other");
t(".mcp.json backed up", !!JSON.parse(fs.readFileSync(path.join(W, ".mcp.json.aisdlc-jira-backup"), "utf8")).mcpServers.atlassian, true);
t("backup is gitignored", fs.readFileSync(path.join(W, ".gitignore"), "utf8").includes(".mcp.json.aisdlc-jira-backup"), true);
t("Jira-only .mcp.json.example deleted", fs.existsSync(path.join(W, ".mcp.json.example")), false);
const hook2 = spawnSync("node", [path.join(SRC, "hooks/session-start.js")], { encoding: "utf8", env: { ...process.env, AISDLC_ROOT: W } });
t("session-start is quiet after migration", /migrate-jira/.test(hook2.stdout), false);

// A .mcp.json holding only the Jira server is deleted (after the backup).
put(".mcp.json", JSON.stringify({ mcpServers: { atlassian: mcp.mcpServers.atlassian } }));
fs.unlinkSync(path.join(W, ".mcp.json.aisdlc-jira-backup"));
run("--migrate-jira", "--remove-mcp");
t("Jira-only .mcp.json deleted", fs.existsSync(path.join(W, ".mcp.json")), false);
t("...after being backed up", fs.existsSync(path.join(W, ".mcp.json.aisdlc-jira-backup")), true);

// Invalid JSON is reported, never rewritten.
put("config/integrations.yaml", "{ not json");
const bad = JSON.parse(run("--migrate-jira").stdout);
t("invalid integrations.yaml left untouched", fs.readFileSync(path.join(W, "config/integrations.yaml"), "utf8"), "{ not json");
t("...and reported", bad.warnings.some((w) => /not valid/.test(w)), true);

fs.rmSync(W, { recursive: true, force: true });
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
