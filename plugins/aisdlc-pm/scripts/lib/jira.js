// Jira REST API client (v2: text fields are Jira wiki markup strings), shared by the aisdlc plugins' Jira scripts
// (aisdlc-dev scripts/jira/jira-fetch.js, aisdlc-qa scripts/jira/jira-attach.js). Replaces the Jira MCP server.
//
// This file is the canonical copy under packages/aisdlc-core/; each plugin vendors it (scripts/sync-core.js).
//
// Settings come from the workspace's config/integrations.yaml "jira" block:
//   base_url (or JIRA_URL), auth_scheme "basic" (Jira Cloud: email + API token) | "bearer" (Data Center PAT),
//   credentials.email_env / credentials.api_token_env (variable NAMES; default JIRA_EMAIL / JIRA_API_TOKEN),
//   acceptance_criteria_field (optional custom field id; empty = find it by name, then the description section),
//   api_route "auto" (default) | "site" | "gateway", cloud_id (optional), gateway_url (default https://api.atlassian.com).
// Credential values are read from the environment only and never returned, logged or included in errors.
// Errors are thrown as JiraError { payload: { ok:false, status?, error, hint? }, code } for the caller to print.
// Corporate TLS inspection (Cloudflare WARP, Zscaler): set NODE_EXTRA_CA_CERTS to the corporate root certificate.
//
// Where requests go ("route"). A classic Jira Cloud API token works against the site URL (https://<site>.atlassian.net).
// A *scoped* token (granular scopes such as read:issue:jira) does not: on the site URL Jira treats it as anonymous and
// answers 401 (or 404 for an issue, which looks like a missing ticket). Scoped tokens go through the Atlassian API
// gateway, https://api.atlassian.com/ex/jira/<cloudId>, where <cloudId> comes from <site>/_edge/tenant_info (public).
// With api_route "auto" the route is decided once per process, with GET /myself on the site URL: success -> site;
// 401/403 -> gateway; anything else is a real error and is reported as such. "site" and "gateway" skip that probe, and
// cloud_id skips the tenant_info lookup. Data Center ("bearer") always uses the site URL. Browse links always use the
// site URL (c.base); c.via tells which route was used ("site" | "gateway").
const path = require("path");
const { readYaml } = require("./yaml");

class JiraError extends Error {
  constructor(payload, code = 1) {
    super(payload.error);
    this.payload = { ok: false, ...payload };
    this.code = code;
  }
}

const GATEWAY_DEFAULT = "https://api.atlassian.com";
const ROUTES = ["auto", "site", "gateway"];

function jiraConfig(root) {
  const cfg =
    (
      (root && readYaml(path.join(root, "config", "integrations.yaml"), {})) ||
      {}
    ).jira || {};
  const creds = cfg.credentials || {};
  const emailVar = creds.email_env || "JIRA_EMAIL";
  const tokenVar = creds.api_token_env || "JIRA_API_TOKEN";
  const scheme = cfg.auth_scheme || "basic";
  const base = String(cfg.base_url || process.env.JIRA_URL || "").replace(
    /\/+$/,
    "",
  );
  const routeMode = ROUTES.includes(
    String(cfg.api_route || "auto").toLowerCase(),
  )
    ? String(cfg.api_route || "auto").toLowerCase()
    : "auto";
  const auth = () => {
    const token = process.env[tokenVar];
    if (scheme === "bearer") return token ? `Bearer ${token}` : null;
    const email = process.env[emailVar];
    return email && token
      ? "Basic " + Buffer.from(`${email}:${token}`).toString("base64")
      : null;
  };
  // Why the client cannot connect (site URL or credentials missing), or null when it can try.
  const missing = () => {
    if (!base)
      return "Jira site URL missing: set jira.base_url in config/integrations.yaml (or JIRA_URL)";
    if (!auth())
      return scheme === "bearer"
        ? `${tokenVar} must be set`
        : `${emailVar} and ${tokenVar} must both be set`;
    return null;
  };
  return {
    cfg,
    write: cfg.write || {},
    base,
    scheme,
    emailVar,
    tokenVar,
    acField: cfg.acceptance_criteria_field || null,
    auth,
    missing,
    routeMode,
    cloudId: cfg.cloud_id ? String(cfg.cloud_id).trim() : null,
    gatewayUrl: String(cfg.gateway_url || GATEWAY_DEFAULT).replace(/\/+$/, ""),
    apiBase: null,
    via: null, // resolved lazily by resolveRoute()
  };
}

