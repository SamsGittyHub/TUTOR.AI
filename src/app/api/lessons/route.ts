import { authed, jsonBody } from "@/lib/server/handler";
import { listSessions, putSession } from "@/lib/server/repo";
import type { Session } from "@/lib/db";

export const GET = authed(async (user) => ({
  sessions: await listSessions(user.id),
}));

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const session = body.session as Session | undefined;
  if (!session?.id) throw new Error("A session is required.");
  await putSession(user.id, session);
  return { ok: true };
});
