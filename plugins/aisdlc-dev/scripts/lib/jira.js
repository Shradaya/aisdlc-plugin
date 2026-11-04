// Jira REST API client (v2: text fields are Jira wiki markup strings), shared by the aisdlc plugins' Jira scripts
// (aisdlc-dev scripts/jira/jira-fetch.js, aisdlc-qa scripts/jira/jira-attach.js). Replaces the Jira MCP server.
//
// This file is the canonical copy under packages/aisdlc-core/; each plugin vendors it (scripts/sync-core.js).
//
// Settings come from the workspace's config/integrations.yaml "jira" block:
//   base_url (or JIRA_URL), auth_scheme "basic" (Jira Cloud: email + API token) | "bearer" (Data Center PAT),
//   credentials.email_env / credentials.api_token_env (variable NAMES; default JIRA_EMAIL / JIRA_API_TOKEN),
//   acceptance_criteria_field (optional custom field id; empty = find it by name, then the description section).
// Credential values are read from the environment only and never returned, logged or included in errors.
// Errors are thrown as JiraError { payload: { ok:false, status?, error, hint? }, code } for the caller to print.
// Corporate TLS inspection (Cloudflare WARP, Zscaler): set NODE_EXTRA_CA_CERTS to the corporate root certificate.
const path = require("path");
const { readYaml } = require("./yaml");

class JiraError extends Error {
  constructor(payload, code = 1) {
    super(payload.error);
    this.payload = { ok: false, ...payload };
    this.code = code;
  }
}

function jiraConfig(root) {
  const cfg = ((root && readYaml(path.join(root, "config", "integrations.yaml"), {})) || {}).jira || {};
  const creds = cfg.credentials || {};
  const emailVar = creds.email_env || "JIRA_EMAIL";
  const tokenVar = creds.api_token_env || "JIRA_API_TOKEN";
  const scheme = cfg.auth_scheme || "basic";
  const base = String(cfg.base_url || process.env.JIRA_URL || "").replace(/\/+$/, "");
  const auth = () => {
    const token = process.env[tokenVar];
    if (scheme === "bearer") return token ? `Bearer ${token}` : null;
    const email = process.env[emailVar];
    return email && token ? "Basic " + Buffer.from(`${email}:${token}`).toString("base64") : null;
  };
  // Why the client cannot connect (site URL or credentials missing), or null when it can try.
  const missing = () => {
    if (!base) return "Jira site URL missing: set jira.base_url in config/integrations.yaml (or JIRA_URL)";
    if (!auth()) return scheme === "bearer" ? `${tokenVar} must be set` : `${emailVar} and ${tokenVar} must both be set`;
    return null;
  };
  return { cfg, write: cfg.write || {}, base, scheme, emailVar, tokenVar, acField: cfg.acceptance_criteria_field || null, auth, missing };
}

function hints(c) {
  return {
    401: `authentication failed: check ${c.emailVar} / ${c.tokenVar} (and jira.auth_scheme)`,
    403: "the token lacks permission for this request (see jira.token_scopes in config/integrations.yaml)",
    404: "not found, or the token cannot see it",
  };
}

async function request(c, method, urlPath, { json, form, quiet } = {}) {
  let r;
  try {
    r = await fetch(c.base + urlPath, {
      method,
      keepalive: false,
      headers: {
        Authorization: c.auth(),
        Accept: "application/json",
        Connection: "close",
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(form ? { "X-Atlassian-Token": "no-check" } : {}),
      },
      body: json ? JSON.stringify(json) : form,
    });
  } catch (e) {
    if (quiet) return null;
    const code = String((e.cause && (e.cause.code || e.cause.message)) || e.message);
    const tls = /CERT|SELF_SIGNED|UNABLE_TO_(GET|VERIFY)/i.test(code);
    throw new JiraError({
      error: `cannot reach ${c.base}: ${code.slice(0, 200)}`,
      ...(tls ? { hint: "TLS inspection proxy? Set NODE_EXTRA_CA_CERTS to the corporate root certificate and restart the session." } : {}),
    });
  }
  const body = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) {
    if (quiet) return null;
    const h = hints(c)[r.status];
    const msg = (body.errorMessages || []).concat(Object.values(body.errors || {})).join("; ") || h || "request failed";
    throw new JiraError({ status: r.status, error: String(msg).slice(0, 300), ...(h ? { hint: h } : {}) });
  }
  return body;
}

