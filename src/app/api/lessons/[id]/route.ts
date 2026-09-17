import { currentUser } from "@/lib/server/auth";
import { deleteSession, getSession } from "@/lib/server/repo";

export async function GET(_request: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  return Response.json({ session: (await getSession(user.id, id)) ?? null });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  await deleteSession(user.id, id);
  return Response.json({ ok: true });
}
