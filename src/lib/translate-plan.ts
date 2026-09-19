/**
 * Splitting the interface up before translating it.
 *
 * It used to go in one request: 308 strings, 18KB of JSON, no token ceiling
 * and no deadline. That survives French, where the output is about as long as
 * the input. It does not survive Russian or Chinese, where the same dictionary
 * comes back two or three times larger in tokens — the reply runs past the
 * model's output limit and is cut off mid-object.
 *
 * The part that made it permanent rather than flaky: a truncated reply that
 * still happens to parse yields a handful of translated keys, the rest fall
 * back to English, and that mostly-English dictionary is then cached against
 * the source hash and served to everyone for good. Nothing retries it, because
 * as far as the cache is concerned the language is done.
 *
 * So: small batches, each independently bounded, and a floor on how much has
 * to come back before the result is allowed anywhere near the cache.
 */

export interface Dict {
  [key: string]: string;
}

/**
 * Keys per request.
 *
 * Fifty keys is roughly 3KB of English in and, at the worst expansion we've
 * seen, under 4000 tokens back — comfortably inside any output limit, and
 * small enough that one bad batch costs a batch rather than a language.
 */
export const CHUNK_SIZE = 50;

/**
 * How much of the dictionary must actually come back translated.
 *
 * Below this the result is thrown away rather than cached, so the next student
 * who picks the language triggers a fresh attempt instead of inheriting a
 * failure forever. It isn't 100% because a translator legitimately leaves some
 * values alone — "OK" and "PDF" are "OK" and "PDF" in a lot of languages.
 */
export const MIN_COVERAGE = 0.7;

/** The dictionary in batches, in a stable order. */
export function chunkDictionary(strings: Dict, size = CHUNK_SIZE): Dict[] {
  const keys = Object.keys(strings);
  const out: Dict[] = [];
  for (let i = 0; i < keys.length; i += size) {
    const chunk: Dict = {};
    for (const key of keys.slice(i, i + size)) chunk[key] = strings[key];
    out.push(chunk);
  }
  return out;
}

export interface Merged {
  dict: Dict;
  /** Keys that came back as something other than the English. */
  translated: number;
  /** translated / total, 0–1. */
  coverage: number;
}

/**
 * One dictionary from many replies, with English filling any gap.
 *
 * Coverage counts keys that actually changed, not keys that are present: a
 * model that echoes the English back is the failure this is here to catch,
 * and it returns a complete, perfectly-shaped, entirely useless object.
 */
export function mergeTranslation(strings: Dict, parts: (Dict | null)[]): Merged {
  const from: Dict = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [key, value] of Object.entries(part)) {
      if (typeof value === "string" && value.trim()) from[key] = value;
    }
  }

  const dict: Dict = {};
  let translated = 0;
  const keys = Object.keys(strings);
  for (const key of keys) {
    const value = from[key];
    if (value && value !== strings[key]) {
      dict[key] = value;
      translated += 1;
    } else {
      dict[key] = strings[key];
    }
  }
  return { dict, translated, coverage: keys.length ? translated / keys.length : 0 };
}

/** Whether a merge is good enough to keep. */
export function worthCaching(merged: Merged): boolean {
  return merged.coverage >= MIN_COVERAGE;
}
