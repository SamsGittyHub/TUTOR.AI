import { currentUser } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { languageByCode, languageLabel } from "@/lib/languages";
import { sourceHash, STRINGS } from "@/lib/strings";
import { translateDict } from "@/lib/server/translate";

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
  if (cached) {
    return Response.json({ locale, dict: cached.dict, source: "cache" });
  }

  // Generating costs a model call, so only a signed-in user can trigger one.
  // Everyone after them reads the cache, including signed-out visitors.
  const user = await currentUser();
  if (!user) {
    return Response.json({ locale: "en", dict: STRINGS, source: "fallback" });
  }

  try {
    const dict = await translateDict(locale, languageLabel(locale));
    await query(
      `insert into ui_translations (locale, dict, source_hash)
       values ($1, $2, $3)
       on conflict (locale) do update set
         dict = excluded.dict,
         source_hash = excluded.source_hash,
         updated_at = now()`,
      [locale, JSON.stringify(dict), hash],
    );
    return Response.json({ locale, dict, source: "generated" });
  } catch (error) {
    // A failed translation must never break the app — English still works.
    console.error("[translate]", (error as Error).message);
    return Response.json({ locale: "en", dict: STRINGS, source: "error" });
  }
}
