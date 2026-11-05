#!/usr/bin/env node
// Fail if any tracked text file still contains git merge-conflict markers ("<<<<<<< x" or ">>>>>>> x" at line start).
// Usage: node scripts/check-conflict-markers.js [--root <repo>]
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const MARKER = /^(<{7}|>{7})(\s|$)/;

function scan(root) {
  const files = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
  const hits = [];
  for (const rel of files) {
    let buf;
    try { buf = fs.readFileSync(path.join(root, rel)); } catch { continue; } // deleted in the working tree
    if (buf.includes(0)) continue; // binary
    buf.toString("utf8").split(/\r?\n/).forEach((line, i) => { if (MARKER.test(line)) hits.push(`${rel}:${i + 1}: ${line.slice(0, 60)}`); });
  }
  return hits;
}
module.exports = { scan };

if (require.main === module) {
  const a = process.argv.slice(2);
  const root = path.resolve(a.includes("--root") ? a[a.indexOf("--root") + 1] : path.join(__dirname, ".."));
  const hits = scan(root);
  if (hits.length) {
    console.error("merge conflict markers found:\n" + hits.map((h) => "  " + h).join("\n"));
    process.exit(1);
  }
  console.log("no conflict markers");
}
