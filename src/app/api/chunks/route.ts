import { authed, jsonBody } from "@/lib/server/handler";
import { getChunks } from "@/lib/server/repo";

// POST rather than GET: a lesson can span more material ids than fit in a URL.
export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const ids = Array.isArray(body.materialIds) ? (body.materialIds as string[]) : [];
  return { chunks: await getChunks(user.id, ids) };
});
