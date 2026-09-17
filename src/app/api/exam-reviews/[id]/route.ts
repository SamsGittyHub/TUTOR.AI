import { currentUser } from "@/lib/server/auth";
import { deleteExamReview, getExamReview } from "@/lib/server/repo";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/exam-reviews/[id]">,
) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const review = await getExamReview(user.id, id);
  if (!review) return Response.json({ error: "No such review." }, { status: 404 });
  return Response.json({ review });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/exam-reviews/[id]">,
) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  await deleteExamReview(user.id, id);
  return Response.json({ ok: true });
}
