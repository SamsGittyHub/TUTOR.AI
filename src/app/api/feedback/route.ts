import { authed, jsonBody } from "@/lib/server/handler";
import { query } from "@/lib/server/db";
import { sanitizeText } from "@/lib/sanitize";

/**
 * Beta feedback, sent from inside the thing being complained about.
 *
 * The route and the lesson id travel with the message because "it didn't work"
 * without them costs a round trip to become useful, and a tester who has to be
 * asked a follow-up question usually doesn't answer it.
 */

const MAX_MESSAGE = 4000;

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const message = sanitizeText(String(body.message ?? "")).trim().slice(0, MAX_MESSAGE);
  if (message.length < 3) throw new Error("Tell us a little more than that.");

  await query(
    `insert into feedback (user_id, message, path, lesson_id, user_agent)
     values ($1, $2, $3, $4, $5)`,
    [
      user.id,
      message,
      sanitizeText(String(body.path ?? "")).slice(0, 300) || null,
      sanitizeText(String(body.lessonId ?? "")).slice(0, 100) || null,
      sanitizeText(String(request.headers.get("user-agent") ?? "")).slice(0, 300) || null,
    ],
  );

  return { ok: true };
});
