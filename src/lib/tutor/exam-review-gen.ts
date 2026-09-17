"use client";

import { normalizeReview, type ExamReviewResult } from "../exam-review";
import { languageInstruction } from "../language";
import { getProvider, type ImagePart, type ProviderId, type Usage } from "../providers";
import { extractFirstJson } from "../stream-json";

/**
 * Reading a marked exam off photographs.
 *
 * This is the one place the model is asked to report on something the student
 * already knows the answer to — they have the paper. So the value is entirely
 * in the *why*, and the prompt pushes hard against the two failure modes that
 * would waste it: restating the mark scheme instead of diagnosing the error,
 * and guessing at handwriting it cannot actually read.
 */

export interface ExamReviewRequest {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  images: ImagePart[];
  /** What the student called it — helps the model orient on a maths vs essay paper. */
  title: string;
  /** Anything they want to add: "the last page is the mark scheme". */
  note?: string;
  signal?: AbortSignal;
}

/** Providers cap images per request; more than this is a different lesson anyway. */
export const MAX_PAGES = 8;

function buildPrompt(title: string, note?: string): string {
  return `The images above are a student's exam paper, "${title}", after marking.${
    note ? `\n\nThey add: ${note}` : ""
  }

Go through it question by question. The student already knows their score —
what they don't know is why each mark went, so that is what you are for.

Reply with JSON and nothing else:

{"summary":"Two or three sentences: what went well, and the one habit costing the most marks.",
 "questions":[
   {"number":"3(b)",
    "prompt":"Find the stationary points of f(x) = x^3 - 3x",
    "given":"x = 1 only",
    "expected":"x = 1 and x = -1",
    "verdict":"partial",
    "marksAwarded":2,
    "marksAvailable":4,
    "wentWrong":"You solved 3x^2 - 3 = 0 but only took the positive root.",
    "fix":"A quadratic has two roots — write both, then test each.",
    "topic":"Stationary points"}]}

Rules:
- "verdict" is exactly one of: correct, partial, wrong, unclear.
- Use "unclear" whenever you cannot actually read the handwriting or the
  marking. Do not guess. Telling a student they got something wrong when the
  photo was blurry sends them to re-learn something they already know.
- "wentWrong" must name the specific error in their working — the line it
  happened on, the step they skipped, the rule they misapplied. Never write
  "incorrect answer" or restate the mark scheme.
- "fix" is what to do differently next time, as a habit, not the answer again.
- "topic" is the underlying idea, so it can be revised. Keep topics consistent
  across questions that test the same thing.
- Include every question you can see, including ones they got right — a
  student needs to know what is already solid.
- Read marks off the paper where the marker wrote them. Omit marksAwarded and
  marksAvailable rather than inventing them.`;
}

export async function reviewExam(
  request: ExamReviewRequest,
): Promise<{ review: ExamReviewResult; usage: Usage }> {
  if (!request.images.length) {
    throw new Error("Add at least one photo of the paper.");
  }

  const provider = getProvider(request.providerId);
  let text = "";
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };

  await provider.stream({
    apiKey: request.apiKey,
    model: request.model,
    system:
      "You are a tutor going through a student's marked exam with them. You diagnose why marks were lost, in their own working. You reply with JSON and nothing else." + languageInstruction(),
    messages: [
      {
        role: "user",
        content: buildPrompt(request.title, request.note),
        images: request.images.slice(0, MAX_PAGES),
      },
    ],
    maxTokens: 8000,
    effort: "low",
    signal: request.signal,
    onText: (delta) => {
      text += delta;
    },
    onUsage: (u) => {
      usage = u;
    },
  });

  const review = normalizeReview(extractFirstJson(text));
  if (!review) {
    throw new Error(
      "Nothing readable came back. If the photos are dark or at an angle, retake them straight on — or try a stronger model.",
    );
  }
  return { review, usage };
}
