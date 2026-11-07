// Per-repository checks that run right after Claude edits a file (hooks/post-tool-edit.js). Plugin-specific (not part
// of the vendored core).
//
// config/repositories.yaml, per repository:
//   "on_edit": [
//     { "files": "*.js,*.ts", "run": "node_modules/.bin/prettier --write {file}", "fix": true },
//     { "files": "*.js,*.ts", "run": "node_modules/.bin/eslint --quiet {file}" },
//     { "files": "src/*.js",  "run": "node_modules/.bin/mocha {test}", "test": "test/{name}.spec.js", "timeout": 120 }
//   ]
// files    comma-separated globs (`*` any characters, `?` one), matched against the file's path in the repository
//          and against its bare name; default "*"
// run      the command, run in the repository folder WITHOUT a shell (split on spaces, quotes group); in each word
//          {file} is the absolute path, {rel} the path in the repository, {name} the name without extension,
//          {dir} its folder in the repository, {test} the `test` template filled in
// fix      true for a formatter: it runs, its exit code and output are ignored
// test     a path template; the rule runs only when that file exists (a related test)
// timeout  seconds the command may take (default 60, at most 170)
// A repository-relative program that is not there (node_modules not installed yet) skips the rule. Any other failure
// of a non-fix rule is reported back to Claude.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_TIMEOUT = 60,
  MAX_TIMEOUT = 170,
  TAIL_LINES = 40,
  TAIL_CHARS = 4000;

// Problems with a repository's "on_edit" value, as strings; empty when it is usable.
function validate(rules) {
  if (rules === undefined) return [];
  if (!Array.isArray(rules)) return ["on_edit must be a list"];
  const errors = [];
  rules.forEach((r, i) => {
    if (!r || typeof r !== "object" || Array.isArray(r))
      return errors.push(`on_edit[${i}] must be an object`);
    if (typeof r.run !== "string" || !r.run.trim())
      errors.push(`on_edit[${i}] needs a "run" command`);
    if (r.files !== undefined && typeof r.files !== "string")
      errors.push(
        `on_edit[${i}].files must be a string of comma-separated globs`,
      );
    if (r.fix !== undefined && typeof r.fix !== "boolean")
      errors.push(`on_edit[${i}].fix must be true or false`);
    if (r.test !== undefined && typeof r.test !== "string")
      errors.push(`on_edit[${i}].test must be a path template`);
    if (
      r.timeout !== undefined &&
      !(Number.isFinite(r.timeout) && r.timeout > 0)
    )
      errors.push(`on_edit[${i}].timeout must be a number of seconds`);
  });
  return errors;
}

const globRe = (g) =>
  new RegExp(
    "^" +
      g
        .trim()
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$",
  );
function matches(rel, files = "*") {
  const posix = rel.split(path.sep).join("/");
  return String(files)
    .split(",")
    .filter((g) => g.trim())
    .some(
      (g) =>
        globRe(g).test(posix) || globRe(g).test(path.posix.basename(posix)),
    );
}

// Split `run` into words: whitespace separates, single or double quotes group (no escapes).
function tokenize(run) {
  const words = [];
  let word = "",
    has = false,
    quote = null;
  for (const c of run) {
    if (quote) {
      if (c === quote) quote = null;
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (has) {
        words.push(word);
        word = "";
        has = false;
      }
      continue;
    }
    word += c;
    has = true;
  }
  if (has) words.push(word);
  return words;
}

const fill = (tpl, values) =>
  tpl.replace(/\{(file|rel|name|dir|test)\}/g, (m, k) =>
    values[k] !== undefined ? values[k] : m,
  );

