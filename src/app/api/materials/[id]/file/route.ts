import { currentUser } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import { readStored } from "@/lib/server/storage";

export const runtime = "nodejs";

/** Streams the original back — "download my PDF" from any device. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/materials/[id]/file">,
) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await ctx.params;
  const row = await queryOne<{ name: string; storage_path: string | null }>(
    "select name, storage_path from materials where id = $1 and user_id = $2",
    [id, user.id],
  );
  if (!row?.storage_path) {
    return Response.json({ error: "No original stored for that file." }, { status: 404 });
  }

  const data = await readStored(row.storage_path);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${row.name.replace(/"/g, "")}"`,
      "content-length": String(data.byteLength),
    },
  });
}
