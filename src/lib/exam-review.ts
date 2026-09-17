import { sanitizeText } from "./sanitize";

/**
 * A marked exam, read back to the student.
 *
 * The thing a student actually wants after getting a paper back is not the
 * score — they already have that — it's *why* each mark went. So the unit here
 * is the question, and every question carries what they wrote, what went
 * wrong, and what to do differently. The score is derived, not entered.
 *
 * Verdicts are deliberately four-valued. "unclear" exists because a photo of
 * handwriting genuinely is sometimes unreadable, and a model guessing in that
 * case is worse than one saying so: a student told they got something wrong
 * when the page was just blurry will go and re-learn something they knew.
 *
 * Pure functions — the model call lives in tutor/exam-review-gen.ts.
 */

export type Verdict = "correct" | "partial" | "wrong" | "unclear";

export interface ReviewedQuestion {
  id: string;
  /** "Q3", "4(b)" — whatever the paper calls it. */
  number: string;
  /** The question, as read off the page. */
  prompt?: string;
  /** What the student wrote. */
  given?: string;
  /** What it should have been. */
  expected?: string;
  verdict: Verdict;
  marksAwarded?: number;
  marksAvailable?: number;
  /** The specific error, not "you got it wrong". */
  wentWrong?: string;
  /** What to do differently next time. */
  fix?: string;
  topic?: string;
}

export interface ExamReviewResult {
  /** Two or three sentences on how the paper went overall. */
  summary: string;
  questions: ReviewedQuestion[];
}

export interface ReviewPage {
  /** "page 1", "back of sheet 2". */
  locator: string;
  storagePath?: string;
  mediaType: string;
}

export interface ExamReview {
  id: string;
  courseId?: string;
  title: string;
  pages: ReviewPage[];
  review: ExamReviewResult | null;
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/* Normalising what the model returns                                          */
/* -------------------------------------------------------------------------- */

const VERDICTS: Verdict[] = ["correct", "partial", "wrong", "unclear"];

interface RawQuestion {
  number?: unknown;
  question?: unknown;
  prompt?: unknown;
  given?: unknown;
  yourAnswer?: unknown;
  your_answer?: unknown;
  expected?: unknown;
  answer?: unknown;
  verdict?: unknown;
  marksAwarded?: unknown;
  marks_awarded?: unknown;
  marksAvailable?: unknown;
  marks_available?: unknown;
  wentWrong?: unknown;
  went_wrong?: unknown;
  fix?: unknown;
  topic?: unknown;
}

const str = (value: unknown): string | undefined => {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = sanitizeText(value).trim();
  return trimmed || undefined;
};

const num = (value: unknown): number | undefined => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function normalizeQuestion(
  raw: RawQuestion,
  index: number,
): ReviewedQuestion | null {
  const number = str(raw.number) ?? str(raw.question) ?? `Q${index + 1}`;
  const verdictRaw = String(raw.verdict ?? "").toLowerCase().trim();
  const verdict: Verdict = VERDICTS.includes(verdictRaw as Verdict)
    ? (verdictRaw as Verdict)
    : "unclear";

  const marksAvailable = num(raw.marksAvailable ?? raw.marks_available);
  let marksAwarded = num(raw.marksAwarded ?? raw.marks_awarded);
  // A model that says 5/3 is confused; trust the smaller number.
  if (marksAwarded !== undefined && marksAvailable !== undefined) {
    marksAwarded = Math.min(marksAwarded, marksAvailable);
  }

  const question: ReviewedQuestion = {
    id: `rq${index + 1}`,
    number,
    prompt: str(raw.prompt),
    given: str(raw.given ?? raw.yourAnswer ?? raw.your_answer),
    expected: str(raw.expected ?? raw.answer),
    verdict,
    marksAwarded,
    marksAvailable,
    wentWrong: str(raw.wentWrong ?? raw.went_wrong),
    fix: str(raw.fix),
    topic: str(raw.topic),
  };

  // A row with nothing but a generated number tells the student nothing.
  const hasSubstance =
    question.prompt || question.given || question.expected || question.wentWrong;
  return hasSubstance ? question : null;
}

export function normalizeReview(raw: unknown): ExamReviewResult | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { summary?: unknown; questions?: unknown };
  const list = Array.isArray(record.questions) ? record.questions : [];

  const questions = list
    .map((item, index) => normalizeQuestion(item as RawQuestion, index))
    .filter((q): q is ReviewedQuestion => q !== null);

  if (!questions.length) return null;

  return {
    summary: str(record.summary) ?? "",
    questions,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading the result                                                          */
/* -------------------------------------------------------------------------- */

export interface ReviewScore {
  awarded: number;
  total: number;
  percent: number;
  /** Questions the model couldn't read, excluded from the score. */
  unclear: number;
}

/**
 * The score, derived from the per-question marks.
 *
 * Questions the model couldn't read are excluded from both sides rather than
 * counted as zero — a blurry photo should lower confidence, not the grade.
 */
export function scoreOf(review: ExamReviewResult): ReviewScore {
  let awarded = 0;
  let total = 0;
  let unclear = 0;

  for (const question of review.questions) {
    if (question.verdict === "unclear") {
      unclear += 1;
      continue;
    }
    if (question.marksAvailable === undefined) continue;
    total += question.marksAvailable;
    awarded += question.marksAwarded ?? (question.verdict === "correct" ? question.marksAvailable : 0);
  }

  return {
    awarded,
    total,
    percent: total ? Math.round((awarded / total) * 100) : 0,
    unclear,
  };
}

/** Topics to revise, worst first — marks lost, then number of slips. */
export function weakTopics(
  review: ExamReviewResult,
): { topic: string; lost: number; count: number; reasons: string[] }[] {
  const byTopic = new Map<
    string,
    { topic: string; lost: number; count: number; reasons: string[] }
  >();

  for (const question of review.questions) {
    if (question.verdict === "correct" || question.verdict === "unclear") continue;
    const topic = question.topic?.trim() || question.number;
    const lost =
      question.marksAvailable !== undefined
        ? question.marksAvailable - (question.marksAwarded ?? 0)
        : 1;

    const existing = byTopic.get(topic.toLowerCase());
    if (existing) {
      existing.lost += lost;
      existing.count += 1;
      if (question.wentWrong && !existing.reasons.includes(question.wentWrong)) {
        existing.reasons.push(question.wentWrong);
      }
      continue;
    }
    byTopic.set(topic.toLowerCase(), {
      topic,
      lost,
      count: 1,
      reasons: question.wentWrong ? [question.wentWrong] : [],
    });
  }

  return [...byTopic.values()].sort(
    (a, b) => b.lost - a.lost || b.count - a.count || a.topic.localeCompare(b.topic),
  );
}

/** The prompt handed to the board when a student asks to be taught a mistake. */
export function teachPrompt(question: ReviewedQuestion): string {
  const lines = [
    "Go through this with me — I lost marks on it in an exam.",
    "",
    `Question ${question.number}${question.prompt ? `: ${question.prompt}` : ""}`,
  ];
  if (question.given) lines.push(`What I wrote: ${question.given}`);
  if (question.expected) lines.push(`The answer: ${question.expected}`);
  if (question.wentWrong) lines.push(`What went wrong: ${question.wentWrong}`);
  lines.push("", "Teach me the idea behind it, not just the correction.");
  return lines.join("\n");
}
