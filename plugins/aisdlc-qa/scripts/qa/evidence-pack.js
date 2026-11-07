#!/usr/bin/env node
// Pack one run's evidence into the files that go to Jira, named so runs never collide:
//   publish (default) -> run-<N>/upload/
//     <T>-run<N>-report.zip        the HTML report (videos and traces left out unless --with-media)
//     <T>-run<N>-screenshots.zip   every step screenshot, by scenario
//     <T>-run<N>-<S>-final.png     last screenshot of each scenario
//     <T>-run<N>-<S>-failed.png    the failing step of each failed scenario
//   --defect S2,S4 -> run-<N>/upload-defect/: only the failed-step (or final) screenshot of the listed scenarios
// Usage: node evidence-pack.js <TICKET> <N> [--defect S2,S4] [--with-media]
// Output: one JSON line { ok, dir, files: [relative paths] }. Exit 0 ok, 1 error.
const fs = require("fs");
const path = require("path");
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const { zipDir } = require("./zip");

const ROOT = resolveRoot();
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const [ticket, n] = args;
const done = (o, code) => {
  console.log(JSON.stringify(o));
  process.exit(code);
};

if (!ROOT) done({ ok: false, error: NOT_WORKSPACE }, 1);
if (!/^[A-Z][A-Z0-9]*-\d+$/.test(ticket || "") || !/^\d+$/.test(n || ""))
  done(
    {
      ok: false,
      error:
        "usage: evidence-pack.js <TICKET> <N> [--defect S2,S4] [--with-media]",
    },
    1,
  );
const run = path.join(ROOT, "tasks", ticket, "evidence", `run-${n}`);
const summaryFile = path.join(run, "summary.json");
if (!fs.existsSync(summaryFile))
  done(
    {
      ok: false,
      error: `no summary.json in run-${n}; run summarize-results.js first`,
    },
    1,
  );
const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
const abs = (p) => path.join(ROOT, p);
const prefix = `${ticket}-run${n}`;
const defect = opt("--defect");
const files = [];

function fresh(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function copy(src, dir, name) {
  if (!src || !fs.existsSync(abs(src))) return;
  fs.copyFileSync(abs(src), path.join(dir, name));
  files.push(path.relative(ROOT, path.join(dir, name)).replace(/\\/g, "/"));
}

if (defect) {
  const ids = defect
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = fresh(path.join(run, "upload-defect"));
  for (const id of ids) {
    const t = summary.tests.find(
      (x) => x.scenario === id && x.status !== "passed",
    );
    if (!t)
      done({ ok: false, error: `scenario ${id} did not fail in run-${n}` }, 1);
    copy(
      t.failed_screenshot || t.final_screenshot,
      out,
      `${prefix}-${id}-failed.png`,
    );
  }
  done(
    { ok: true, dir: path.relative(ROOT, out).replace(/\\/g, "/"), files },
    0,
  );
}

const out = fresh(path.join(run, "upload"));
const withMedia = args.includes("--with-media");
const report = path.join(run, "report");
if (fs.existsSync(report)) {
  // In the HTML report's data/ folder, *.zip are traces and *.webm are videos.
  zipDir(
    report,
    path.join(out, `${prefix}-report.zip`),
    (rel) => !withMedia && /^data\/.*\.(zip|webm)$/i.test(rel),
  );
  files.push(
    path
      .relative(ROOT, path.join(out, `${prefix}-report.zip`))
      .replace(/\\/g, "/"),
  );
}
const shots = path.join(run, "screenshots");
if (fs.existsSync(shots)) {
  zipDir(shots, path.join(out, `${prefix}-screenshots.zip`));
  files.push(
    path
      .relative(ROOT, path.join(out, `${prefix}-screenshots.zip`))
      .replace(/\\/g, "/"),
  );
}
for (const t of summary.tests.filter((x) => x.scenario)) {
  copy(t.final_screenshot, out, `${prefix}-${t.scenario}-final.png`);
  if (t.status === "failed" || t.status === "flaky")
    copy(t.failed_screenshot, out, `${prefix}-${t.scenario}-failed.png`);
}
done({ ok: true, dir: path.relative(ROOT, out).replace(/\\/g, "/"), files }, 0);
