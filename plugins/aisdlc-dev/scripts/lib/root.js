// Workspace root resolution, shared by hooks and scripts across the aisdlc plugins (aisdlc-dev, aisdlc-design, aisdlc-qa).
//
// This file is the canonical copy under packages/aisdlc-core/. Each plugin vendors its own copy inside its
// own subtree (plugins/<plugin>/scripts/lib/root.js) because a plugin installed from a hosted marketplace is
// copied as its own self-contained subtree: a sibling packages/ directory is NOT present at ${CLAUDE_PLUGIN_ROOT}
// on the user's machine. Keep the vendored copies in sync via scripts/sync-core.js. Do not add plugin-specific
// logic here.
//
// The plugin is installed outside the workspace (e.g. the plugin cache), so the aisdlc workspace (the folder with
// config/repositories.yaml, tasks/, logs/, and for the design plugin designs/) is found separately:
//   1. AISDLC_ROOT (explicit; do not set it globally, it would activate the hooks in every project)
//   2. CLAUDE_PROJECT_DIR, then the current directory, or the nearest parent of either, that is an aisdlc workspace
// Returns null outside a workspace. Hooks must then do nothing; CLIs must say so and stop.
const fs = require("fs");
const path = require("path");

const isWorkspace = (dir) =>
  Boolean(dir) && fs.existsSync(path.join(dir, "config", "repositories.yaml"));

function resolveRoot() {
  if (process.env.AISDLC_ROOT)
    return path.resolve(process.env.AISDLC_ROOT.trim());
  for (const start of [process.env.CLAUDE_PROJECT_DIR, process.cwd()]) {
    // the folder itself, then its parents, so a subfolder of the workspace (web/, preview/, tasks/<ticket>/) still resolves it
    for (let dir = start && path.resolve(start); dir; ) {
      if (isWorkspace(dir)) return dir;
      const parent = path.dirname(dir);
      dir = parent === dir ? null : parent;
    }
  }
  return null;
}

const NOT_WORKSPACE =
  "Not inside an aisdlc workspace. Run from the workspace folder (it contains config/repositories.yaml) or set AISDLC_ROOT.";

// The installed plugin's root. Claude Code sets CLAUDE_PLUGIN_ROOT when it runs a hook or CLI from a plugin; each
// plugin's own root is used so that ${pluginRoot}/config resolves to that plugin's shipped defaults. When the env
// var is unset (e.g. direct test invocation), fall back to the plugin root inferred from this file's location:
// a vendored copy lives at <plugin>/scripts/lib/root.js, so the plugin root is two levels up.
function pluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT)
    return path.resolve(process.env.CLAUDE_PLUGIN_ROOT);
  return path.resolve(__dirname, "..", "..");
}

// Generic config (task-types.yaml, policies.yaml, testing-policy.yaml, schemas/) ships with the plugin in
// <pluginRoot>/config. A file of the same relative path in the workspace's config/ overrides the plugin default.
// Workspace-specific config (repositories.yaml, integrations.yaml, workspace.yaml) is read from the workspace only.
// `root` is the workspace root (from resolveRoot); `pRoot` defaults to the calling plugin's root.
function configPath(root, rel, pRoot = pluginRoot()) {
  const workspaceFile = path.join(root, "config", rel);
  return fs.existsSync(workspaceFile)
    ? workspaceFile
    : path.join(pRoot, "config", rel);
}

// Which plugin a workspace belongs to: config/workspace.yaml -> workspace.kind ("dev" | "design" | "qa"), or null
// when the file or key is absent (workspaces created before the marker existed). Hooks use it so that, when several
// aisdlc plugins are installed user-wide, each enforces its rules only in its own kind of workspace.
function workspaceKind(root) {
  try {
    const text = fs
      .readFileSync(path.join(root, "config", "workspace.yaml"), "utf8")
      .replace(/^\s*#.*$/gm, "");
    return (JSON.parse(text).workspace || {}).kind || null;
  } catch {
    return null;
  }
}

// Shared workspace: when config/workspace.yaml says kind "aisdlc", pm, design, dev and qa all work in one repository,
// so each role keeps its own task state next to the shared ticket documents. Each plugin declares its role in
// scripts/lib/role.js (module.exports = "dev"). In a standalone role workspace the file names are unchanged.
let ROLE = null;
try {
  ROLE = require("./role");
} catch {
  ROLE = null;
}
const isShared = (root) => workspaceKind(root) === "aisdlc";
const suffix = (root) => (isShared(root) && ROLE ? "." + ROLE : "");
// Files of one ticket's task: state (task.yaml / task.<role>.yaml), audit log, lock.
const taskNames = (root) => ({
  state: `task${suffix(root)}.yaml`,
  log: `execution-log${suffix(root)}.jsonl`,
  lock: `.lock${suffix(root)}`,
});
const taskDirOf = (root, ticket) => path.join(root, "tasks", ticket);
const taskFileOf = (root, ticket) =>
  path.join(taskDirOf(root, ticket), taskNames(root).state);
// Matches any role's state file name in a path (task.yaml, task.pm.yaml, ...), for hook protection rules.
const TASK_STATE_RE = /\/tasks\/[^/]+\/task(\.[a-z]+)?\.yaml$/;

module.exports = {
  resolveRoot,
  isWorkspace,
  configPath,
  workspaceKind,
  NOT_WORKSPACE,
  pluginRoot,
  get PLUGIN_ROOT() {
    return pluginRoot();
  },
  isShared,
  taskNames,
  taskDirOf,
  taskFileOf,
  TASK_STATE_RE,
  ROLE,
};
