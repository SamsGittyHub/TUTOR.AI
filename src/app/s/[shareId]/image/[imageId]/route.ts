import { queryOne } from "@/lib/server/db";
import { readStored } from "@/lib/server/storage";

/**
 * A picture from a shared board, without the owner's session.
 *
 * The check that matters is the second one: the image id has to actually
 * appear in the board this link points at. Without it, a single shared lesson
 * would turn into a key for every drawing that student ever made.
 */

export const runtime = "nodejs";

const ID = /^[0-9a-f-]{36}$/;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/s/[shareId]/image/[imageId]">,
) {
  const { shareId, imageId } = await ctx.params;
  if (!ID.test(shareId) || !ID.test(imageId)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await queryOne<{ user_id: string }>(
    `select user_id from lessons
      where share_id = $1
        and actions::text like $2`,
    [shareId, `%/api/images/${imageId}%`],
  );
  if (!row) return new Response("Not found", { status: 404 });

  const data = await readStored(`${row.user_id}/board-images/${imageId}.png`).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/png",
      "content-length": String(data.byteLength),
      "cache-control": "public, max-age=3600",
    },
  });
}
