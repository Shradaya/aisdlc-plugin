#!/usr/bin/env node
// Acceptance tests for scripts/review/sensitivity.js: config validation, checklist resolution (plugin default vs.
// workspace override), and listing data files a real diff adds or changes.
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync, spawnSync } = require("child_process");
const SCRIPT = path.resolve(__dirname, "..", "review", "sensitivity.js");
const PLUGIN = path.resolve(__dirname, "..", "..");

const W = fs.mkdtempSync(path.join(os.tmpdir(), "sensitivity-"));
fs.mkdirSync(path.join(W, "config"));
fs.writeFileSync(path.join(W, "config/repositories.yaml"), "{}");
const setWorkspace = (data) => fs.writeFileSync(path.join(W, "config/workspace.yaml"), JSON.stringify({ workspace: { name: "t" }, ...(data === undefined ? {} : { data }) }));
const run = (...args) => spawnSync("node", [SCRIPT, ...args], { env: { ...process.env, AISDLC_ROOT: W, CLAUDE_PLUGIN_ROOT: PLUGIN }, encoding: "utf8" });
const j = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };

let fail = 0;
const t = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); const ok = g === w; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (got ${g}, want ${w})`}`); };

// no config at all: defaults to none, no checklist, no warning
setWorkspace(undefined);
let r = run();
t("no data block: sensitivity defaults to none", j(r).sensitivity, "none");
t("no data block: no checklist", j(r).checklist, null);
t("no data block: not an error", r.status, 0);

// phi: resolves the plugin's shipped checklist
setWorkspace({ sensitivity: "phi", data_files: [".csv", ".HL7"] });
r = run();
t("phi: sensitivity reported", j(r).sensitivity, "phi");
t("phi: data_files lower-cased", j(r).data_files, [".csv", ".hl7"]);
t("phi: resolves the plugin's checklist", j(r).checklist_source, "plugin");
t("phi: checklist text is non-empty and mentions PHI", /PHI/.test(j(r).checklist || "") && (j(r).checklist || "").length > 100, true);
t("phi: checklist_path points at the plugin's config/sensitivity/phi.md", /config[\\/]sensitivity[\\/]phi\.md$/.test(j(r).checklist_path || ""), true);

// pii and financial also resolve
t("pii: resolves", (() => { setWorkspace({ sensitivity: "pii" }); return j(run()).checklist_source; })(), "plugin");
t("financial: resolves", (() => { setWorkspace({ sensitivity: "financial" }); return j(run()).checklist_source; })(), "plugin");

// a workspace override wins over the plugin default
setWorkspace({ sensitivity: "phi" });
fs.mkdirSync(path.join(W, "config/sensitivity"), { recursive: true });
fs.writeFileSync(path.join(W, "config/sensitivity/phi.md"), "# Our stricter PHI checklist\n1. Our extra rule.\n");
r = run();
t("a workspace checklist overrides the plugin's", j(r).checklist_source, "workspace");
t("the overriding text is used, not the plugin's", /Our stricter PHI checklist/.test(j(r).checklist || ""), true);
fs.rmSync(path.join(W, "config/sensitivity"), { recursive: true });

// a sensitivity with no checklist anywhere: reported as a warning, not a crash, not invented content
setWorkspace({ sensitivity: "biometric" });
r = run();
t("an unknown sensitivity is accepted (free-form name)", r.status === 0 && j(r).sensitivity === "biometric", true);
t("...but reports the missing checklist as a warning", j(r).warnings.some((w) => /no checklist/.test(w)), true);
t("...and checklist is null, not fabricated", j(r).checklist, null);

// invalid config: reported, not guessed
setWorkspace({ sensitivity: "PHI!" });
t("an invalid sensitivity name is a config error (exit 1)", run().status, 1);
setWorkspace([{ sensitivity: "phi" }]); // data must be an object
t("a non-object 'data' is a config error", run().status, 1);
setWorkspace({ sensitivity: "phi", data_files: ["csv"] }); // missing the leading dot
t("a data_files entry without a leading dot is a config error", run().status, 1);
setWorkspace({ sensitivity: "phi", data_files: "csv" }); // not a list
t("a non-list data_files is a config error", run().status, 1);

// not a workspace at all
const nope = fs.mkdtempSync(path.join(os.tmpdir(), "sensitivity-none-"));
const cleanEnv = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN };
delete cleanEnv.AISDLC_ROOT; delete cleanEnv.CLAUDE_PROJECT_DIR; // resolveRoot trusts AISDLC_ROOT as given; search from cwd instead
t("outside a workspace: exit 2", spawnSync("node", [SCRIPT], { env: cleanEnv, cwd: nope, encoding: "utf8" }).status, 2);
fs.rmSync(nope, { recursive: true, force: true });

// --repo/--range: a real diff, files matching data_files are listed by name only
setWorkspace({ sensitivity: "phi", data_files: [".csv", ".hl7"] });
const repo = path.join(W, "repo");
fs.mkdirSync(repo);
execFileSync("git", ["init", "-q", "-b", "main", repo]);
execFileSync("git", ["-C", repo, "config", "user.email", "t@t"]);
execFileSync("git", ["-C", repo, "config", "user.name", "t"]);
fs.writeFileSync(path.join(repo, "readme.md"), "x\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "commit", "-q", "-m", "base"]);
execFileSync("git", ["-C", repo, "switch", "-q", "-c", "FEAT-1"]);
fs.writeFileSync(path.join(repo, "export.csv"), "patient,dob\nJohn,2000-01-01\n");
fs.writeFileSync(path.join(repo, "notes.txt"), "irrelevant\n");
fs.mkdirSync(path.join(repo, "jobs"));
fs.writeFileSync(path.join(repo, "jobs/report.hl7"), "MSH|...\n");
execFileSync("git", ["-C", repo, "add", "-A"]);
execFileSync("git", ["-C", repo, "commit", "-q", "-m", "add data files"]);
r = run("--repo", repo, "--range", "main...FEAT-1");
t("data files added in the range are listed", j(r).data_files_in_diff.sort(), ["export.csv", "jobs/report.hl7"].sort());
t("a file not in data_files is not listed", j(r).data_files_in_diff.includes("notes.txt"), false);
t("only names, never file contents, are in the output", !r.stdout.includes("John") && !r.stdout.includes("MSH"), true);

r = run("--repo", repo); // range missing
t("--repo without --range is a usage error", r.status, 1);
r = run("--range", "main...FEAT-1"); // repo missing
t("--range without --repo is a usage error", r.status, 1);
r = run("--repo", repo, "--range", "not a range");
t("a malformed range is rejected before touching git", r.status, 1);
r = run("--repo", path.join(W, "does-not-exist"), "--range", "main...FEAT-1");
t("a git failure (bad repo path) is reported, not crashed", r.status, 1);

fs.rmSync(W, { recursive: true, force: true });
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
