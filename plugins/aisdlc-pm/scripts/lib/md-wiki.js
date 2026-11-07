// Markdown -> Jira wiki markup converter (pm plugin only; NOT vendored). Design section 5.2.
//
//   toWiki(markdown, { headings: "demote" | "bold" }) -> string
//
// Supports the small markdown subset the PM templates and skills produce; anything unrecognised passes through as
// plain text. Pure function: no filesystem, no network, no globals. CRLF is normalised to LF.
//
// Headings:   # .. ######  ->  "demote": h4./h5. (levels 1..6 clamp to 4 or 5); "bold": a bold line "*text*".
// Bullets:    - / * / +     ->  "*", nested by two-space indent ("**", "***", ...).
// Ordered:    "1. "         ->  "#", nested "##", ...
// Inline:     **x**/__x__ -> *x*;  *x*/_x_ -> _x_;  `x` -> {{x}};  [t](u) -> [t|u].
// Blockquote: "> q"         ->  "bq. q".     Rule: "---"/"***"/"___" -> "----".
// Fenced code:```lang       ->  {code:lang} ... {code} (content untouched, no escaping inside).
// Tables:     | a | b |     ->  "||a||b||" (header row) then "|a|b|" (body); the --- separator row is dropped.
//
// Brace safety: outside code spans/blocks, "{" and "}" are escaped to "\{" "\}" so user text cannot open a Jira macro
// ({panel}, {html}, {noformat}). AC-part safety: any converted line that would be parsed as the start of an
// "Acceptance Criteria" section by lib/jira.js's acFromDescription (AC_START_RE below), or that would start with a
// wiki heading/blockquote marker, is prefixed with "Note: " so it renders as literal text and cannot end/retarget the
// AC section. The same neutralisation is applied to Requirements-part lines that match AC_START_RE.