const isExecutable = (p) => {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

// On Windows a program may be a .cmd/.bat shim (npx, node_modules/.bin/eslint.cmd); those must go through cmd.exe.
const WIN_FORBIDDEN = /["%!^&|<>\r\n]/;
function cmdLine(program, args) {
  for (const a of args)
    if (WIN_FORBIDDEN.test(a))
      throw new Error(
        `argument ${JSON.stringify(a)} contains a character that cannot be passed safely through cmd.exe`,
      );
  return [program, ...args].map((a) => `"${a}"`).join(" ");
}
function winProgram(program, repoDir, env = process.env) {
  const exts = ["", ".cmd", ".exe", ".bat"];
  const dirs = /[\\/]/.test(program)
    ? [path.isAbsolute(program) ? "" : repoDir]
    : (env.PATH || env.Path || "").split(";").filter(Boolean);
  for (const d of dirs)
    for (const e of exts) {
      const full = d ? path.join(d, program + e) : program + e;
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    }
  return null;
}

// Plan one rule for one edited file: { skip: reason } or { program, args, timeout, fix }.
function plan(rule, repoDir, rel, { platform = process.platform } = {}) {
  const posix = rel.split(path.sep).join("/");
  const values = {
    file: path.join(repoDir, rel),
    rel: posix,
    name: path.basename(rel, path.extname(rel)),
    dir: path.posix.dirname(posix),
  };
  if (rule.test) {
    values.test = fill(rule.test, values);
    if (!fs.existsSync(path.join(repoDir, values.test)))
      return { skip: `no test at ${values.test}` };
  }
  const words = tokenize(rule.run).map((w) => fill(w, values));
  if (!words.length) return { skip: "empty command" };
  let program = words[0];
  const relative = /[\\/]/.test(program) && !path.isAbsolute(program);
  if (relative) {
    const full = path.join(repoDir, program);
    if (platform === "win32") {
      const w = winProgram(program, repoDir);
      if (!w) return { skip: `${program} is not installed` };
      program = w;
    } else if (!isExecutable(full))
      return { skip: `${program} is not installed` };
    else program = full;
  } else if (platform === "win32") {
    const w = winProgram(program, repoDir);
    if (w) program = w;
  }
  return {
    program,
    args: words.slice(1),
    timeout: Math.min(rule.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT) * 1000,
    fix: Boolean(rule.fix),
  };
}

const tail = (text) =>
  text.trim().split("\n").slice(-TAIL_LINES).join("\n").slice(-TAIL_CHARS);

// Run every matching rule for the edited file `rel` of `repoDir`. Returns the problems to report (strings); a
// formatter ("fix") never reports. opts.platform exists for tests.
function runRules(repoDir, rel, rules, opts = {}) {
  const platform = opts.platform || process.platform;
  const problems = [];
  for (const rule of rules) {
    if (!matches(rel, rule.files)) continue;
    const p = plan(rule, repoDir, rel, { platform });
    if (p.skip) continue;
    let res;
    try {
      const isShim = platform === "win32" && /\.(cmd|bat)$/i.test(p.program);
      res = isShim
        ? spawnSync(
            process.env.ComSpec || "cmd.exe",
            ["/d", "/s", "/c", `"${cmdLine(p.program, p.args)}"`],
            {
              cwd: repoDir,
              encoding: "utf8",
              timeout: p.timeout,
              maxBuffer: 16 * 1024 * 1024,
              windowsHide: true,
              windowsVerbatimArguments: true,
            },
          )
        : spawnSync(p.program, p.args, {
            cwd: repoDir,
            encoding: "utf8",
            timeout: p.timeout,
            maxBuffer: 16 * 1024 * 1024,
            windowsHide: true,
          });
    } catch (e) {
      if (!p.fix)
        problems.push(
          `\`${rule.run}\` could not run after editing ${rel}: ${e.message}`,
        );
      continue;
    }
    if (p.fix) continue;
    const shown = [path.basename(p.program), ...p.args].join(" ");
    if (res.error && res.error.code === "ETIMEDOUT")
      problems.push(
        `\`${shown}\` timed out after ${p.timeout / 1000}s after editing ${rel}`,
      );
    else if (res.error)
      problems.push(
        `\`${shown}\` could not run after editing ${rel}: ${res.error.code === "ENOENT" ? `${path.basename(p.program)} is not installed or not on PATH` : res.error.message}`,
      );
    else if (res.status !== 0)
      problems.push(
        `\`${shown}\` failed after editing ${rel}:\n${tail((res.stdout || "") + (res.stderr || ""))}`,
      );
  }
  return problems;
}

module.exports = {
  validate,
  matches,
  tokenize,
  plan,
  runRules,
  cmdLine,
  winProgram,
};
