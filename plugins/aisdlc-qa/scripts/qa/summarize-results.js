#!/usr/bin/env node
// Summarize one test run for the results-analyst and the QA: per-test status, scenario/AC tags, error, failing step and
// evidence paths, plus which approved scenarios have no test. Reads tasks/<T>/evidence/run-<N>/results.json (Playwright
// JSON reporter) and tasks/<T>/scenarios.md; writes run-<N>/summary.json and prints it as one JSON line.
// Usage: node summarize-results.js <TICKET> <N>
const fs = require("fs");
const path = require("path");

const ANSI = /\x1b\[[0-9;]*m/g;
const rel = (root, p) =>
  p ? path.relative(root, p).replace(/\\/g, "/") : null;

// Scenario IDs of the ticket: headings like "### S3 — Title" or "## S3: Title" in the approved tasks/<T>/spec.md, else
// in tasks/<T>/scenarios.md (before the spec copy exists).
function scenarioIds(root, ticket) {
  const f = ["spec.md", "scenarios.md"]
    .map((n) => path.join(root, "tasks", ticket, n))
    .find((p) => fs.existsSync(p));
  if (!f) return [];
  return [...fs.readFileSync(f, "utf8").matchAll(/^#{2,4}\s*(S\d+)\b/gm)].map(
    (m) => m[1],
  );
}

function firstFailedStep(steps = []) {
  for (const s of steps) {
    const inner = firstFailedStep(s.steps);
    if (inner) return inner;
    if (s.error) return s.title;
  }
  return null;
}

function* specsOf(suite) {
  for (const spec of suite.specs || []) yield { file: suite.file, spec };
  for (const child of suite.suites || []) yield* specsOf(child);
}

function summarize(root, ticket, n) {
  const dir = path.join(root, "tasks", ticket, "evidence", `run-${n}`);
  const resultsFile = path.join(dir, "results.json");
  if (!fs.existsSync(resultsFile))
    return { ok: false, error: `no results.json in ${rel(root, dir)}` };
  const report = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
  const tagRe = new RegExp(`^@${ticket}-(S|AC)(\\d+)$`);
  const tests = [];
  let setupError = null;
  for (const top of report.suites || []) {
    for (const { file, spec } of specsOf(top)) {
      for (const t of spec.tests || []) {
        const last = (t.results || []).at(-1) || {};
        const message = last.error
          ? String(last.error.message || "")
              .replace(ANSI, "")
              .slice(0, 600)
          : null;
        if (t.projectName === "setup") {
          if (t.status === "unexpected") setupError = message || "setup failed";
          continue;
        }
        const tags =
          spec.tags && spec.tags.length
            ? spec.tags.map((x) => (x.startsWith("@") ? x : "@" + x))
            : spec.title.match(/@[\w-]+/g) || [];
        const scenario = tags
          .map((x) => x.match(tagRe))
          .find((m) => m && m[1] === "S");
        const acs = tags
          .map((x) => x.match(tagRe))
          .filter((m) => m && m[1] === "AC")
          .map((m) => `AC${m[2]}`);
        const atts = last.attachments || [];
        // qaStep attachments are named "<nn>-<step>[-FAILED]" (retries prefixed "retry<k>-"). Playwright copies attached
        // files into artifacts/ with a hash suffix; point at the canonical copy under screenshots/<T>-S<n>/ when present.
        const stepAtts = atts
          .filter((a) => a.path && /^(retry\d+-)?\d{2}-/.test(a.name))
          .map((a) => {
            const canonical =
              scenario &&
              path.join(
                dir,
                "screenshots",
                `${ticket}-S${scenario[2]}`,
                `${a.name}.png`,
              );
            return {
              name: a.name,
              path: rel(
                root,
                canonical && fs.existsSync(canonical) ? canonical : a.path,
              ),
            };
          });
        const steps = stepAtts.map((a) => a.path);
        const pwShot = atts.find((a) => a.name === "screenshot" && a.path);
        tests.push({
          file,
          title: spec.title,
          scenario: scenario ? `S${scenario[2]}` : null,
          acs,
          status:
            {
              expected: "passed",
              unexpected: "failed",
              flaky: "flaky",
              skipped: "skipped",
            }[t.status] || t.status,
          duration_ms: last.duration ?? null,
          retries: Math.max(0, (t.results || []).length - 1),
          error: message,
          failed_step: firstFailedStep(last.steps),
          step_screenshots: steps,
          failed_screenshot:
            (stepAtts.find((a) => /-FAILED$/.test(a.name)) || {}).path || null,
          final_screenshot: pwShot
            ? rel(root, pwShot.path)
            : steps.at(-1) || null,
          trace: rel(
            root,
            (atts.find((a) => a.name === "trace" && a.path) || {}).path,
          ),
          video: rel(
            root,
            (atts.find((a) => a.name === "video" && a.path) || {}).path,
          ),
        });
      }
    }
  }
  // A run limited with --only (run.json "only") is checked for gaps among the selected scenarios only.
  let only = [];
  try {
    only =
      JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8")).only ||
      [];
  } catch {}
  const declared = scenarioIds(root, ticket).filter(
    (s) => !only.length || only.includes(s),
  );
  const covered = new Set(tests.map((t) => t.scenario).filter(Boolean));
  const count = (s) => tests.filter((t) => t.status === s).length;
  const summary = {
    ok: true,
    ticket,
    run: Number(n),
    dir: rel(root, dir),
    report: rel(root, path.join(dir, "report", "index.html")),
    totals: {
      tests: tests.length,
      passed: count("passed"),
      failed: count("failed"),
      flaky: count("flaky"),
      skipped: count("skipped"),
    },
    setup_error: setupError,
    run_errors: (report.errors || []).map((e) =>
      String(e.message || "")
        .replace(ANSI, "")
        .slice(0, 300),
    ),
    uncovered_scenarios: declared.filter((s) => !covered.has(s)),
    untagged_tests: tests.filter((t) => !t.scenario).map((t) => t.title),
    tests,
  };
  fs.writeFileSync(
    path.join(dir, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  return summary;
}

if (require.main === module) {
  const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
  const root = resolveRoot();
  const [ticket, n] = process.argv.slice(2);
  if (!root) {
    console.log(JSON.stringify({ ok: false, error: NOT_WORKSPACE }));
    process.exit(2);
  }
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(ticket || "") || !/^\d+$/.test(n || "")) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "usage: summarize-results.js <TICKET> <N>",
      }),
    );
    process.exit(1);
  }
  const s = summarize(root, ticket, n);
  console.log(JSON.stringify(s));
  process.exit(s.ok ? 0 : 1);
}

module.exports = { summarize, scenarioIds };
