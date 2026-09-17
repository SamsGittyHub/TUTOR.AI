import { currentUser } from "@/lib/server/auth";
import {
  deleteExam,
  getExam,
  saveExamResponses,
  submitExam,
} from "@/lib/server/repo";
import type { ExamResponses } from "@/lib/exam";

async function me() {
  return currentUser();
}

export async function GET(_request: Request, ctx: RouteContext<"/api/exams/[id]">) {
  const user = await me();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const exam = await getExam(user.id, id);
  if (!exam) return Response.json({ error: "No such exam." }, { status: 404 });
  return Response.json(exam);
}

/**
 * PATCH autosaves answers; PATCH with `submit` grades the paper.
 *
 * Grading is server-side on purpose: the answer key lives in the row, so a
 * client that wanted to could otherwise mark its own paper.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/exams/[id]">) {
  const user = await me();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;

  const body = (await request.json().catch(() => ({}))) as {
    responses?: ExamResponses;
    submit?: boolean;
  };
  const responses = body.responses ?? {};

  if (body.submit) {
    const graded = await submitExam(user.id, id, responses);
    if (!graded) return Response.json({ error: "No such exam." }, { status: 404 });
    return Response.json(graded);
  }

  await saveExamResponses(user.id, id, responses);
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/exams/[id]">) {
  const user = await me();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  await deleteExam(user.id, id);
  return Response.json({ ok: true });
}