function hints(c) {
  const scoped =
    c.via === "gateway"
      ? " For a scoped token, grant the read/write scopes listed in jira.token_scopes (config/integrations.yaml)."
      : "";
  return {
    401: `authentication failed: check ${c.emailVar} / ${c.tokenVar} (and jira.auth_scheme).${scoped}`,
    403: `the token lacks permission for this request (see jira.token_scopes in config/integrations.yaml).${scoped}`,
    404: "not found, or the token cannot see it",
  };
}

// One HTTP call. Network failures throw a JiraError; HTTP errors are returned ({ ok:false, status, body }) so callers
// can decide (the route probe treats 401/403 as a signal, request() turns them into errors).
async function send(c, url, method, { json, form, auth = true } = {}) {
  let r;
  try {
    r = await fetch(url, {
      method,
      keepalive: false,
      headers: {
        ...(auth ? { Authorization: c.auth() } : {}),
        Accept: "application/json",
        Connection: "close",
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(form ? { "X-Atlassian-Token": "no-check" } : {}),
      },
      body: json ? JSON.stringify(json) : form,
    });
  } catch (e) {
    const code = String(
      (e.cause && (e.cause.code || e.cause.message)) || e.message,
    );
    const tls = /CERT|SELF_SIGNED|UNABLE_TO_(GET|VERIFY)/i.test(code);
    let host = url;
    try {
      host = new URL(url).origin;
    } catch {}
    throw new JiraError({
      error: `cannot reach ${host}: ${code.slice(0, 200)}`,
      ...(tls
        ? {
            hint: "TLS inspection proxy? Set NODE_EXTRA_CA_CERTS to the corporate root certificate and restart the session.",
          }
        : {}),
    });
  }
  const body = r.status === 204 ? {} : await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

function httpError(c, status, body) {
  const h = hints(c)[status];
  const msg =
    ((body && body.errorMessages) || [])
      .concat(Object.values((body && body.errors) || {}))
      .join("; ") ||
    h ||
    "request failed";
  return new JiraError({
    status,
    error: String(msg).slice(0, 300),
    ...(h ? { hint: h } : {}),
  });
}

// The Atlassian API gateway base for this site: <gateway_url>/ex/jira/<cloudId>.
async function gatewayBase(c) {
  let id = c.cloudId;
  if (!id) {
    const t = await send(c, c.base + "/_edge/tenant_info", "GET", {
      auth: false,
    });
    id = t.ok && t.body && t.body.cloudId;
    if (!id) {
      throw new JiraError({
        status: 401,
        error: `cannot find the Jira cloud id for ${c.base} (needed for scoped API tokens)`,
        hint: "Set jira.cloud_id in config/integrations.yaml (Jira > Settings > Products, or <site>/_edge/tenant_info), or use a classic API token.",
      });
    }
  }
  return `${c.gatewayUrl}/ex/jira/${encodeURIComponent(id)}`;
}

// Decide where API requests go (see the header comment). Cached on c; a failure is not cached, so a retry re-probes.
async function resolveRoute(c) {
  if (c.apiBase) return c.apiBase;
  if (c.scheme === "bearer" || c.routeMode === "site") {
    c.apiBase = c.base;
    c.via = "site";
  } else if (c.routeMode === "gateway") {
    c.apiBase = await gatewayBase(c);
    c.via = "gateway";
  } else {
    const probe = await send(c, c.base + "/rest/api/2/myself", "GET");
    if (probe.ok) {
      c.apiBase = c.base;
      c.via = "site";
    } else if (probe.status === 401 || probe.status === 403) {
      c.apiBase = await gatewayBase(c);
      c.via = "gateway";
    } else throw httpError(c, probe.status, probe.body);
  }
  return c.apiBase;
}

async function request(c, method, urlPath, { json, form, quiet } = {}) {
  let res;
  try {
    const apiBase = await resolveRoute(c);
    res = await send(c, apiBase + urlPath, method, { json, form });
  } catch (e) {
    if (quiet && e instanceof JiraError) return null;
    throw e;
  }
  if (!res.ok) {
    if (quiet) return null;
    throw httpError(c, res.status, res.body);
  }
  return res.body;
}

const MAX_TEXT = 20000; // cap any single text field so a huge description cannot flood the context
const MAX_COMMENT = 4000;
const clip = (s, n = MAX_TEXT) => {
  if (s == null) return null;
  const t = String(s);
  return t.length > n
    ? t.slice(0, n) + `\n[... truncated ${t.length - n} characters]`
    : t;
};
const name = (x) => (x && (x.name || x.displayName || x.value)) || null;
const brief = (i) =>
  i && {
    key: i.key,
    summary: (i.fields || {}).summary || null,
    status: name((i.fields || {}).status),
    type: name((i.fields || {}).issuetype),
  };

// Custom field values come in several shapes (string, option, array of options, ADF); flatten to text.
function adfText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  const inner = (node.content || []).map(adfText).join("");
  return [
    "paragraph",
    "heading",
    "listItem",
    "codeBlock",
    "blockquote",
  ].includes(node.type)
    ? inner + "\n"
    : inner;
}
function fieldText(v) {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v))
    return v.map(fieldText).filter(Boolean).join("\n") || null;
  if (typeof v === "object")
    return v.type === "doc" && Array.isArray(v.content)
      ? adfText(v)
      : v.value || v.name || v.displayName || null;
  return String(v);
}

