#!/usr/bin/env node
// Check a QA target environment before testing: resolve it, apply the production guard, optionally probe that it
// answers over HTTP, and report what the workspace still needs (npm install, browsers, Playwright agents).
// Usage: node env-check.js [env-name] [--probe]
// Output: one JSON line. Exit codes: 0 ok, 1 blocked/unreachable/error, 2 not configured.
const fs = require("fs");
const path = require("path");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const { resolveEnv, playwrightCli } = require("./env");

const ROOT = resolveRoot();
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const probe = args.includes("--probe");

function done(payload, code) {
  process.exitCode = code;
  process.stdout.write(JSON.stringify(payload) + "\n");
}

async function main() {
  if (!ROOT) return done({ ok: false, error: NOT_WORKSPACE }, 2);
  const env = resolveEnv(ROOT, name);
  const workspace = {
    playwright_installed: Boolean(playwrightCli(ROOT)),
    playwright_agents: ["planner", "generator", "healer"].every((a) =>
      fs.existsSync(
        path.join(ROOT, ".claude", "agents", `playwright-test-${a}.md`),
      ),
    ),
    storage_state: env.name
      ? fs.existsSync(path.join(ROOT, ".auth", `${env.name}.json`))
      : false,
  };
  if (!env.ok)
    return done({ ok: false, ...env, workspace }, env.base_url ? 1 : 2);
  if (!probe) return done({ ...env, workspace }, 0);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(env.base_url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { Connection: "close" },
    });
    done({ ...env, reachable: true, http_status: r.status, workspace }, 0);
  } catch (e) {
    done(
      {
        ...env,
        ok: false,
        reachable: false,
        error: String(e.cause?.code || e.message || e).slice(0, 200),
        workspace,
      },
      1,
    );
  } finally {
    clearTimeout(timer);
    setTimeout(() => process.exit(process.exitCode), 2000).unref();
  }
}

main();
