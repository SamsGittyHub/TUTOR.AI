import { authed, jsonBody } from "@/lib/server/handler";
import { listAttempts, putAttempt } from "@/lib/server/repo";
import type { QuizAttempt } from "@/lib/db";

export const GET = authed(async (user) => ({
  attempts: await listAttempts(user.id),
}));

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const attempt = body.attempt as QuizAttempt | undefined;
  if (!attempt?.id) throw new Error("An attempt is required.");
  await putAttempt(user.id, attempt);
  return { ok: true };
});
