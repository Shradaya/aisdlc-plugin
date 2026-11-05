#!/usr/bin/env node
// pm-only server mirror guard (design section 6.4). Pure CommonJS, no dependencies and no network: it reads only
// local files written by the vendored client's pull/push:
//   .aisdlc/server.json                  the workspace binding (its presence => "linked")
//   tasks/<T>/server-ticket.json         the last pulled server view, incl. gates[].status
//   .aisdlc/sync.json                    tickets[T].artifacts[<name>].sha256 of what the server has (sha256:<hex>)
//
// serverApproval(root, T)              -> { linked, ok, reason? }
//   Whether the server's acceptance_criteria gate is approved. Used by the hand-off transition guard in the hook.
//   An UNLINKED workspace has nothing to mirror, so ok:true (the guard lets the local transition through).
//
// jiraWritePrecheck(root, T, {allowUnlinked}) -> { linked, ok, reason?, hint? }
//   serverApproval plus, when linked: the local requirements.md / acceptance-criteria.md must match the sha256 the
//   server recorded (not_pushed otherwise) and server-ticket.json.pulledAt must be newer than both files (pull_stale
//   otherwise). An UNLINKED workspace is refused (unlinked_workspace) unless allowUnlinked is passed. Used by
//   jira-pm.js (FEAT-003) before any Jira write, so Jira only receives the exact AC text the human approved.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const AC_FILE = "acceptance-criteria.md";
const REQ_FILE = "requirements.md";
const PUSHED_FILES = [REQ_FILE, AC_FILE];

const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
};
const fileSha = (f) => {
  try { return "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); } catch { return null; }
};
const isLinked = (root) => fs.existsSync(path.join(root, ".aisdlc", "server.json"));

// Whether the server's acceptance_criteria gate is approved for T, per the last pulled server-ticket.json.
function serverApproval(root, T) {
  if (!isLinked(root)) return { linked: false, ok: true };
  const tk = readJson(path.join(root, "tasks", T, "server-ticket.json"));
  if (!tk) return { linked: true, ok: false, reason: "no_server_ticket" };
  const gate = (tk.gates || []).find((g) => g && g.gate === "acceptance_criteria");
  if (!gate) return { linked: true, ok: false, reason: "no_ac_gate" };
  if (gate.status === "approved") return { linked: true, ok: true };
  return { linked: true, ok: false, reason: "ac_not_approved", gateStatus: gate.status };
}

// serverApproval + local-vs-server artifact and freshness checks, for the Jira write path.
function jiraWritePrecheck(root, T, opts = {}) {
  const allowUnlinked = !!opts.allowUnlinked;
  if (!isLinked(root)) {
    return allowUnlinked
      ? { linked: false, ok: true }
      : { linked: false, ok: false, reason: "unlinked_workspace", hint: "Link the workspace with /aisdlc-pm:server init, or pass --allow-unlinked knowingly." };
  }
  const approval = serverApproval(root, T);
  if (!approval.ok) {
    const hint = approval.reason === "ac_not_approved"
      ? "A human must approve the acceptance_criteria gate in the AISDLC web UI, then /aisdlc-pm:pull " + T + "."
      : "Run /aisdlc-pm:pull " + T + " first.";
    return { linked: true, ok: false, reason: approval.reason, hint };
  }
  // The server's recorded sha256 of each pushed artifact must equal the local file.
  const sync = readJson(path.join(root, ".aisdlc", "sync.json")) || { tickets: {} };
  const serverArtifacts = ((sync.tickets || {})[T] || {}).artifacts || {};
  for (const name of PUSHED_FILES) {
    const local = fileSha(path.join(root, "tasks", T, name));
    const server = (serverArtifacts[name] || {}).sha256;
    if (!local || !server || local !== server) {
      return { linked: true, ok: false, reason: "not_pushed", hint: "Push the current files first: /aisdlc-pm:push " + T + "." };
    }
  }
  // The pull must be newer than both local files (so we mirror what the human approved, not newer local edits).
  const tk = readJson(path.join(root, "tasks", T, "server-ticket.json"));
  const pulledAt = tk && tk.pulledAt ? Date.parse(tk.pulledAt) : NaN;
  for (const name of PUSHED_FILES) {
    let mtime = 0;
    try { mtime = fs.statSync(path.join(root, "tasks", T, name)).mtimeMs; } catch {}
    if (!Number.isFinite(pulledAt) || mtime > pulledAt) {
      return { linked: true, ok: false, reason: "pull_stale", hint: "Pull the approved server copy again: /aisdlc-pm:pull " + T + "." };
    }
  }
  return { linked: true, ok: true };
}

module.exports = { serverApproval, jiraWritePrecheck, isLinked };
