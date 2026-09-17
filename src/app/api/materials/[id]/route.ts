import { currentUser } from "@/lib/server/auth";
import { deleteMaterial } from "@/lib/server/repo";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/materials/[id]">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  await deleteMaterial(user.id, id);
  return Response.json({ ok: true });
}
