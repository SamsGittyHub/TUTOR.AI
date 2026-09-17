import { currentUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
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

/** Filing a lesson under a subject, or pulling it back out with null. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/lessons/[id]">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const courseId =
    typeof body.courseId === "string" && body.courseId ? body.courseId : null;

  // The subject has to be theirs too, or this becomes a way to probe for ids.
  if (courseId) {
    const owned = await query("select 1 from courses where id = $1 and user_id = $2", [
      courseId,
      user.id,
    ]);
    if (!owned.length) {
      return Response.json({ error: "No such subject." }, { status: 404 });
    }
  }

  await query("update lessons set course_id = $3 where id = $1 and user_id = $2", [
    id,
    user.id,
    courseId,
  ]);
  return Response.json({ ok: true });
}
