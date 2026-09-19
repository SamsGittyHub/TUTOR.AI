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
 * How much English goes in one request, in characters.
 *
 * Packed by size rather than by key count, because the strings are nothing
 * like uniform: fifty keys of navigation labels is 2.4KB and fifty keys of
 * help text is 5.1KB, and since the batches run in parallel a wave takes as
 * long as its largest member. Splitting by count produced one batch twice the
 * size of the rest — which set the wall-clock time for everybody — and a last
 * batch of 235 characters that cost a whole round trip to say almost nothing.
 *
 * Smaller is faster up to a point: a model generates a reply serially, so
 * halving the output halves the time, and the batches don't wait on each
 * other. The floor is the per-request overhead, which is why this isn't 200.
 */
export const BATCH_CHARS = 1900;

/** A ceiling as well, so a batch of very short labels stays answerable. */
export const MAX_BATCH_KEYS = 40;

/**
 * How much of the dictionary must actually come back translated.
 *
 * Below this the result is thrown away rather than cached, so the next student
 * who picks the language triggers a fresh attempt instead of inheriting a
 * failure forever. It isn't 100% because a translator legitimately leaves some
 * values alone — "OK" and "PDF" are "OK" and "PDF" in a lot of languages.
 */
export const MIN_COVERAGE = 0.7;

/** Roughly what one pair costs as JSON: two quoted strings and a comma. */
function costOf(key: string, value: string): number {
  return key.length + value.length + 6;
}

/**
 * The dictionary in evenly-sized batches, in a stable order.
 *
 * The target is derived from how many batches the budget implies rather than
 * being the budget itself, so the work spreads evenly instead of filling each
 * batch to the brim and leaving a sliver at the end. A sliver still costs a
 * whole round trip, and every batch is waited on.
 */
export function chunkDictionary(strings: Dict, budget = BATCH_CHARS): Dict[] {
  const entries = Object.entries(strings);
  if (!entries.length) return [];

  const total = entries.reduce((sum, [k, v]) => sum + costOf(k, v), 0);
  const wanted = Math.max(
    Math.ceil(total / budget),
    Math.ceil(entries.length / MAX_BATCH_KEYS),
  );
  const target = total / wanted;

  const out: Dict[] = [];
  let current: Dict = {};
  let size = 0;
  let count = 0;

  for (const [key, value] of entries) {
    const cost = costOf(key, value);
    // Close the batch once it's nearer the target with this pair left out
    // than with it in — which keeps the last batch the same size as the rest.
    const overshootsLess = size > 0 && size + cost - target > target - size;
    if (count && (overshootsLess || count >= MAX_BATCH_KEYS) && out.length < wanted - 1) {
      out.push(current);
      current = {};
      size = 0;
      count = 0;
    }
    current[key] = value;
    size += cost;
    count += 1;
  }
  if (count) out.push(current);
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
