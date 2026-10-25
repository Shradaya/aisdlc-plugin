#!/usr/bin/env node
// Print the designer's Claude Design configuration from claude.env (identifiers only, never secrets).
// Usage: node scripts/config/design-config.js        -> JSON { system, systemUrl, source }
// Used by the design skill so the model never parses claude.env itself.
const { resolveRoot, NOT_WORKSPACE } = require("../lib/root");
const { designConfig } = require("../lib/design-config");
const ROOT = resolveRoot();
if (!ROOT) { console.error(NOT_WORKSPACE); process.exit(1); }
console.log(JSON.stringify(designConfig(ROOT), null, 2));
