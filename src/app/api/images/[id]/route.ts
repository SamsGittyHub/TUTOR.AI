import { currentUser } from "@/lib/server/auth";
import { readStored } from "@/lib/server/storage";

/**
 * Serves a picture the tutor drew.
 *
 * There's no lookup table behind this: the path is `<userId>/board-images/<id>.png`
 * and the user id comes from the session, never from the request, so one
 * student's id can't address another's drawings.
 */

export const runtime = "nodejs";

const ID = /^[0-9a-f-]{36}$/;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/images/[id]">,
) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "No such drawing." }, { status: 404 });

  const data = await readStored(`${user.id}/board-images/${id}.png`).catch(() => null);
  if (!data) return Response.json({ error: "No such drawing." }, { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/png",
      "content-length": String(data.byteLength),
      // Immutable: the id names these exact bytes, and the board re-renders
      // the same card every time the lesson is reopened.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
