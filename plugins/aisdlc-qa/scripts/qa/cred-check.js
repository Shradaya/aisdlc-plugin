#!/usr/bin/env node
// Report whether the QA credentials are set, never their values. QA_USERNAME / QA_PASSWORD count when set as an
// environment variable or in the workspace .env (gitignored, Claude has no access); JIRA_EMAIL / JIRA_API_TOKEN count
// only as environment variables (the Jira MCP server reads them from there). claude.env never counts.
// Usage: node cred-check.js [NAME ...]   (default: QA_USERNAME QA_PASSWORD JIRA_EMAIL JIRA_API_TOKEN)
// Output: one JSON line { NAME: "set (environment)" | "set (.env)" | "missing" }. Exit 0, or 2 outside a workspace.
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const { credentialStatus } = require("./env");

const ROOT = resolveRoot();
if (!ROOT) { console.log(JSON.stringify({ ok: false, error: NOT_WORKSPACE })); process.exit(2); }
const names = process.argv.slice(2).filter((a) => /^[A-Z_][A-Z0-9_]*$/.test(a));
const out = {};
for (const n of names.length ? names : ["QA_USERNAME", "QA_PASSWORD", "JIRA_EMAIL", "JIRA_API_TOKEN"]) {
  const s = credentialStatus(ROOT, n);
  out[n] = s ? `set (${s})` : "missing";
}
console.log(JSON.stringify(out));
