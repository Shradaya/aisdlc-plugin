#!/usr/bin/env node
// Vendor the canonical shared core (packages/aisdlc-core) into each plugin's own subtree.
// A hosted-marketplace install copies only the plugin's own subtree, so each plugin must carry its own copy
// of the core. packages/aisdlc-core is the single source of truth; this script keeps the copies identical.
// Usage: node scripts/sync-core.js [--check]
//   (no flag)  copy the core into every plugin listed in CORE_CONSUMERS
//   --check    exit non-zero if any vendored copy differs from the canonical source (for CI)
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const CORE = path.join(REPO, "packages", "aisdlc-core");

// Which files each plugin needs. aisdlc-design does not need the full feature config, but needs the same
// lib + state engine; both plugins get the same core files (the engine is config-driven, not type-specific).
const CORE_FILES = ["lib/root.js", "lib/repo-paths.js", "lib/yaml.js", "lib/design-config.js", "state/aisdlc-state.js"];
const CORE_CONSUMERS = [
  path.join(REPO, "plugins", "aisdlc-dev", "scripts"),
  path.join(REPO, "plugins", "aisdlc-design", "scripts"),
];

const check = process.argv.includes("--check");
let drift = 0;

for (const dest of CORE_CONSUMERS) {
  if (!fs.existsSync(path.dirname(dest))) continue; // plugin not created yet
  for (const rel of CORE_FILES) {
    const src = path.join(CORE, rel);
    const out = path.join(dest, rel);
    const want = fs.readFileSync(src);
    const have = fs.existsSync(out) ? fs.readFileSync(out) : null;
    if (have && want.equals(have)) continue;
    if (check) {
      console.error(`DRIFT ${path.relative(REPO, out)} differs from canonical ${rel}`);
      drift++;
    } else {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, want);
      console.log(`synced ${path.relative(REPO, out)}`);
    }
  }
}

if (check) {
  console.log(drift ? `\n${drift} vendored file(s) out of date; run: node scripts/sync-core.js` : "vendored core is up to date");
  process.exit(drift ? 1 : 0);
}
console.log("done");
