import { randomUUID } from "node:crypto";

import { currentUser } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";

/**
 * Making, and unmaking, a public link to one board.
 *
 * The link is an unguessable id, not the lesson id: revoking has to actually
 * revoke, and a lesson id that had once been public would stay guessable
 * forever. Setting share_id back to null kills the old link for good.
 */

export const runtime = "nodejs";

export async function POST(_request: Request, ctx: RouteContext<"/api/lessons/[id]/share">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await ctx.params;
  const row = await queryOne<{ share_id: string }>(
    `update lessons
        set share_id = coalesce(share_id, $3), updated_at = updated_at
      where id = $1 and user_id = $2
      returning share_id`,
    [id, user.id, randomUUID()],
  );
  if (!row) return Response.json({ error: "No such lesson." }, { status: 404 });
  return Response.json({ shareId: row.share_id });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/lessons/[id]/share">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await ctx.params;
  await queryOne(
    "update lessons set share_id = null where id = $1 and user_id = $2 returning id",
    [id, user.id],
  );
  return Response.json({ shareId: null });
}
