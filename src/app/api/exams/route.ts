import { authed, jsonBody } from "@/lib/server/handler";
import { listExams, putExam } from "@/lib/server/repo";
import type { PracticeExam } from "@/lib/exam";

export const GET = authed(async (user) => ({ exams: await listExams(user.id) }));

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const exam = body.exam as PracticeExam | undefined;
  if (!exam?.id || !Array.isArray(exam.sections)) {
    throw new Error("A generated exam is required.");
  }
  await putExam(user.id, exam);
  return { ok: true };
});
