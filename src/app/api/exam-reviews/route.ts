import { authed, jsonBody } from "@/lib/server/handler";
import { listExamReviews, putExamReview } from "@/lib/server/repo";
import type { ExamReview } from "@/lib/exam-review";

export const GET = authed(async (user) => ({
  reviews: await listExamReviews(user.id),
}));

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const review = body.review as ExamReview | undefined;
  if (!review?.id || !review.title) {
    throw new Error("A review needs an id and a title.");
  }
  await putExamReview(user.id, review);
  return { ok: true };
});
