import "server-only";

import { BETA_CHAT_MODEL, BETA_OPENAI_KEY, hasBetaOpenAiKey } from "./beta-key";
import { STRINGS, type Dict } from "@/lib/strings";

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

function buildPrompt(languageLabel: string): string {
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

${JSON.stringify(STRINGS, null, 0)}`;
}

export async function translateDict(
  locale: string,
  languageLabel: string,
): Promise<Dict> {
  if (!hasBetaOpenAiKey()) {
    throw new Error("No key configured to translate with.");
  }

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
        { role: "user", content: buildPrompt(languageLabel) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Translation failed (${response.status}).`);
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = body.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  // Only keys we asked for, only strings, and English for anything missing —
  // a partial translation should degrade key by key, not fail wholesale.
  const dict: Dict = {};
  for (const [key, english] of Object.entries(STRINGS)) {
    const value = parsed[key];
    dict[key] = typeof value === "string" && value.trim() ? value : english;
  }
  return dict;
}
