// Commands that touch real systems, asked about before they run. Plugin-specific (not part of the vendored core);
// shared by the Claude Code hook (hooks/pre-tool-policy.js) and the Kiro mirror.
//
// config/workspace.yaml "real_systems": a list of
//   { "command": "npm run seed*", "reason": "Seeds write to the database the secret points at.", "repo": "backend" }
// `command` is a glob (`*` any characters, `?` one character) matched against the WHOLE simple command with single
// spaces between its words, after environment-variable prefixes and wrappers (env, sudo, time, nohup, exec, command)
// are removed and the program is reduced to its bare name (`/usr/bin/npm`, `npm.cmd` -> `npm`). `repo` (optional)
// limits the rule to commands run inside that registered repository (its cwd, or the target of a `cd` before it).
// A match does not block: the hook asks the developer to confirm, showing `reason`.
//
// This is a safety net for mistakes, not a sandbox: the command line is split on ; & | && || and newlines (outside
// quotes), `bash -c "..."` / `sh -c` strings and $( ) / backtick substitutions are looked into, and anything the
// splitter cannot see (eval, a script that runs the command, an alias) is not matched.
const path = require("path");

const WRAPPERS = new Set(["env", "sudo", "time", "nohup", "exec", "command"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

// Problems with a "real_systems" value, as strings; empty when it is usable.
function validate(rules) {
  if (rules === undefined) return [];
  if (!Array.isArray(rules)) return ["real_systems must be a list"];
  const errors = [];
  rules.forEach((r, i) => {
    if (!r || typeof r.command !== "string" || !r.command.trim())
      errors.push(`real_systems[${i}] needs a "command" pattern`);
    else if (typeof r.reason !== "string" || !r.reason.trim())
      errors.push(`real_systems[${i}] needs a "reason"`);
    if (r && r.repo !== undefined && typeof r.repo !== "string")
      errors.push(`real_systems[${i}].repo must be a repository name`);
  });
  return errors;
}

// Split a command line into simple commands: [{ words, text }]. `posix` enables backslash escapes (bash); for
// PowerShell/cmd a backslash is a path separator, so it is kept.
function simpleCommands(line, { posix = true } = {}) {
  const out = [];
  let words = [],
    word = "",
    has = false,
    quote = null;
  const endWord = () => {
    if (has) words.push(word);
    word = "";
    has = false;
  };
  // Redirections are not part of the command: `> out`, `2>/dev/null`, `2>&1`, `< in` (the operator may carry its
  // target or be followed by it as the next word).
  const dropRedirections = (ws) => {
    const kept = [];
    for (let k = 0; k < ws.length; k++) {
      const m = /^(\d*|&)(>>|>|<)(.*)$/.exec(ws[k]);
      if (!m) {
        kept.push(ws[k]);
        continue;
      }
      if (!m[3]) k++; // a bare operator takes the next word as its target
    }
    return kept;
  };
  const endCommand = () => {
    endWord();
    const kept = dropRedirections(words);
    if (kept.length) out.push(kept);
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) {
        quote = null;
        continue;
      }
      if (posix && quote === '"' && c === "\\" && i + 1 < line.length) {
        word += line[++i];
        continue;
      }
      word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
      continue;
    }
    if (posix && c === "\\" && i + 1 < line.length) {
      word += line[++i];
      has = true;
      continue;
    }
    if (c === "`" && !posix) {
      word += line[++i] || "";
      has = true;
      continue;
    } // PowerShell escape
    // `2>&1`, `>&2` and `&>file` are redirections, not command separators
    if (
      c === "&" &&
      (line[i - 1] === ">" || line[i - 1] === "<" || line[i + 1] === ">")
    ) {
      word += c;
      has = true;
      continue;
    }
    if (c === ";" || c === "|" || c === "&" || c === "\n" || c === "\r") {
      endCommand();
      continue;
    }
    if (c === " " || c === "\t") {
      endWord();
      continue;
    }
    word += c;
    has = true;
  }
  endCommand();
  return out;
}

// Text inside $( ... ) and `...` (one nesting level is enough for a safety net), to be checked as commands too.
function substitutions(line) {
  const found = [];
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === "$" && line[i + 1] === "(") {
      let depth = 1,
        j = i + 2;
      for (; j < line.length && depth; j++) {
        if (line[j] === "(") depth++;
        else if (line[j] === ")") depth--;
      }
      found.push(line.slice(i + 2, depth ? line.length : j - 1));
      i = j - 1;
    }
  }
  for (const m of line.matchAll(/`([^`]*)`/g)) found.push(m[1]);
  return found;
}

const bare = (w) =>
  path.basename(w.replace(/\\/g, "/")).replace(/\.(cmd|exe|bat|ps1)$/i, "");

// Drop leading VAR=value words and wrapper programs; return the words that remain (the real command).
function unwrap(words) {
  let w = words.slice();
  for (;;) {
    while (w.length && ASSIGN.test(w[0])) w.shift();
    if (w.length && WRAPPERS.has(bare(w[0]).toLowerCase())) {
      w.shift();
      continue;
    }
    break;
  }
  return w;
}

const globToRegExp = (g) =>
  new RegExp(
    "^" +
      g
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$",
  );

// Every real-system rule that `command` matches: [{ rule, command }]. opts: posix, cwd, repoOf(dir) -> repo name | null.
function check(
  command,
  rules,
  { posix = true, cwd = process.cwd(), repoOf = () => null, depth = 0 } = {},
) {
  const hits = [];
  if (!Array.isArray(rules) || !rules.length || depth > 3) return hits;
  const compiled = rules
    .filter((r) => r && typeof r.command === "string")
    .map((rule) => ({ rule, re: globToRegExp(rule.command) }));
  let here = cwd;
  for (const raw of simpleCommands(command, { posix })) {
    const words = unwrap(raw);
    if (!words.length) continue;
    const prog = bare(words[0]).toLowerCase();
    if (prog === "cd" && words[1]) {
      here = path.resolve(here, words[1]);
      continue;
    }
    if (SHELLS.has(prog)) {
      const i = words.findIndex((w, k) => k > 0 && /^-[a-z]*c$/.test(w));
      if (i > 0 && words[i + 1])
        hits.push(
          ...check(words[i + 1], rules, {
            posix,
            cwd: here,
            repoOf,
            depth: depth + 1,
          }),
        );
    }
    const line = [bare(words[0]), ...words.slice(1)].join(" ");
    const repo = repoOf(here);
    for (const { rule, re } of compiled)
      if (re.test(line) && (!rule.repo || rule.repo === repo))
        hits.push({ rule, command: line });
  }
  for (const inner of substitutions(command))
    hits.push(
      ...check(inner, rules, { posix, cwd: here, repoOf, depth: depth + 1 }),
    );
  return hits;
}

module.exports = { validate, check, simpleCommands, unwrap };
