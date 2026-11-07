#!/usr/bin/env node
// Run an ad-hoc check (no ticket) so the QA can watch, keeping the proof locally.
// Usage: node run-check.js checks/<slug>.spec.ts [--watch|--headless] [--env <name>] [--build <id>] [--video] [--slowmo <ms>]
// No task state, no Jira, no approval gate - but the same production guard, login setup and fixtures as ticket runs.
// Proof: test-results/<slug>/run-<yyyymmdd-hhmmss>/{screenshots/, report/, trace.zip, result.json, results.json, artifacts/}
// (Playwright's own outputDir is test-results/.playwright/, so earlier check runs are never wiped.)
// Output: the Playwright list output, then one JSON line with the folder and per-step results. A failing check is a
// normal outcome (exit 0); exit 1 = blocked/error, 2 = workspace not set up.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { resolveRoot, configPath, NOT_WORKSPACE } = require("../lib/root");
const { readYaml } = require("../lib/yaml");
const { loadEnv } = require("../lib/repo-paths");
const { resolveEnv, playwrightCli, playwrightEnv } = require("./env");

const ROOT = resolveRoot();
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const done = (o, code) => {
  console.log(JSON.stringify(o));
  process.exit(code);
};
const rel = (p) => (p ? path.relative(ROOT, p).replace(/\\/g, "/") : null);
// Same as slug() in templates/workspace/fixtures/qa.ts (the screenshot folder of a test without a ticket tag).
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "step";

if (!ROOT) done({ ok: false, error: NOT_WORKSPACE }, 2);
const specArg = args.find(
  (a, i) =>
    !a.startsWith("--") &&
    !["--env", "--build", "--slowmo"].includes(args[i - 1]),
);
const spec = specArg && path.resolve(ROOT, specArg);
if (
  !spec ||
  !/[\\/]checks[\\/][^\\/]+\.spec\.ts$/.test(spec) ||
  !fs.existsSync(spec)
)
  done(
    {
      ok: false,
      error:
        "usage: run-check.js checks/<slug>.spec.ts [--watch|--headless] [--env <name>] [--build <id>] [--video]",
    },
    1,
  );

const env = resolveEnv(ROOT, opt("--env"));
if (!env.ok)
  done(
    { ok: false, error: env.reason, environment: env.name || null },
    env.base_url ? 1 : 2,
  );
const cli = playwrightCli(ROOT);
if (!cli)
  done(
    {
      ok: false,
      error:
        "Playwright is not installed in this workspace: run npm install (and npx playwright install chromium).",
    },
    2,
  );

const headless = args.includes("--headless");
const video = args.includes("--video");
const policy = readYaml(configPath(ROOT, "qa-policy.yaml"), {}) || {};
const slowMo =
  opt("--slowmo") ||
  loadEnv(ROOT).QA_SLOWMO ||
  String((policy.watch || {}).slow_mo_ms ?? 500);
const base = playwrightEnv({ QA_ENV: env.name });
for (const k of ["QA_EVIDENCE_DIR", "QA_VIDEO", "QA_HEADLESS"]) delete base[k];

// Sign in outside the evidence, as for ticket runs, so credentials never appear in a trace or report.
const setup = spawnSync(
  process.execPath,
  [cli, "test", "--project", "setup", "--reporter", "line"],
  {
    cwd: ROOT,
    env: { ...base, QA_HEADLESS: "1", QA_SLOWMO: "0" },
    stdio: ["ignore", "inherit", "inherit"],
  },
);
if (setup.status !== 0)
  done(
    {
      ok: false,
      environment: env.name,
      error: `Login setup failed for '${env.name}': check login in config/environments.yaml and QA_USERNAME / QA_PASSWORD (environment or .env).`,
    },
    1,
  );

const name = path.basename(spec, ".spec.ts");
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace("T", "-")
  .slice(0, 15);
const dir = path.join(ROOT, "test-results", name, `run-${stamp}`);
fs.mkdirSync(dir, { recursive: true });
const started = new Date().toISOString();
const r = spawnSync(
  process.execPath,
  [cli, "test", path.relative(ROOT, spec).replace(/\\/g, "/"), "--no-deps"],
  {
    cwd: ROOT,
    env: {
      ...base,
      QA_EVIDENCE_DIR: dir,
      PLAYWRIGHT_HTML_OPEN: "never",
      QA_SLOWMO: headless ? "0" : slowMo,
      ...(headless ? { QA_HEADLESS: "1" } : {}),
      ...(video ? { QA_VIDEO: "1" } : {}),
    },
    stdio: ["ignore", "inherit", "inherit"],
  },
);

let report = {};
try {
  report = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
} catch {
  done(
    {
      ok: false,
      dir: rel(dir),
      playwright_exit: r.status,
      error: "no results.json: the run did not complete",
    },
    1,
  );
}
const specs = [];
(function walk(s) {
  for (const x of s.specs || []) specs.push(x);
  for (const c of s.suites || []) walk(c);
})({ suites: report.suites || [] });
const tests = [];
let traceN = 0;
for (const sp of specs)
  for (const t of sp.tests || []) {
    if (t.projectName === "setup") continue;
    const last = (t.results || []).at(-1) || {};
    const shotsDir = path.join(dir, "screenshots", slug(sp.title));
    const shots = fs.existsSync(shotsDir)
      ? fs.readdirSync(shotsDir).sort()
      : [];
    // One entry per qaStep, from its screenshots "<nn>-<step slug>[-FAILED][-tab<k>].png"; titles from the reported steps.
    const titles = new Map(
      (last.steps || []).map((st) => [slug(st.title), st.title]),
    );
    const byStep = new Map();
    for (const f of shots) {
      const m = f.match(
        /^(?:retry\d+-)?(\d{2})-(.+?)(-FAILED)?(-tab\d+)?\.png$/,
      );
      if (!m) continue;
      const e = byStep.get(m[1]) || {
        n: Number(m[1]),
        title: titles.get(m[2]) || m[2],
        status: "passed",
        screenshots: [],
      };
      if (m[3]) e.status = "failed";
      e.screenshots.push(rel(path.join(shotsDir, f)));
      byStep.set(m[1], e);
    }
    const steps = [...byStep.values()].sort((a, b) => a.n - b.n);
    const trace = (last.attachments || []).find(
      (a) => a.name === "trace" && a.path,
    );
    let traceCopy = null;
    if (trace && fs.existsSync(trace.path)) {
      traceCopy = path.join(
        dir,
        traceN++ ? `trace-${traceN}.zip` : "trace.zip",
      );
      fs.copyFileSync(trace.path, traceCopy);
    }
    tests.push({
      title: sp.title,
      status:
        {
          expected: "passed",
          unexpected: "failed",
          flaky: "flaky",
          skipped: "skipped",
        }[t.status] || t.status,
      error: last.error
        ? String(last.error.message || "")
            .replace(/\x1b\[[0-9;]*m/g, "")
            .split("\n")[0]
            .slice(0, 300)
        : null,
      steps,
      trace: rel(traceCopy),
    });
  }
const result = {
  check: name,
  spec: rel(spec),
  environment: env.name,
  base_url: env.base_url,
  build: opt("--build") || null,
  mode: headless ? "headless" : "watch",
  video,
  started_at: started,
  finished_at: new Date().toISOString(),
  playwright_exit: r.status,
  tests,
};
fs.writeFileSync(
  path.join(dir, "result.json"),
  JSON.stringify(result, null, 2) + "\n",
);
done(
  {
    ok: true,
    dir: rel(dir),
    report: rel(path.join(dir, "report", "index.html")),
    ...result,
  },
  0,
);
