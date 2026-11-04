// Environment branch names for a ticket: the branches /aisdlc-dev:promote creates when the task branch cannot merge
// cleanly into a target (lf-develop, lf-qa, lf-uat). Plugin-specific (not part of the vendored core).
//
// Settings, from config/integrations.yaml "git_hosting":
//   pr_target_branches   the target branches                          ["lf-develop", "lf-qa", "lf-uat"]
//   environments         target branch -> short environment name      { "lf-develop": "dev", "lf-qa": "qa", ... }
//                        (a target missing from the map uses its own branch name)
//   env_branch_format    how a ticket's env branch is named           "{ticket}-{env}"  (default)
// So EL-5739 promoted to lf-qa becomes EL-5739-qa.
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

module.exports = { gitHostingConfig, envName, envBranchName, envBranches, parseEnvBranch };
