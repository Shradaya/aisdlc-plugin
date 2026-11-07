// Tamper-evident audit logs. Canonical copy under packages/aisdlc-core/; vendored into each plugin (see scripts/sync-core.js).
//
// Every line of tasks/<TICKET>/execution-log*.jsonl carries "prev" (the hash of the line before it, or a fixed start value
// for the first line of that file) and "hash" (SHA-256 of the line without "hash" and "mac"). Changing, deleting or
// reordering any chained line breaks every hash after it, and verify() reports the first broken line.
// When the environment variable AISDLC_LOG_KEY is set, each new line also carries "mac": an HMAC-SHA256 of the same
// payload under that key, so nobody without the key can rewrite the file and recompute a valid chain.
//
// Limits, stated plainly: without the key anyone can rewrite the whole file with a fresh valid chain (git history still
// shows it); dropping lines from the very end cannot be detected from the file alone; lines written before chaining was
// introduced ("legacy") are not covered.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const genesis = (ticket, file) => sha256(`aisdlc-log:v1:${ticket}:${path.basename(file)}`);

// JSON with keys sorted at every level, so the same entry always hashes the same.
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
const payload = (entry) => { const { hash, mac, ...rest } = entry; return canonical(rest); };
const macOf = (key, entry) => crypto.createHmac("sha256", key).update(payload(entry)).digest("hex");

function lines(file) {
  try { return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()); } catch { return []; }
}

// Hash a new line must chain to: the last chained line's hash, or the start value.
function lastHash(file, ticket) {
  const all = lines(file);
  for (let i = all.length - 1; i >= 0; i--) {
    try { const e = JSON.parse(all[i]); if (e.hash) return e.hash; } catch { /* keep looking */ }
    break; // the last line is unchained or unreadable: start a new chain from the start value
  }
  return genesis(ticket, file);
}

function append(file, ticket, entry, key = process.env.AISDLC_LOG_KEY) {
  const e = { ...entry, prev: lastHash(file, ticket) };
  e.hash = sha256(payload(e));
  if (key) e.mac = macOf(key, e);
  fs.appendFileSync(file, JSON.stringify(e) + "\n");
  return e;
}

// Returns { ok, entries, legacy, unsigned, macChecked, brokenAt, reason }. brokenAt is a 1-based line number.
function verify(file, ticket, key = process.env.AISDLC_LOG_KEY) {
  const all = lines(file);
  const r = { ok: true, entries: all.length, legacy: 0, unsigned: 0, macChecked: Boolean(key), brokenAt: null, reason: null };
  const fail = (n, reason) => { r.ok = false; r.brokenAt = n; r.reason = reason; return r; };
  let prev = genesis(ticket, file), chained = false;
  for (let i = 0; i < all.length; i++) {
    let e;
    try { e = JSON.parse(all[i]); } catch { return fail(i + 1, "line is not valid JSON"); }
    if (!e.hash) {
      if (chained) return fail(i + 1, "unchained line after chained lines");
      r.legacy++;
      continue;
    }
    chained = true;
    if (e.prev !== prev) return fail(i + 1, "does not follow the previous line (a line was changed, removed or reordered)");
    if (sha256(payload(e)) !== e.hash) return fail(i + 1, "line content does not match its hash");
    if (key) {
      if (!e.mac) r.unsigned++;
      else if (macOf(key, e) !== e.mac) return fail(i + 1, "MAC does not match (wrong key or edited line)");
    }
    prev = e.hash;
  }
  return r;
}

// ---- sealing of the task state file (tasks/<TICKET>/task.<role>.yaml) ----
// The state file carries "integrity": { log_head, seal, mac? }. "seal" is a SHA-256 over the whole state (without "integrity")
// plus "log_head", the hash of the newest audit line at the time of writing. So editing the state by hand breaks the seal,
// and changing the audit log without the state (or the state without the log) leaves them out of step; either is reported.
// A state file written before sealing existed is "unsealed" and is accepted until the next update seals it.
const headOf = (file, ticket) => lastHash(file, ticket);
// True when the log already holds hash-chained lines, i.e. it was written by an engine that also seals the state file.
function hasChain(file) {
  for (const l of lines(file)) { try { if (JSON.parse(l).hash) return true; } catch { /* skip */ } }
  return false;
}

function sealOf(task, head, key = process.env.AISDLC_LOG_KEY) {
  const { integrity, ...rest } = task;
  const body = canonical(rest) + "|" + head;
  const s = { log_head: head, seal: sha256(body) };
  if (key) s.mac = crypto.createHmac("sha256", key).update(body).digest("hex");
  return s;
}

// Returns { sealed, ok, reason, macChecked }. "chained" says the audit log is hash-chained: then a state file without a seal
// can only mean the seal was stripped, which is a failure (an unsealed file is accepted only next to a legacy, unchained log).
function verifyState(task, head, key = process.env.AISDLC_LOG_KEY, chained = false) {
  const i = task && task.integrity;
  if (!i || !i.seal) return chained ? { sealed: false, ok: false, reason: "the seal was removed from the state file", macChecked: false } : { sealed: false, ok: true, reason: null, macChecked: false };
  const { integrity, ...rest } = task;
  const body = canonical(rest) + "|" + i.log_head;
  if (sha256(body) !== i.seal) return { sealed: true, ok: false, reason: "the state was edited outside aisdlc-state.js", macChecked: false };
  let macChecked = false;
  if (key && i.mac) {
    if (crypto.createHmac("sha256", key).update(body).digest("hex") !== i.mac) return { sealed: true, ok: false, reason: "the MAC does not match (wrong key, or the state was edited)", macChecked: true };
    macChecked = true;
  }
  if (i.log_head !== head) return { sealed: true, ok: false, reason: "the execution log and the state are out of step (one was changed without the other)", macChecked };
  return { sealed: true, ok: true, reason: null, macChecked };
}

function verifyStateFile(stateFile, logFile, ticket, key) {
  let task;
  try { task = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return { sealed: false, ok: false, reason: "the state file is missing or is not valid JSON", macChecked: false }; }
  return verifyState(task, headOf(logFile, ticket), key, hasChain(logFile));
}

// Re-seal a state file against the current audit log head (used right after an audit line is appended).
function resealFile(stateFile, logFile, ticket, key) {
  let task;
  try { task = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return false; }
  task.integrity = sealOf(task, headOf(logFile, ticket), key);
  const tmp = stateFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(task, null, 2) + "\n");
  fs.renameSync(tmp, stateFile);
  return true;
}

module.exports = { append, verify, genesis, canonical, headOf, hasChain, sealOf, verifyState, verifyStateFile, resealFile };
