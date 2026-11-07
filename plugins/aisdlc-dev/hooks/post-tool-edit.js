#!/usr/bin/env node
// PostToolUse(Write|Edit|MultiEdit): after Claude edits a file in a registered repository, run that repository's
// on_edit checks (config/repositories.yaml; format in scripts/lib/on-edit.js) - formatters, linters, the related
// test - and report what fails back to Claude (exit 2: stderr goes to the model). Does nothing outside a dev
// workspace, for files outside the registered repositories, in node_modules or .git, or for repositories without
// on_edit. An internal error is reported without blocking anything (exit 1).
const fs = require("fs");
const path = require("path");

try {
  const { resolveRoot, workspaceKind } = require("../scripts/lib/root");
  const ROOT = resolveRoot();
  if (!ROOT) process.exit(0); // installed user-wide: do nothing outside an aisdlc workspace
  const KIND = workspaceKind(ROOT);
  if (KIND && KIND !== "dev") process.exit(0); // another aisdlc plugin's workspace

  let ev;
  try {
    ev = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  if (!["Write", "Edit", "MultiEdit"].includes(ev.tool_name)) process.exit(0);
  const input = ev.tool_input || {};
  if (!input.file_path) process.exit(0);
  const file = path.resolve(ev.cwd || process.cwd(), input.file_path);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) process.exit(0);
  if (/[\\/](node_modules|\.git)[\\/]/.test(file)) process.exit(0);

  const { readYaml } = require("../scripts/lib/yaml");
  const { resolveRepoPath } = require("../scripts/lib/repo-paths");
  const onEdit = require("../scripts/lib/on-edit");
  const repos =
    (
      readYaml(path.join(ROOT, "config", "repositories.yaml"), {
        repositories: {},
      }) || {}
    ).repositories || {};
  const realFile = fs.realpathSync(file);

  for (const [name, entry] of Object.entries(repos)) {
    if (!entry || entry.on_edit === undefined) continue;
    const loc = resolveRepoPath(name, entry, ROOT);
    if (!loc || !fs.existsSync(loc.path)) continue;
    const dir = fs.realpathSync(loc.path);
    const rel = path.relative(dir, realFile);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) continue;

    const errors = onEdit.validate(entry.on_edit);
    if (errors.length) {
      process.stderr.write(
        `aisdlc on_edit: config/repositories.yaml, repository '${name}': ${errors.join("; ")}. Fix it so the checks run.\n`,
      );
      process.exit(2);
    }
    const problems = onEdit.runRules(dir, rel, entry.on_edit);
    if (problems.length) {
      process.stderr.write(
        `aisdlc on_edit checks for '${name}' (${rel}):\n\n${problems.join("\n\n")}\n`,
      );
      process.exit(2);
    }
    process.exit(0);
  }
  process.exit(0);
} catch (e) {
  process.stderr.write(`aisdlc on_edit hook error: ${e && e.message}\n`);
  process.exit(1);
}
