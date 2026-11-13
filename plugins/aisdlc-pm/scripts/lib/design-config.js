// Reads the designer's Claude Design configuration from claude.env (identifiers only, never secrets).
// Canonical copy under packages/aisdlc-core/; vendored into the design plugin. See lib/root.js for why.
//
// Recognized variables (set in <workspace>/claude.env, paths/identifiers only):
//   AISDLC_DESIGN_SYSTEM        name or identifier of the Claude Design design system to author against
//   AISDLC_DESIGN_SYSTEM_URL    optional link to that design system in Claude Design
//   AISDLC_DESIGN_SOURCE        optional default authoring source: "html" | "claude-design"
// These are read the same way repository paths are (claude.env < .env < real env vars), so a real environment
// variable overrides claude.env. None of these may hold a secret; a design-system name is not a credential.
const { loadEnv } = require("./repo-paths");

// Returns { system, systemUrl, source } with nulls where unset.
function designConfig(root) {
  const env = loadEnv(root);
  return {
    system: env.AISDLC_DESIGN_SYSTEM || null,
    systemUrl: env.AISDLC_DESIGN_SYSTEM_URL || null,
    source: env.AISDLC_DESIGN_SOURCE || null,
  };
}

module.exports = { designConfig };
