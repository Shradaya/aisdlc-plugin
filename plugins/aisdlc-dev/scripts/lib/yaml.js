// Shared loader for the plugin's JSON-compatible YAML files (task-types.yaml, policies.yaml, repositories.yaml, ...).
// These files are JSON with full-line "#" comments; strip those lines, then JSON.parse. No YAML dependency.
// Factored out of the inline parsers that previously lived in root.js, aisdlc-state.js and the hooks.
const fs = require("fs");

// Strip only full-line comments (optionally indented); never touch "#" inside a JSON string value.
function stripComments(text) {
  return text.replace(/^\s*#.*$/gm, "");
}

// Parse JSON-compatible YAML text. Returns the parsed value.
function parse(text) {
  return JSON.parse(stripComments(text));
}

// Read and parse a file. Returns `fallback` (default null) on any read/parse error.
function readYaml(file, fallback = null) {
  try {
    return parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

module.exports = { stripComments, parse, readYaml };