// Text of an "Acceptance Criteria" section in a wiki-markup or markdown description, up to the next heading.
function acFromDescription(desc) {
  if (!desc) return null;
  const lines = String(desc).split(/\r?\n/);
  // In wiki markup "# item" is a numbered list, so markdown "#" headings count only when there are no wiki headings.
  const wiki = lines.some((l) => /^\s*h[1-6]\.\s/i.test(l));
  const heading = (l) => (wiki ? /^\s*h[1-6]\.\s/i : /^\s*#{1,6}\s/).test(l);
  const start = lines.findIndex((l) =>
    /^\s*(h[1-6]\.\s*|#{1,6}\s*|\*+|_+)?\s*acceptance\s+criteria\b/i.test(l),
  );
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(heading);
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim() || null;
}

// The acceptance-criteria field: configured, else discovered by name (needs read:field:jira; failures are ignored).
async function findAcField(c) {
  if (c.acField) return { id: c.acField, name: c.acField };
  const fields = await request(c, "GET", "/rest/api/2/field", { quiet: true });
  const f = (Array.isArray(fields) ? fields : []).find((x) =>
    /acceptance\s*criteria/i.test(x.name || ""),
  );
  return f ? { id: f.id, name: f.name } : null;
}

const ISSUE_FIELDS = [
  "summary",
  "issuetype",
  "status",
  "priority",
  "labels",
  "components",
  "fixVersions",
  "versions",
  "parent",
  "description",
  "issuelinks",
  "subtasks",
  "attachment",
  "assignee",
  "reporter",
  "created",
  "updated",
];

// The requests fetchIssue makes, for --dry-run output.
function issueRequests(c, key, { comments } = {}) {
  return [
    ...(c.scheme === "basic" && c.routeMode === "auto"
      ? [
          "GET /rest/api/2/myself (route probe; a scoped token then goes through the Atlassian API gateway)",
        ]
      : []),
    ...(c.acField
      ? []
      : ["GET /rest/api/2/field (find the acceptance-criteria field)"]),
    `GET /rest/api/2/issue/${key}?fields=${ISSUE_FIELDS.join(",")},${c.acField || "<acceptance-criteria field>"}`,
    ...(comments
      ? [`GET /rest/api/2/issue/${key}/comment?orderBy=created&maxResults=100`]
      : []),
  ];
}

// Fetch a ticket and normalize it: { source, issue }. Read-only.
async function fetchIssue(c, key, { comments } = {}) {
  const k = encodeURIComponent(key);
  const ac = await findAcField(c);
  const issue = await request(
    c,
    "GET",
    `/rest/api/2/issue/${k}?fields=${ISSUE_FIELDS.concat(ac ? [ac.id] : []).join(",")}`,
  );
  const f = issue.fields || {};

  let acceptance = ac ? fieldText(f[ac.id]) : null;
  let acSource = acceptance ? `field:${ac.name}` : null;
  if (!acceptance) {
    acceptance = acFromDescription(f.description);
    acSource = acceptance ? "description-section" : null;
  }

  let list;
  if (comments) {
    const r = await request(
      c,
      "GET",
      `/rest/api/2/issue/${k}/comment?orderBy=created&maxResults=100`,
    );
    list = (r.comments || []).map((x) => ({
      id: String(x.id),
      author: name(x.author),
      created: x.created,
      updated: x.updated,
      text: clip(x.body, MAX_COMMENT),
    }));
  }

  return {
    source: {
      type: "jira",
      jira_available: true,
      issue_key: issue.key,
      fetched_at: new Date().toISOString(),
      url: `${c.base}/browse/${issue.key}`,
    },
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
        return {
          relation:
            (l.type && (outward ? l.type.outward : l.type.inward)) || null,
          ...brief(l.outwardIssue || l.inwardIssue),
        };
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
  return { user: me.displayName || null, route: c.via };
}

// Move a ticket through the workflow transition with exactly this name (case-insensitive). Refuses when the ticket's
// current status does not offer it; never guesses a similar one. Returns { id, name, from, to }.
async function transitionIssue(c, key, transitionName) {
  const k = encodeURIComponent(key);
  const before = await request(
    c,
    "GET",
    `/rest/api/2/issue/${k}?fields=status`,
  );
  const list = await request(c, "GET", `/rest/api/2/issue/${k}/transitions`);
  const wanted = String(transitionName).trim().toLowerCase();
  const t = (list.transitions || []).find(
    (x) =>
      String(x.name || "")
        .trim()
        .toLowerCase() === wanted,
  );
  if (!t) {
    throw new JiraError({
      error: `transition "${transitionName}" is not available for ${key} in status "${name((before.fields || {}).status) || "unknown"}"`,
      available: (list.transitions || []).map((x) => x.name),
    });
  }
  await request(c, "POST", `/rest/api/2/issue/${k}/transitions`, {
    json: { transition: { id: String(t.id) } },
  });
  return {
    id: String(t.id),
    name: t.name,
    from: name((before.fields || {}).status),
    to: name(t.to),
  };
}

// Release fetch's (undici's) global dispatcher so no keepalive socket holds the process open (see bitbucket-pr.js).
async function closeHttp() {
  try {
    const sym = Object.getOwnPropertySymbols(globalThis).find(
      (s) => s.description === "undici.globalDispatcher.1",
    );
    const dispatcher = sym && globalThis[sym];
    if (dispatcher && typeof dispatcher.close === "function")
      await dispatcher.close();
  } catch {}
}

module.exports = {
  JiraError,
  jiraConfig,
  request,
  fetchIssue,
  issueRequests,
  checkConnection,
  transitionIssue,
  acFromDescription,
  closeHttp,
};
