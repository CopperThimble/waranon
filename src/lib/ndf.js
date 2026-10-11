// Text-level helpers for patching NDF files without a full parser.
// Everything here works on the raw file text so untouched content is preserved byte-for-byte.

const OPEN = new Set(["(", "[", "{"]);
const CLOSE = new Set([")", "]", "}"]);

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Index of the bracket closing the one at `openIdx`, skipping strings and // comments. */
export function matchClose(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const j = text.indexOf(c, i + 1);
      if (j < 0) return -1;
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      const j = text.indexOf("\n", i);
      if (j < 0) return -1;
      i = j;
    } else if (OPEN.has(c)) {
      depth++;
    } else if (CLOSE.has(c)) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Span of a top-level `[export] NAME is ...(...)` declaration, or null. */
export function findTopLevelBlock(text, name) {
  const re = new RegExp(`^(?:export\\s+)?${escapeRegExp(name)}\\s+is\\b`, "m");
  const m = re.exec(text);
  if (!m) return null;
  const open = text.slice(m.index).search(/[([]/);
  if (open < 0) return null;
  const end = matchClose(text, m.index + open);
  if (end < 0) return null;
  return { start: m.index, end: end + 1 };
}

export function hasTopLevelName(text, name) {
  return new RegExp(`^(?:export\\s+)?${escapeRegExp(name)}\\s+is\\b`, "m").test(text);
}

/** Span of the first `TypeName(...)` object inside `text`. */
export function findObjectSpan(text, typeName) {
  const re = new RegExp(`\\b${escapeRegExp(typeName)}\\s*\\(`);
  const m = re.exec(text);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  const end = matchClose(text, open);
  return end < 0 ? null : { start: m.index, end: end + 1 };
}

/** Replace the numeric value of `Field = <num>` inside the object `TypeName(...)`. */
export function setNumberInObject(text, typeName, field, value) {
  const span = findObjectSpan(text, typeName);
  if (!span) return { text, ok: false };
  const inner = text.slice(span.start, span.end);
  const re = new RegExp(`(\\b${escapeRegExp(field)}\\s*=\\s*)(-?\\d+(?:\\.\\d*)?)`);
  if (!re.test(inner)) return { text, ok: false };
  const patched = inner.replace(re, (_, pre, old) => pre + formatLike(old, value));
  return { text: text.slice(0, span.start) + patched + text.slice(span.end), ok: true };
}

/** Replace the first numeric capture of `regex` (which must have groups: prefix, number). */
export function setNumberByRegex(text, regex, value) {
  if (!regex.test(text)) return { text, ok: false };
  return { text: text.replace(regex, (_, pre, old) => pre + formatLike(old, value)), ok: true };
}

/**
 * Keep NDF's int/float style where possible: float fields keep a decimal point; whole values
 * in int-styled fields stay ints. A fractional value is never rounded away (vanilla writes some
 * float fields as plain ints, e.g. `AngleRotationBase = 0`); validation keeps count fields whole.
 */
export function formatLike(original, value) {
  const n = Math.round(Number(value) * 10000) / 10000;
  if (String(original).includes(".") || !Number.isInteger(n)) {
    const s = String(n);
    return s.includes(".") ? s : `${s}.0`;
  }
  return String(n);
}

/**
 * Insert `entryText` as the last element of the first `[...]` list that follows
 * `header` (a string or RegExp). Adds a separating comma if the previous element lacks one.
 */
export function appendToList(text, header, entryText) {
  const idx = typeof header === "string" ? text.indexOf(header) : text.search(header);
  if (idx < 0) throw new Error(`Section not found: ${header}`);
  const open = text.indexOf("[", idx);
  const close = matchClose(text, open);
  if (open < 0 || close < 0) throw new Error(`Malformed list after: ${header}`);

  const lineStart = text.lastIndexOf("\n", close) + 1;
  const closeOnOwnLine = lineStart > open && /^[ \t]*$/.test(text.slice(lineStart, close));
  const insertAt = closeOnOwnLine ? lineStart : close;
  let before = text.slice(0, insertAt);

  const lastChar = before.replace(/\s+$/, "").replace(/\/\/[^\n]*$/, "").trimEnd().slice(-1);
  if (lastChar && lastChar !== "," && lastChar !== "[") {
    const trimmed = before.replace(/\s+$/, "");
    before = `${trimmed},${before.slice(trimmed.length)}`;
  }
  const sep = closeOnOwnLine ? "" : "\n";
  return `${before}${sep}${entryText}\n${text.slice(insertAt)}`;
}

/** Highest number N in `(Something, N)` pairs inside the list after `header`. */
export function maxPairNumber(text, header) {
  const idx = text.indexOf(header);
  if (idx < 0) return 0;
  const open = text.indexOf("[", idx);
  const close = matchClose(text, open);
  let max = 0;
  for (const m of text.slice(open, close).matchAll(/,\s*(\d+)\s*\)/g)) {
    max = Math.max(max, Number(m[1]));
  }
  return max;
}

// ── Idempotent regions ───────────────────────────────────────────────────────
// Everything Waranon writes into an existing file is fenced with marker comments,
// so re-exporting first strips the previous output instead of duplicating it.

export function regionStart(pid) {
  return `// >>> waranon:${pid} (generated by Waranon - re-export replaces this block)`;
}
export function regionEnd(pid) {
  return `// <<< waranon:${pid}`;
}

export function wrapRegion(pid, body) {
  return `${regionStart(pid)}\n${body}\n${regionEnd(pid)}`;
}

export function stripRegions(text, pid) {
  const re = new RegExp(
    `[ \\t]*// >>> waranon:${escapeRegExp(pid)}\\b[\\s\\S]*?// <<< waranon:${escapeRegExp(pid)}[^\\n]*\\n?`,
    "g",
  );
  return text.replace(re, "");
}

// ── Line endings ─────────────────────────────────────────────────────────────

export function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}
export function toLf(text) {
  return text.replace(/\r\n/g, "\n");
}
export function fromLf(text, eol) {
  return eol === "\n" ? text : text.replace(/\n/g, eol);
}

/** Run `fn` on an LF-normalised copy of `text` and restore the original line endings. */
export function patchText(text, fn) {
  const eol = detectEol(text);
  return fromLf(fn(toLf(text)), eol);
}

// ── Localisation CSV ("TOKEN";"REFTEXT") ─────────────────────────────────────

export function csvEscape(value) {
  return String(value ?? "").replace(/"/g, "''").replace(/[\r\n;]+/g, " ").trim();
}

/** Upsert token rows into a localisation CSV, keeping everything else untouched. */
export function upsertCsvRows(text, rows) {
  const source = text && text.trim() ? toLf(text) : '"TOKEN";"REFTEXT"\n';
  const tokens = new Set(rows.map((r) => r.token));
  const kept = source
    .split("\n")
    .filter((line) => {
      const m = /^"([^"]*)";/.exec(line);
      return !(m && tokens.has(m[1]));
    })
    .filter((line, i, all) => line !== "" || i < all.length - 1);
  const added = rows.map((r) => `"${r.token}";"${csvEscape(r.text)}"`);
  const eol = text ? detectEol(text) : "\r\n";
  return fromLf([...kept, ...added].join("\n") + "\n", eol);
}
