// Environment branch names for a ticket: the branches /aisdlc-dev:promote creates when the task branch cannot merge
// cleanly into a target (lf-develop, lf-qa, lf-uat). Plugin-specific (not part of the vendored core).
//
// Settings, from config/integrations.yaml "git_hosting":
//   pr_target_branches   the target branches                          ["lf-develop", "lf-qa", "lf-uat"]
//   environments         target branch -> short environment name      { "lf-develop": "dev", "lf-qa": "qa", ... }
//                        (a target missing from the map uses its own branch name)
//   env_branch_format    how a ticket's env branch is named           "{ticket}-{env}"  (default)
// So EL-5739 promoted to lf-qa becomes EL-5739-qa.
//
// The same module names the post-release sync branches (/aisdlc-dev:sync-main), which are not tied to a ticket:
//   sync_branch_format   "{base}-{env}-{date}"   {base} = the base branch (workspace.yaml git.base_branch, "main"),
//                        {date} = YYYYMMDD. So main synced into lf-qa on 2026-11-05 uses main-qa-20261105.
const path = require("path");
const { readYaml } = require("./yaml");

const TICKET = "[A-Z][A-Z0-9]*-\\d+";
const DEFAULT_FORMAT = "{ticket}-{env}";

function gitHostingConfig(root) {
  const cfg = (root && readYaml(path.join(root, "config", "integrations.yaml"), {})) || {};
  return cfg.git_hosting || {};
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function envName(cfg, target) {
  return String((cfg.environments || {})[target] || target);
}

// The env branch for a ticket promoted to `target`.
function envBranchName(cfg, ticket, target) {
  const fmt = String(cfg.env_branch_format || DEFAULT_FORMAT);
  return fmt.split("{ticket}").join(ticket).split("{env}").join(envName(cfg, target));
}

// [{ target, branch }] for every configured target.
function envBranches(cfg, ticket) {
  return (cfg.pr_target_branches || []).map((target) => ({ target, branch: envBranchName(cfg, ticket, target) }));
}

// If `branch` is a ticket's env branch, { ticket, target }; otherwise null.
function parseEnvBranch(cfg, branch) {
  const fmt = String(cfg.env_branch_format || DEFAULT_FORMAT);
  for (const target of cfg.pr_target_branches || []) {
    const re = new RegExp(
      "^" + escapeRe(fmt).replace(escapeRe("{ticket}"), `(${TICKET})`).replace(escapeRe("{env}"), escapeRe(envName(cfg, target))) + "$"
    );
    const m = re.exec(branch);
    if (m) return { ticket: m[1], target };
  }
  return null;
}

const DEFAULT_SYNC_FORMAT = "{base}-{env}-{date}";

// The base branch of the workspace's repositories (config/workspace.yaml git.base_branch), "main" when unset.
function baseBranch(root) {
  const ws = (root && readYaml(path.join(root, "config", "workspace.yaml"), {})) || {};
  return String((ws.git || {}).base_branch || "main");
}

// The sync branch that brings `base` into `target` on `date` (YYYYMMDD).
function syncBranchName(cfg, base, target, date) {
  const fmt = String(cfg.sync_branch_format || DEFAULT_SYNC_FORMAT);
  return fmt.split("{base}").join(base).split("{env}").join(envName(cfg, target)).split("{date}").join(date);
}

// If `branch` is a sync branch for `base`, { target }; otherwise null.
function parseSyncBranch(cfg, base, branch) {
  const fmt = String(cfg.sync_branch_format || DEFAULT_SYNC_FORMAT);
  for (const target of cfg.pr_target_branches || []) {
    const re = new RegExp(
      "^" + escapeRe(fmt).replace(escapeRe("{base}"), escapeRe(base)).replace(escapeRe("{env}"), escapeRe(envName(cfg, target))).replace(escapeRe("{date}"), "\\d{8}") + "$"
    );
    if (re.test(branch)) return { target };
  }
  return null;
}

module.exports = { gitHostingConfig, envName, envBranchName, envBranches, parseEnvBranch, baseBranch, syncBranchName, parseSyncBranch };
