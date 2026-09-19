import { currentUser } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { languageByCode, languageLabel } from "@/lib/languages";
import { sourceHash, STRINGS } from "@/lib/strings";
import { translateDict } from "@/lib/server/translate";
import { mergeTranslation, worthCaching } from "@/lib/translate-plan";

/**
 * The interface, in one language.
 *
 * Translated once by the model and cached for everyone — not per user, since
 * the strings are the same for all of them. A row carries the hash of the
 * English dictionary it came from, so rewording a string regenerates every
 * locale instead of leaving them half-stale.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/translations/[locale]">,
) {
  const { locale } = await ctx.params;

  // English is the source; there's nothing to fetch.
  if (locale === "en" || !languageByCode(locale)) {
    return Response.json({ locale: "en", dict: STRINGS, source: "builtin" });
  }

  const hash = sourceHash();
  const cached = await queryOne<{ dict: Record<string, string> }>(
    "select dict from ui_translations where locale = $1 and source_hash = $2",
    [locale, hash],
  );
  /*
   * A cached row is trusted only if it's actually translated.
   *
   * Rows written before the batching fix can be mostly English — that was the
   * bug — and they carry a valid source hash, so nothing would ever look at
   * them again. Checking on the way out costs one pass over 300 strings and
   * lets a language that failed once heal itself on the next request.
   */
  if (cached) {
    const quality = mergeTranslation(STRINGS, [cached.dict]);
    if (worthCaching(quality)) {
      return Response.json({ locale, dict: cached.dict, source: "cache" });
    }
    console.warn(
      `[translate] cached ${locale} is only ${Math.round(quality.coverage * 100)}% translated — regenerating`,
    );
  }

  // Generating costs a model call, so only a signed-in user can trigger one.
  // Everyone after them reads the cache, including signed-out visitors.
  const user = await currentUser();
  if (!user) {
    return Response.json({ locale: "en", dict: STRINGS, source: "fallback" });
  }

  try {
    const result = await translateDict(locale, languageLabel(locale));

    /*
     * A thin result is not cached.
     *
     * This is the difference between a language that fails today and a
     * language that is broken for good: the cache is keyed on the source
     * hash, so writing a mostly-English dictionary once means every student
     * who picks that language from then on is served the failure, and nothing
     * ever tries again. Better to hand back English now and retry on the next
     * request.
     */
    if (!result.usable) {
      return Response.json({
        locale: "en",
        dict: STRINGS,
        source: "incomplete",
        coverage: result.coverage,
      });
    }

    await query(
      `insert into ui_translations (locale, dict, source_hash)
       values ($1, $2, $3)
       on conflict (locale) do update set
         dict = excluded.dict,
         source_hash = excluded.source_hash,
         updated_at = now()`,
      [locale, JSON.stringify(result.dict), hash],
    );
    return Response.json({
      locale,
      dict: result.dict,
      source: "generated",
      coverage: result.coverage,
    });
  } catch (error) {
    // A failed translation must never break the app — English still works.
    console.error("[translate]", (error as Error).message);
    return Response.json({ locale: "en", dict: STRINGS, source: "error" });
  }
}
