import "server-only";

import { BETA_CHAT_MODEL, BETA_OPENAI_KEY, hasBetaOpenAiKey } from "./beta-key";
import { STRINGS, type Dict } from "@/lib/strings";
import {
  chunkDictionary,
  mergeTranslation,
  worthCaching,
  type Merged,
} from "@/lib/translate-plan";

/**
 * Translates the whole interface dictionary in one call.
 *
 * One call per language, ever — the result is cached for every user — so it's
 * worth sending the entire dictionary at once rather than string by string:
 * a translator that can see "Due today" next to "Review cards" picks better
 * words than one handed each in isolation.
 *
 * Keys are never translated, and placeholders like {n} have to survive
 * verbatim or the interpolation breaks.
 */

const SYSTEM =
  "You localise software interfaces. You reply with JSON and nothing else.";

/** Bounded per batch, so one slow language can't hold a request open. */
const BATCH_TIMEOUT_MS = 60_000;

/**
 * Generous for 50 short strings, even in a script that expands badly.
 *
 * Named max_completion_tokens, not max_tokens: the models this runs on reject
 * the older parameter outright, which would fail every language rather than
 * the large ones — see the OpenAI provider, which has always sent it this way.
 */
const BATCH_MAX_TOKENS = 4000;

/** Batches in flight at once — polite to the API, still finishes promptly. */
const CONCURRENCY = 4;

function buildPrompt(languageLabel: string, batch: Dict): string {
  return `Translate this interface into ${languageLabel}.

Reply with a JSON object using exactly the same keys, and nothing else.

Rules:
- Translate only the values. Never translate or reorder a key.
- Keep placeholders like {n} exactly as they are.
- These are buttons, labels and short help text in a study app — match that
  register. Short where the English is short; a button that wraps to two lines
  is a worse translation than a slightly looser one that fits.
- Keep product terms recognisable: a "flashcard" and a "whiteboard" should read
  as what a student in that language actually calls them.
- Where a language has a formal and an informal register, use the one a study
  tool would use with a student.

${JSON.stringify(batch, null, 0)}`;
}

/** One batch, or null if it failed — a batch is never allowed to throw. */
async function translateBatch(
  batch: Dict,
  languageLabel: string,
): Promise<Dict | null> {
  const timeout = new AbortController();
  const expired = setTimeout(() => timeout.abort(), BATCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${BETA_OPENAI_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: BETA_CHAT_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: buildPrompt(languageLabel, batch) },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: BATCH_MAX_TOKENS,
      }),
      signal: timeout.signal,
    });
    if (!response.ok) {
      console.error(`[translate] batch failed (${response.status})`);
      return null;
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const choice = body.choices?.[0];
    if (choice?.finish_reason === "length") {
      // Truncated: whatever parsed out of it is a fragment, and treating a
      // fragment as a result is exactly how half-English dictionaries used to
      // reach the cache and stay there.
      console.error("[translate] batch hit the output limit");
      return null;
    }
    return JSON.parse(choice?.message?.content ?? "{}") as Dict;
  } catch (error) {
    console.error("[translate] batch error:", (error as Error).message);
    return null;
  } finally {
    clearTimeout(expired);
  }
}

export interface Translation extends Merged {
  /** False when too little came back to be worth keeping. */
  usable: boolean;
}

/**
 * Translates the whole interface, in batches.
 *
 * Never throws for a partial result: it reports coverage and lets the caller
 * decide. The one thing it will not do is quietly hand back a dictionary that
 * is mostly English, because that is indistinguishable from success at every
 * layer above it.
 */
export async function translateDict(
  locale: string,
  languageLabel: string,
): Promise<Translation> {
  if (!hasBetaOpenAiKey()) {
    throw new Error("No key configured to translate with.");
  }

  const batches = chunkDictionary(STRINGS);
  const results: (Dict | null)[] = new Array(batches.length).fill(null);

  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= batches.length) return;
      /*
       * One retry. A batch is a seventh of the interface, and the usual
       * reasons one fails — a rate limit, a blip, a single over-long reply —
       * are exactly the reasons a second attempt succeeds.
       */
      results[i] =
        (await translateBatch(batches[i], languageLabel)) ??
        (await translateBatch(batches[i], languageLabel));
    }
  });
  await Promise.all(workers);

  const merged = mergeTranslation(STRINGS, results);
  const usable = worthCaching(merged);
  console.log(
    `[translate] ${locale}: ${merged.translated}/${Object.keys(STRINGS).length} strings ` +
      `(${Math.round(merged.coverage * 100)}%)${usable ? "" : " — too thin to cache"}`,
  );
  return { ...merged, usable };
}
