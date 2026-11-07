#!/usr/bin/env node
// Vendor the canonical shared core (packages/aisdlc-core) into each plugin's own subtree.
// A hosted-marketplace install copies only the plugin's own subtree, so each plugin must carry its own copy
// of the core. packages/aisdlc-core is the single source of truth; this script keeps the copies identical.
// Usage: node scripts/sync-core.js [--check]
//   (no flag)  copy the core into every plugin listed in CORE_CONSUMERS
//   --check    exit non-zero if any vendored copy differs from the canonical source (to verify the copies)
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const CORE = path.join(REPO, "packages", "aisdlc-core");

// Which files each plugin needs. aisdlc-dev and aisdlc-qa get the full core (lib + state engine; lifecycles and their
// gates come from each plugin's config/task-types.yaml). aisdlc-design has no task lifecycle, so it only needs the
// workspace-root helper.
const FULL_CORE = [
  "lib/root.js",
  "lib/repo-paths.js",
  "lib/yaml.js",
  "lib/design-config.js",
  "lib/jira.js",
  "lib/auditlog.js",
  "state/aisdlc-state.js",
];
const CORE_CONSUMERS = [
  {
    dest: path.join(REPO, "plugins", "aisdlc-dev", "scripts"),
    files: FULL_CORE,
  },
  {
    dest: path.join(REPO, "plugins", "aisdlc-design", "scripts"),
    files: ["lib/root.js"],
  },
  {
    dest: path.join(REPO, "plugins", "aisdlc-qa", "scripts"),
    files: FULL_CORE,
  },
  // pm keeps its own repo-paths, yaml and design-config; it shares the root helper, Jira client and state engine.
  {
    dest: path.join(REPO, "plugins", "aisdlc-pm", "scripts"),
    files: [
      "lib/root.js",
      "lib/jira.js",
      "lib/auditlog.js",
      "state/aisdlc-state.js",
    ],
  },
  // aisdlc has no task lifecycle of its own: root helper and the JSON-YAML reader only.
  {
    dest: path.join(REPO, "plugins", "aisdlc", "scripts"),
    files: ["lib/root.js", "lib/yaml.js", "lib/auditlog.js"],
  },
];

// The QA files that /aisdlc:init scaffolds for every role are mirrored from the QA plugin's templates.
const QA_MIRROR = [
  "config/environments.yaml",
  "fixtures/env.ts",
  "fixtures/pdf.ts",
  "fixtures/qa.ts",
  "package.json",
  "playwright.config.ts",
  "tests/auth.setup.ts",
  "tests/seed.spec.ts",
];
const check = process.argv.includes("--check");
let drift = 0;

for (const { dest, files } of CORE_CONSUMERS) {
  if (!fs.existsSync(path.dirname(dest))) continue; // plugin not created yet
  for (const rel of files) {
    const src = path.join(CORE, rel);
    const out = path.join(dest, rel);
    const want = fs.readFileSync(src);
    const have = fs.existsSync(out) ? fs.readFileSync(out) : null;
    if (have && want.equals(have)) continue;
    if (check) {
      console.error(
        `DRIFT ${path.relative(REPO, out)} differs from canonical ${rel}`,
      );
      drift++;
    } else {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, want);
      console.log(`synced ${path.relative(REPO, out)}`);
    }
  }
}

for (const rel of QA_MIRROR) {
  const src = path.join(
      REPO,
      "plugins",
      "aisdlc-qa",
      "templates",
      "workspace",
      rel,
    ),
    out = path.join(REPO, "plugins", "aisdlc", "templates", "qa", rel);
  if (
    !fs.existsSync(src) ||
    (fs.existsSync(out) && fs.readFileSync(src).equals(fs.readFileSync(out)))
  )
    continue;
  if (check) {
    console.error(
      `DRIFT plugins/aisdlc/templates/qa/${rel} differs from the QA plugin template`,
    );
    drift++;
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(src, out);
    console.log(`synced aisdlc qa template ${rel}`);
  }
}

if (check) {
  console.log(
    drift
      ? `\n${drift} vendored file(s) out of date; run: node scripts/sync-core.js`
      : "vendored core is up to date",
  );
  process.exit(drift ? 1 : 0);
}
console.log("done");
