#!/usr/bin/env node
// Read-only Jira helper for the dev plugin, over the Jira REST API (client: scripts/lib/jira.js, vendored core).
// No MCP server, Docker image or .mcp.json needed. Credentials come from environment variables only (names in
// config/integrations.yaml, jira.credentials); values are never printed. The site URL comes from jira.base_url in
// config/integrations.yaml, or JIRA_URL.
//
//   issue <T> [--comments]   fetch the ticket: summary, type, status, priority, labels, components, versions, parent,
//                            description, acceptance criteria, linked issues, sub-tasks, attachment names and
//                            (with --comments) comments. Text fields are Jira wiki markup.
//   check                    verify the site URL and credentials (GET /rest/api/2/myself); no ticket data
// Options: --dry-run (no network and no credentials needed: prints the requests that would be made).
//
// Acceptance criteria: the custom field in jira.acceptance_criteria_field, else the first field whose name contains
// "acceptance criteria", else an "Acceptance Criteria" section of the description. `acceptance_criteria_source`
// says which one was used (null when none was found).
//
// Corporate TLS inspection (Cloudflare WARP, Zscaler): point NODE_EXTRA_CA_CERTS at the corporate root certificate
// (WARP on Windows: C:/ProgramData/Cloudflare/installed_cert.pem) before starting the session.
//
// Output: one JSON line. Exit codes: 0 ok, 1 error, 2 credentials or site URL missing.
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const jira = require("../lib/jira");

// Finishing reliably on Windows: see scripts/git-hosting/bitbucket-pr.js for the full story.
// out() records the result and unwinds; the finalizer writes one JSON line, sets process.exitCode (no hard exit while
// the fetch socket may be closing), closes undici's global dispatcher, and keeps an unref'd timer as a last resort.
class Done extends Error {}
let RESULT = null;
const out = (o, code = 0) => {
  RESULT = { payload: o, code };
  throw new Done();
};
async function finish(payload, code) {
  process.exitCode = code;
  await new Promise((resolve) =>
    process.stdout.write(JSON.stringify(payload) + "\n", resolve),
  );
  await jira.closeHttp();
  setTimeout(() => process.exit(code), 3000).unref();
}

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const comments = argv.includes("--comments");
const [cmd, ticket] = argv.filter((a) => !a.startsWith("--"));

async function main() {
  const ROOT = resolveRoot();
  if (!ROOT) out({ ok: false, error: NOT_WORKSPACE }, 2);
  const usage = "usage: issue <TICKET> [--comments] | check   [--dry-run]";
  if (cmd !== "issue" && cmd !== "check") out({ ok: false, error: usage }, 1);
  if (cmd === "issue" && !/^[A-Z][A-Z0-9]*-\d+$/.test(ticket || ""))
    out({ ok: false, error: `invalid ticket number. ${usage}` }, 1);
  const c = jira.jiraConfig(ROOT);
  if (!dryRun && c.missing()) out({ ok: false, error: c.missing() }, 2);

  if (cmd === "check") {
    if (dryRun)
      out({ ok: true, dry_run: true, would: ["GET /rest/api/2/myself"] });
    out({
      ok: true,
      connected: true,
      base_url: c.base,
      ...(await jira.checkConnection(c)),
    });
  }
  if (dryRun)
    out({
      ok: true,
      dry_run: true,
      would: jira.issueRequests(c, ticket, { comments }),
    });
  out({ ok: true, ...(await jira.fetchIssue(c, ticket, { comments })) });
}

main()
  .then(() => {
    if (!RESULT)
      RESULT = { payload: { ok: false, error: "no result produced" }, code: 1 };
  })
  .catch((e) => {
    if (e instanceof Done) return;
    if (e instanceof jira.JiraError)
      RESULT = { payload: e.payload, code: e.code };
    else
      RESULT = {
        payload: { ok: false, error: String(e.message || e).slice(0, 300) },
        code: 1,
      };
  })
  .finally(() => {
    finish(RESULT.payload, RESULT.code);
  });
