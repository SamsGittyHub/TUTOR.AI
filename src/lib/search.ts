/**
 * Finding your own notes again.
 *
 * The tutor has had semantic retrieval over uploaded material since early on,
 * but the student never did — someone with forty files and a term of lessons
 * had no way to answer "where did we do titration?" except by opening things.
 *
 * The matching itself is Postgres's job; what lives here is the part that
 * decides what a result *looks* like, which is where the fiddly cases are: a
 * match 4,000 characters into a lecture transcript has to be shown in context,
 * and a window cut blindly around it starts and ends mid-word.
 *
 * Pure and dependency-free, so all of that is testable without a database.
 */

export const EXCERPT_CHARS = 220;

/** The words worth matching on, from whatever the student typed. */
export function searchTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((word) => word.length > 1),
    ),
  ];
}

/**
 * A readable window of `text` around the first term that appears in it.
 *
 * Trimmed to word boundaries and marked with ellipses on whichever side was
 * actually cut, so a result never reads as though the note itself begins
 * mid-sentence.
 */
export function excerpt(
  text: string,
  query: string,
  max: number = EXCERPT_CHARS,
): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  const lower = clean.toLowerCase();
  let at = -1;
  for (const term of searchTerms(query)) {
    const found = lower.indexOf(term);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }

  // No term in the body — the match was in a title or the query was stripped
  // away entirely. The opening is as good a window as any.
  if (at === -1) return `${cutAtWord(clean, max)}…`;

  const half = Math.floor(max / 2);
  let start = Math.max(0, at - half);
  let end = Math.min(clean.length, start + max);
  start = Math.max(0, end - max);

  // Don't start or finish mid-word.
  if (start > 0) {
    const space = clean.indexOf(" ", start);
    if (space !== -1 && space < start + 24) start = space + 1;
  }
  if (end < clean.length) {
    const space = clean.lastIndexOf(" ", end);
    if (space > start + max - 24) end = space;
  }

  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${
    end < clean.length ? "…" : ""
  }`;
}

function cutAtWord(text: string, max: number): string {
  const slice = text.slice(0, max);
  const space = slice.lastIndexOf(" ");
  return (space > max - 24 ? slice.slice(0, space) : slice).trim();
}

/**
 * Splits a string into matched and unmatched runs, for highlighting.
 *
 * Returned as data rather than as markup so the renderer decides how a hit
 * looks, and so this can be checked without a DOM.
 */
export function splitOnTerms(
  text: string,
  query: string,
): { text: string; hit: boolean }[] {
  const terms = searchTerms(query).filter((t) => t.length > 1);
  if (!terms.length) return [{ text, hit: false }];

  const lower = text.toLowerCase();
  const marks: boolean[] = new Array(text.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(term, from);
      if (at === -1) break;
      for (let i = at; i < at + term.length; i += 1) marks[i] = true;
      from = at + term.length;
    }
  }

  const runs: { text: string; hit: boolean }[] = [];
  let index = 0;
  while (index < text.length) {
    const hit = marks[index];
    let end = index;
    while (end < text.length && marks[end] === hit) end += 1;
    runs.push({ text: text.slice(index, end), hit });
    index = end;
  }
  return runs;
}
