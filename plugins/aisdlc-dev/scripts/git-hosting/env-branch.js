#!/usr/bin/env node
// Print the environment branch names for a ticket, from config/integrations.yaml (git_hosting.environments and
// env_branch_format; see scripts/lib/env-branches.js). Read-only; the single place the names are computed, so skills
// and the commit hook always agree.
//   node env-branch.js <TICKET> [target...]      all configured targets when none are named
// Output: one JSON line { ok, ticket, branches: { "<target>": "<env branch>" } }. Exit 1 on a usage error.
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const { gitHostingConfig, envBranchName } = require("../lib/env-branches");

const [ticket, ...named] = process.argv.slice(2);
const done = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };
if (!/^[A-Z][A-Z0-9]*-\d+$/.test(ticket || "")) done({ ok: false, error: "usage: env-branch.js <TICKET> [target...]" }, 1);
const root = resolveRoot();
if (!root) done({ ok: false, error: NOT_WORKSPACE }, 2);
const cfg = gitHostingConfig(root);
const configured = cfg.pr_target_branches || [];
const targets = named.length ? named : configured;
if (!targets.length) done({ ok: false, error: "no targets: set git_hosting.pr_target_branches in config/integrations.yaml" }, 1);
const unknown = targets.filter((t) => !configured.includes(t));
if (unknown.length) done({ ok: false, error: `not a configured target branch: ${unknown.join(", ")} (git_hosting.pr_target_branches)` }, 1);
done({ ok: true, ticket, branches: Object.fromEntries(targets.map((t) => [t, envBranchName(cfg, ticket, t)])) });
