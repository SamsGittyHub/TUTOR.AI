/**
 * Making extracted text safe to store.
 *
 * Postgres `text` and `jsonb` cannot hold U+0000 — the server rejects the whole
 * statement with "invalid byte sequence for encoding UTF8: 0x00". PDFs hit this
 * regularly: a text layer built from a bad font encoding, or a file produced by
 * a tool that pads strings with nulls, and the student just sees their upload
 * fail on a file that opens fine everywhere else.
 *
 * `\s` in JavaScript does not match U+0000, so the whitespace collapse that
 * every extractor already does was never going to catch it.
 *
 * Lone surrogates are the same class of problem: unpaired halves of a
 * character, unrepresentable in UTF-8, reaching us from the same badly encoded
 * documents.
 *
 * Pure functions — no DOM, no database.
 */

/** C0 controls except tab, newline and carriage return, plus DEL. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Halves of a surrogate pair with no partner. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Unicode noncharacters, which some PDF producers emit as padding. */
const NONCHARACTER = /[\uFFFE\uFFFF]/g;

/**
 * Strips what Postgres cannot store. Characters are removed rather than
 * replaced: a null in a text layer is padding, not a missing letter, and
 * substituting a placeholder would put visible junk in the student's notes.
 */
export function sanitizeText(value: string): string {
  return value
    .replace(CONTROL, "")
    .replace(LONE_SURROGATE, "")
    .replace(NONCHARACTER, "");
}

/** True when a string would be rejected by a text or jsonb column. */
export function needsSanitizing(value: string): boolean {
  // These are global regexes; lastIndex persists between .test() calls.
  CONTROL.lastIndex = 0;
  LONE_SURROGATE.lastIndex = 0;
  NONCHARACTER.lastIndex = 0;
  return (
    CONTROL.test(value) || LONE_SURROGATE.test(value) || NONCHARACTER.test(value)
  );
}

/**
 * Recursively sanitizes every string in a JSON-safe value.
 *
 * Board actions are stored as jsonb, which rejects the same characters — so a
 * lesson taught from a null-bearing PDF would fail to save even after the
 * chunks themselves were cleaned.
 */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeText(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeDeep) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[sanitizeText(key)] = sanitizeDeep(item);
    }
    return out as T;
  }
  return value;
}
