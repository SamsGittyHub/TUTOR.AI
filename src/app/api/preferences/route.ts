import { authed, jsonBody } from "@/lib/server/handler";
import { query, queryOne } from "@/lib/server/db";
import { languageByCode } from "@/lib/languages";

/** Account-level preferences. Just the language for now. */

export const GET = authed(async (user) => {
  const row = await queryOne<{ language: string | null }>(
    "select language from users where id = $1",
    [user.id],
  );
  return { language: row?.language ?? null };
});

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const code = typeof body.language === "string" ? body.language : "";
  // Validated against the list, so an arbitrary string can't reach a prompt.
  if (!languageByCode(code)) throw new Error("Unknown language.");
  await query("update users set language = $2, updated_at = now() where id = $1", [
    user.id,
    code,
  ]);
  return { language: code };
});
