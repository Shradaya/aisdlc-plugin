#!/usr/bin/env node
// Resolve what a code review needs to know about the data the project handles, from config/workspace.yaml "data":
//   { "sensitivity": "none" | "pii" | "phi" | "financial" | "<custom>", "data_files": [".csv", ".hl7", ...] }
// The checklist for a sensitivity is config/sensitivity/<name>.md: a file of that name in the workspace's config/
// wins over the one the plugin ships, so a team can tighten or replace it.
//
//   node sensitivity.js [--repo <path> --range <base>..<head>]
//
// Output: one JSON line { ok, sensitivity, data_files, checklist_source: "workspace"|"plugin"|null,
//   checklist_path, checklist, data_files_in_diff?, warnings }. With --repo and --range, data_files_in_diff lists the
// files the range adds or changes whose extension is in data_files (names only; contents are never read).
// Exit 0 ok, 1 invalid config or usage, 2 not inside a workspace.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { resolveRoot, configPath, NOT_WORKSPACE } = require("../lib/root");
const { readYaml } = require("../lib/yaml");

const done = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

const root = resolveRoot();
if (!root) done({ ok: false, error: NOT_WORKSPACE }, 2);

const ws = readYaml(path.join(root, "config", "workspace.yaml"), {}) || {};
const data = ws.data === undefined ? {} : ws.data;
if (data === null || typeof data !== "object" || Array.isArray(data)) done({ ok: false, error: 'config/workspace.yaml "data" must be an object like { "sensitivity": "phi", "data_files": [".csv"] }' }, 1);

const sensitivity = String(data.sensitivity === undefined ? "none" : data.sensitivity).trim().toLowerCase();
if (!/^[a-z][a-z0-9_-]*$/.test(sensitivity)) done({ ok: false, error: `data.sensitivity "${data.sensitivity}" is not a name (letters, digits, - and _)` }, 1);
const fileList = data.data_files === undefined ? [] : data.data_files;
if (!Array.isArray(fileList) || fileList.some((e) => typeof e !== "string" || !/^\.[A-Za-z0-9]+$/.test(e)))
  done({ ok: false, error: 'data.data_files must be a list of extensions like ".csv"' }, 1);
const dataFiles = fileList.map((e) => e.toLowerCase());

const warnings = [];
let checklist = null, checklistPath = null, source = null;
if (sensitivity !== "none") {
  const rel = path.join("sensitivity", sensitivity + ".md");
  const p = configPath(root, rel);
  if (fs.existsSync(p)) {
    checklist = fs.readFileSync(p, "utf8");
    checklistPath = p;
    source = p.startsWith(path.join(root, "config")) ? "workspace" : "plugin";
  } else {
    warnings.push(`no checklist for sensitivity "${sensitivity}": add config/sensitivity/${sensitivity}.md to the workspace, or use none, pii, phi or financial`);
  }
}

const out = { ok: true, sensitivity, data_files: dataFiles, checklist_source: source, checklist_path: checklistPath, checklist, warnings };

const repo = opt("--repo"), range = opt("--range");
if (repo || range) {
  if (!repo || !range) done({ ok: false, error: "--repo and --range go together" }, 1);
  if (!/^[\w./~^@{}-]+\.\.\.?[\w./~^@{}-]+$/.test(range)) done({ ok: false, error: "--range must look like <base>..<head>" }, 1);
  try {
    const files = execFileSync("git", ["-C", repo, "diff", "--name-only", "--diff-filter=ACMR", range], { encoding: "utf8" }).split("\n").filter(Boolean);
    out.data_files_in_diff = files.filter((f) => dataFiles.includes(path.extname(f).toLowerCase()));
  } catch (e) {
    done({ ok: false, error: `git diff failed in ${repo}: ${String(e.stderr || e.message).trim().split("\n")[0]}` }, 1);
  }
}
done(out);
