import { authed, jsonBody } from "@/lib/server/handler";
import { parseProfile } from "@/lib/learning";
import { query, queryOne } from "@/lib/server/db";
import { sanitizeDeep } from "@/lib/sanitize";

/**
 * The tutor's memory of how this student learns.
 *
 * Account-scoped and nothing else: it follows them to any device they sign in
 * on, which is the whole point of a tutor that remembers, and it is deleted
 * with the account. Whole-document reads and writes, because it is a few
 * kilobytes and every consumer wants all of it.
 *
 * Everything is re-parsed on the way in and out, so a row written by an older
 * version of the app can never put a malformed field into a prompt.
 */

export const GET = authed(async (user) => {
  const row = await queryOne<{ profile: unknown }>(
    "select profile from learning_profiles where user_id = $1",
    [user.id],
  );
  return { profile: parseProfile(row?.profile) };
});

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const profile = parseProfile(body.profile);

  await query(
    `insert into learning_profiles (user_id, profile)
     values ($1, $2)
     on conflict (user_id) do update set
       profile    = excluded.profile,
       updated_at = now()`,
    // jsonb refuses U+0000 exactly as text does, and a note is written by a
    // model from a student's own words.
    [user.id, JSON.stringify(sanitizeDeep(profile))],
  );

  return { profile };
});

export const DELETE = authed(async (user) => {
  await query("delete from learning_profiles where user_id = $1", [user.id]);
  return { profile: parseProfile(null) };
});