// The start rule acFromDescription uses to find the "Acceptance Criteria" heading (case-insensitive, line-anchored).
// Exported so the tests reuse exactly this regex. Mirrors lib/jira.js.
const AC_START_RE =
  /^\s*(h[1-6]\.\s*|#{1,6}\s*|\*+|_+)?\s*acceptance\s+criteria\b/i;

// A line that, after conversion, begins with a wiki structural marker the AC parser treats as a heading boundary.
const WIKI_MARKER_RE = /^\s*(h[1-6]\.|bq\.)\s/;

// Inline conversions applied to text that is NOT inside a code span. Code spans are extracted first (placeholders)
// so their contents are never touched by brace-escaping or emphasis rules.
function inline(text) {
  const spans = [];
  const stash = (s) => {
    spans.push(s);
    return "\u0000" + (spans.length - 1) + "\u0000";
  };
  // `code` -> {{code}} (stashed so later escaping/emphasis never touches it).
  let s = text.replace(/`([^`]+)`/g, (_m, code) => stash("{{" + code + "}}"));
  // Escape braces in the remaining (non-code) text so user text cannot open a Jira macro.
  s = s.replace(/[{}]/g, (c) => "\\" + c);
  // Links [t](u) -> [t|u].
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, t, u) => "[" + t + "|" + u + "]",
  );
  // Bold **x** / __x__ -> *x*; stash the result so the italic pass below cannot re-match the single markers.
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, x) => stash("*" + x + "*"));
  s = s.replace(/__([^_]+)__/g, (_m, x) => stash("*" + x + "*"));
  // Italic *x* / _x_ -> _x_.
  s = s.replace(
    /(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g,
    (_m, pre, x) => pre + "_" + x + "_",
  );
  s = s.replace(
    /(^|[^_\w])_([^_\s][^_]*?)_(?!_)/g,
    (_m, pre, x) => pre + "_" + x + "_",
  );
  // Restore stashed spans.
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => spans[Number(i)]);
  return s;
}

function headingLine(level, text, mode) {
  const rendered = inline(text);
  if (mode === "bold") return "*" + rendered + "*";
  // demote: clamp 1..6 to 4 or 5 (levels 1-2 -> h4, 3+ -> h5), per design 5.2.
  const h = level <= 2 ? 4 : 5;
  return "h" + h + ". " + rendered;
}

// Neutralise a converted line by prefixing "Note: " so acFromDescription cannot start/end the AC section on it and no
// stray wiki marker is honoured. In "demote" (Requirements) mode only the AC-start collision matters; legitimate
// demoted headings (h4./h5.) are left alone. In "bold" (AC) mode a line that begins with a wiki heading/blockquote
// marker is also neutralised (the script's own AC headings are bold "*text*", which never match these).
function neutralise(line, mode) {
  if (AC_START_RE.test(line)) return "Note: " + line;
  if (mode === "bold" && WIKI_MARKER_RE.test(line)) return "Note: " + line;
  return line;
}

function toWiki(markdown, opts = {}) {
  const mode = opts.headings === "bold" ? "bold" : "demote";
  const src = String(markdown == null ? "" : markdown)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = src.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: content is emitted verbatim (no inline, no escaping).
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      const lang = fence[1].trim();
      out.push(lang ? "{code:" + lang + "}" : "{code}");
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        out.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip the closing fence
      out.push("{code}");
      continue;
    }

    // Table: a run of lines that all look like "| ... |" (or "a | b"). The |---|---| separator row is dropped.
    if (/\|/.test(line) && /^\s*\|?.*\|.*$/.test(line) && isTableRow(line)) {
      const block = [];
      while (i < lines.length && isTableRow(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      emitTable(block, out);
      continue;
    }

    // ATX heading.
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      out.push(
        maybeNeutralise(headingLine(h[1].length, h[2].trim(), mode), mode),
      );
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      out.push("----");
      i++;
      continue;
    }

    // Blockquote.
    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      out.push("bq. " + inline(bq[1]));
      i++;
      continue;
    }

    // Unordered list (indent -> nesting depth by two spaces).
    const ul = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (ul) {
      const depth = Math.floor(ul[1].replace(/\t/g, "  ").length / 2) + 1;
      out.push(maybeNeutralise("*".repeat(depth) + " " + inline(ul[3]), mode));
      i++;
      continue;
    }

    // Ordered list.
    const ol = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ol) {
      const depth = Math.floor(ol[1].replace(/\t/g, "  ").length / 2) + 1;
      out.push(maybeNeutralise("#".repeat(depth) + " " + inline(ol[2]), mode));
      i++;
      continue;
    }

    // Plain line (including blank lines).
    if (line.trim() === "") {
      out.push("");
      i++;
      continue;
    }
    out.push(maybeNeutralise(inline(line), mode));
    i++;
  }
  return out.join("\n");
}

// In "bold" mode (the AC part) a converted line that looks like an AC-section start or a stray wiki marker is
// neutralised. In "demote" mode (the Requirements part) the same neutralisation protects against a requirements line
// such as "* Acceptance criteria are listed below" becoming the section start.
function maybeNeutralise(rendered, mode) {
  return neutralise(rendered, mode);
}

function isTableRow(line) {
  if (!/\|/.test(line)) return false;
  const trimmed = line.trim();
  // A separator row |---|:--:|---| counts as part of the table.
  if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(trimmed)) return true;
  // A normal row has at least one pipe that is not at the very start/end only (be permissive).
  return /\|/.test(trimmed);
}

function splitCells(line) {
  let t = line.trim();
  t = t.replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

function emitTable(block, out) {
  let headerDone = false;
  for (const row of block) {
    const trimmed = row.trim();
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(trimmed)) continue; // separator row
    const cells = splitCells(row).map((c) => inline(c));
    if (!headerDone) {
      out.push("||" + cells.join("||") + "||");
      headerDone = true;
    } else {
      out.push("|" + cells.join("|") + "|");
    }
  }
}

module.exports = { toWiki, AC_START_RE };
