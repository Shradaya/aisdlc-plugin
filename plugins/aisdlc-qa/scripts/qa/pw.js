#!/usr/bin/env node
// Run the workspace's Playwright CLI the same way on every shell: `node pw.js <playwright args...>` instead of
// `npx playwright ...`. NO_COLOR is dropped from its environment (Windows PowerShell 5.1 otherwise turns npx's
// NO_COLOR/FORCE_COLOR warning into an error), and the exit code is passed through: judge by it, never by stderr.
// `test`, `codegen` and `open` keep the production guard (QA_ENV / URL against config/environments.yaml).
// Examples: node pw.js show-report tasks/T-1/evidence/run-1/report    node pw.js install chromium
//           node pw.js init-agents --loop=claude                       node pw.js codegen --save-storage=.auth/qa.json <url>
const { spawnSync } = require("child_process");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const {
  resolveEnv,
  blockedReason,
  playwrightCli,
  playwrightEnv,
} = require("./env");

const ROOT = resolveRoot();
const args = process.argv.slice(2);
const fail = (msg, code) => {
  process.stderr.write(msg + "\n");
  process.exit(code);
};
if (!ROOT) fail(NOT_WORKSPACE, 2);
const cli = playwrightCli(ROOT);
if (!cli)
  fail(
    "Playwright is not installed in this workspace: run npm install first.",
    2,
  );

if (args[0] === "test" && !args.includes("--list")) {
  const env = resolveEnv(ROOT);
  if (!env.ok) fail(`Playwright target environment refused: ${env.reason}`, 1);
}
if (["codegen", "open"].includes(args[0])) {
  for (const a of args) {
    let host = "";
    try {
      host = new URL(a).hostname.toLowerCase();
    } catch {
      continue;
    }
    const r = blockedReason(ROOT, host);
    if (r) fail(r, 1);
  }
}
const r = spawnSync(process.execPath, [cli, ...args], {
  cwd: ROOT,
  env: playwrightEnv(),
  stdio: "inherit",
});
process.exit(r.status ?? 1);
