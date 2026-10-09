// Workspace root resolution, shared by hooks and scripts.
// The plugin code may run from a plugin cache copy, so the workspace (config/, tasks/, repositories/, logs/) is found separately:
//   1. AISDLC_ROOT (explicit)
//   2. CLAUDE_PROJECT_DIR, then the current directory, when it is an aisdlc workspace (has config/repositories.yaml)
//   3. the plugin's own directory (running the repository itself, e.g. `claude --plugin-dir .`)
const fs = require("fs");
const path = require("path");

const isWorkspace = (dir) => Boolean(dir) && fs.existsSync(path.join(dir, "config", "repositories.yaml"));

function resolveRoot(pluginRoot) {
  if (process.env.AISDLC_ROOT) return process.env.AISDLC_ROOT;
  for (const dir of [process.env.CLAUDE_PROJECT_DIR, process.cwd()]) if (isWorkspace(dir)) return path.resolve(dir);
  return pluginRoot;
}

module.exports = { resolveRoot, isWorkspace };