const MAX_TEXT = 20000; // cap any single text field so a huge description cannot flood the context
const MAX_COMMENT = 4000;
const clip = (s, n = MAX_TEXT) => {
  if (s == null) return null;
  const t = String(s);
  return t.length > n ? t.slice(0, n) + `\n[... truncated ${t.length - n} characters]` : t;
};
const name = (x) => (x && (x.name || x.displayName || x.value)) || null;
const brief = (i) => i && { key: i.key, summary: (i.fields || {}).summary || null, status: name((i.fields || {}).status), type: name((i.fields || {}).issuetype) };

// Custom field values come in several shapes (string, option, array of options, ADF); flatten to text.
function adfText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  const inner = (node.content || []).map(adfText).join("");
  return ["paragraph", "heading", "listItem", "codeBlock", "blockquote"].includes(node.type) ? inner + "\n" : inner;
}
function fieldText(v) {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join("\n") || null;
  if (typeof v === "object") return v.type === "doc" && Array.isArray(v.content) ? adfText(v) : v.value || v.name || v.displayName || null;
  return String(v);
}

// Text of an "Acceptance Criteria" section in a wiki-markup or markdown description, up to the next heading.
function acFromDescription(desc) {
  if (!desc) return null;
  const lines = String(desc).split(/\r?\n/);
  // In wiki markup "# item" is a numbered list, so markdown "#" headings count only when there are no wiki headings.
  const wiki = lines.some((l) => /^\s*h[1-6]\.\s/i.test(l));
  const heading = (l) => (wiki ? /^\s*h[1-6]\.\s/i : /^\s*#{1,6}\s/).test(l);
  const start = lines.findIndex((l) => /^\s*(h[1-6]\.\s*|#{1,6}\s*|\*+|_+)?\s*acceptance\s+criteria\b/i.test(l));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(heading);
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim() || null;
}

// The acceptance-criteria field: configured, else discovered by name (needs read:field:jira; failures are ignored).
async function findAcField(c) {
  if (c.acField) return { id: c.acField, name: c.acField };
  const fields = await request(c, "GET", "/rest/api/2/field", { quiet: true });
  const f = (Array.isArray(fields) ? fields : []).find((x) => /acceptance\s*criteria/i.test(x.name || ""));
  return f ? { id: f.id, name: f.name } : null;
}

const ISSUE_FIELDS = ["summary", "issuetype", "status", "priority", "labels", "components", "fixVersions", "versions",
  "parent", "description", "issuelinks", "subtasks", "attachment", "assignee", "reporter", "created", "updated"];

// The requests fetchIssue makes, for --dry-run output.
function issueRequests(c, key, { comments } = {}) {
  return [
    ...(c.acField ? [] : ["GET /rest/api/2/field (find the acceptance-criteria field)"]),
    `GET /rest/api/2/issue/${key}?fields=${ISSUE_FIELDS.join(",")},${c.acField || "<acceptance-criteria field>"}`,
    ...(comments ? [`GET /rest/api/2/issue/${key}/comment?orderBy=created&maxResults=100`] : []),
  ];
}

// Fetch a ticket and normalize it: { source, issue }. Read-only.
async function fetchIssue(c, key, { comments } = {}) {
  const k = encodeURIComponent(key);
  const ac = await findAcField(c);
  const issue = await request(c, "GET", `/rest/api/2/issue/${k}?fields=${ISSUE_FIELDS.concat(ac ? [ac.id] : []).join(",")}`);
  const f = issue.fields || {};

  let acceptance = ac ? fieldText(f[ac.id]) : null;
  let acSource = acceptance ? `field:${ac.name}` : null;
  if (!acceptance) {
    acceptance = acFromDescription(f.description);
    acSource = acceptance ? "description-section" : null;
  }

  let list;
  if (comments) {
    const r = await request(c, "GET", `/rest/api/2/issue/${k}/comment?orderBy=created&maxResults=100`);
    list = (r.comments || []).map((x) => ({ id: String(x.id), author: name(x.author), created: x.created, updated: x.updated, text: clip(x.body, MAX_COMMENT) }));
  }

  return {
    source: { type: "jira", jira_available: true, issue_key: issue.key, fetched_at: new Date().toISOString(), url: `${c.base}/browse/${issue.key}` },
    issue: {
      key: issue.key,
      summary: f.summary || null,
      type: name(f.issuetype),
      status: name(f.status),
      priority: name(f.priority),
      labels: f.labels || [],
      components: (f.components || []).map(name),
      fix_versions: (f.fixVersions || []).map(name),
      affects_versions: (f.versions || []).map(name),
      parent: brief(f.parent) || null,
      assignee: name(f.assignee),
      reporter: name(f.reporter),
      created: f.created || null,
      updated: f.updated || null,
      description: clip(f.description),
      acceptance_criteria: clip(acceptance),
      acceptance_criteria_source: acSource,
      linked_issues: (f.issuelinks || []).map((l) => {
        const outward = Boolean(l.outwardIssue);
        return { relation: (l.type && (outward ? l.type.outward : l.type.inward)) || null, ...brief(l.outwardIssue || l.inwardIssue) };
      }),
      subtasks: (f.subtasks || []).map(brief),
      attachments: (f.attachment || []).map((a) => a.filename),
      ...(comments ? { comments: list } : {}),
    },
  };
}

// Verify the site URL and credentials. Returns { user }.
async function checkConnection(c) {
  const me = await request(c, "GET", "/rest/api/2/myself");
  return { user: me.displayName || null };
}

// Move a ticket through the workflow transition with exactly this name (case-insensitive). Refuses when the ticket's
// current status does not offer it; never guesses a similar one. Returns { id, name, from, to }.
async function transitionIssue(c, key, transitionName) {
  const k = encodeURIComponent(key);
  const before = await request(c, "GET", `/rest/api/2/issue/${k}?fields=status`);
  const list = await request(c, "GET", `/rest/api/2/issue/${k}/transitions`);
  const wanted = String(transitionName).trim().toLowerCase();
  const t = (list.transitions || []).find((x) => String(x.name || "").trim().toLowerCase() === wanted);
  if (!t) {
    throw new JiraError({
      error: `transition "${transitionName}" is not available for ${key} in status "${name((before.fields || {}).status) || "unknown"}"`,
      available: (list.transitions || []).map((x) => x.name),
    });
  }
  await request(c, "POST", `/rest/api/2/issue/${k}/transitions`, { json: { transition: { id: String(t.id) } } });
  return { id: String(t.id), name: t.name, from: name((before.fields || {}).status), to: name(t.to) };
}

// Release fetch's (undici's) global dispatcher so no keepalive socket holds the process open (see bitbucket-pr.js).
async function closeHttp() {
  try {
    const sym = Object.getOwnPropertySymbols(globalThis).find((s) => s.description === "undici.globalDispatcher.1");
    const dispatcher = sym && globalThis[sym];
    if (dispatcher && typeof dispatcher.close === "function") await dispatcher.close();
  } catch {}
}

module.exports = { JiraError, jiraConfig, request, fetchIssue, issueRequests, checkConnection, transitionIssue, acFromDescription, closeHttp };
