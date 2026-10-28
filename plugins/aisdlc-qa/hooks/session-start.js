#!/usr/bin/env node
// SessionStart hook (QA plugin). Read-only: reports active QA tasks (tasks waiting for a developer fix are listed
// separately) and what the workspace still needs. Does nothing outside a QA workspace.
const fs = require("fs");
const path = require("path");
const { resolveRoot, workspaceKind } = require("../scripts/lib/root");
const ROOT = resolveRoot();
if (!ROOT || workspaceKind(ROOT) !== "qa") process.exit(0); // not a QA workspace
const out = [];
const td = path.join(ROOT, "tasks");
const active = [], waiting = [];
if (fs.existsSync(td)) for (const t of fs.readdirSync(td)) {
  const f = path.join(td, t, "task.yaml");
  if (!fs.existsSync(f)) continue;
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    if (["COMPLETED", "CANCELLED"].includes(j.task.status)) continue;
    if (j.task.status === "AWAITING_DEV_FIX") {
      const open = Object.values(j.defects || {}).filter((d) => d && d.status === "open").length;
      waiting.push(`${j.task.id} (${open} open defect${open === 1 ? "" : "s"})`);
    } else active.push(`${j.task.id}: ${j.task.status}`);
  } catch { out.push(`WARNING: corrupt task file ${f}`); }
}
out.push(`aisdlc-qa: ${active.length + waiting.length} active QA task(s)${active.length ? " (" + active.join(", ") + ")" : ""}`);
if (waiting.length) out.push(`Waiting for a developer fix: ${waiting.join(", ")}. Check with /aisdlc-qa:status; re-verify with /aisdlc-qa:run <TICKET>.`);
if (!fs.existsSync(path.join(ROOT, "node_modules", "@playwright", "test")))
  out.push("Setup: Playwright is not installed here yet; run /aisdlc-qa:init (or npm install, then npx playwright install chromium).");
else if (!fs.existsSync(path.join(ROOT, ".claude", "agents", "playwright-test-generator.md")))
  out.push("Setup: Playwright test agents are missing; run /aisdlc-qa:init --only agents.");
console.log(out.join("\n"));
