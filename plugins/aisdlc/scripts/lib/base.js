// The base branch of the shared repo (config/workspace.yaml workspace.base_branch_policy, default "main"). Work is shared
// on other branches and reaches the base branch only through a deliberate merge (a pull request), never through /aisdlc:push.
const fs = require("fs");
const path = require("path");

function baseBranch(root) {
  try {
    const text = fs
      .readFileSync(path.join(root, "config", "workspace.yaml"), "utf8")
      .replace(/^\s*#.*$/gm, "");
    const v = (JSON.parse(text).workspace || {}).base_branch_policy;
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* no config yet: the default applies */
  }
  return "main";
}

module.exports = { baseBranch };
