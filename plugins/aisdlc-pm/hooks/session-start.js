#!/usr/bin/env node
// SessionStart hook (pm plugin). Read-only: reports active PM tasks and warns if any Jira write switch is on.
// Does nothing outside a pm workspace.
const fs = require("fs");
const path = require("path");
const {
  resolveRoot,
  workspaceKind,
  configPath,
} = require("../scripts/lib/root");
const ROOT = resolveRoot();
const { state: STATE_FILE, log: LOG_FILE } =
  require("../scripts/lib/root").taskNames(ROOT); // task.yaml, or task.<role>.yaml in a shared aisdlc workspace
if (!ROOT || !["pm", "aisdlc"].includes(workspaceKind(ROOT))) process.exit(0); // not a PM workspace (config/workspace.yaml "kind": "pm")
const out = [];
const td = path.join(ROOT, "tasks");
const active = [];
if (fs.existsSync(td))
  for (const t of fs.readdirSync(td)) {
    const f = path.join(td, t, STATE_FILE);
    if (!fs.existsSync(f)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      if (!["COMPLETED", "CANCELLED"].includes(j.task.status))
        active.push(`${j.task.id}: ${j.task.status}`);
    } catch {
      out.push(`WARNING: corrupt task file ${f}`);
    }
  }
out.push(
  `aisdlc-pm: ${active.length} active PM task(s)${active.length ? " (" + active.join(", ") + ")" : ""}`,
);
// Warn when a Jira write switch is enabled: writes to the Jira description are only ever made after an explicit
// preview and confirmation, so leaving a switch on between syncs is worth flagging.
try {
  const cfg = JSON.parse(
    fs
      .readFileSync(configPath(ROOT, "integrations.yaml"), "utf8")
      .replace(/^\s*#.*$/gm, ""),
  );
  const w = (cfg.jira || {}).write || {};
  const on = ["update_description", "update_acceptance_criteria_field"].filter(
    (k) => w[k] === true,
  );
  if (on.length)
    out.push(
      `Note: Jira write switch(es) on (${on.join(", ")}); writes still require a preview and your confirmation (jira-pm.js apply).`,
    );
} catch {}
console.log(out.join("\n"));
