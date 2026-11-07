#!/usr/bin/env node
// SessionStart hook (aisdlc plugin). Read-only: tells the person what is waiting for their role. No-op outside a shared aisdlc repo.
const { resolveRoot, workspaceKind } = require("../scripts/lib/root");
const flow = require("../scripts/flow/flow");
const ROOT = resolveRoot();
if (!ROOT || workspaceKind(ROOT) !== "aisdlc") process.exit(0);
try {
  const role = flow.resolveRole(ROOT);
  if (!role) { console.log("aisdlc: your role is not set. Run /aisdlc:init (or set AISDLC_ROLE) so hand-offs for you are shown."); process.exit(0); }
  const lines = flow.summary(ROOT, role);
  console.log(`aisdlc (${role}): ` + (lines.length ? "\n  " + lines.join("\n  ") : "nothing waiting. Run /aisdlc:pull for the latest."));
} catch (e) { console.log("aisdlc: could not read the flow (" + e.message + ")"); }
