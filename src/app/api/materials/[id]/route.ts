import { currentUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { deleteMaterial } from "@/lib/server/repo";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/materials/[id]">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  await deleteMaterial(user.id, id);
  return Response.json({ ok: true });
}

/** Filing a material under a course (or unfiling it with null). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/materials/[id]">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const courseId =
    typeof body.courseId === "string" && body.courseId ? body.courseId : null;

  // The course has to be theirs too, or this becomes a way to probe for ids.
  if (courseId) {
    const owned = await query("select 1 from courses where id = $1 and user_id = $2", [
      courseId,
      user.id,
    ]);
    if (!owned.length) {
      return Response.json({ error: "No such course." }, { status: 404 });
    }
  }

  await query("update materials set course_id = $3 where id = $1 and user_id = $2", [
    id,
    user.id,
    courseId,
  ]);
  return Response.json({ ok: true });
}
