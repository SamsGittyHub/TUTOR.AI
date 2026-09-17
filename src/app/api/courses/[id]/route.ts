import { currentUser } from "@/lib/server/auth";
import { deleteCourse } from "@/lib/server/repo";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/courses/[id]">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  await deleteCourse(user.id, id);
  return Response.json({ ok: true });
}
