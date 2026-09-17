/**
 * A practice exam: sections, questions, marks, and how it's graded.
 *
 * Shaped like a real paper rather than a quiz — sections with their own
 * instructions, marks per question, and a total — because that's the thing a
 * student is actually rehearsing for. Multi-page in the UI means one section
 * per page.
 *
 * Pure types and grading here; generation lives in tutor/exam-gen.ts.
 */

export type ExamQuestionKind = "multiple_choice" | "short_answer" | "worked";

export interface ExamQuestion {
  id: string;
  kind: ExamQuestionKind;
  prompt: string;
  /** Multiple choice only. */
  choices?: string[];
  answer: string;
  /** Why the answer is the answer — shown after submission. */
  explanation?: string;
  marks: number;
  /** The weak point this question was generated for. */
  topic?: string;
  sourceLocator?: string;
}

export interface ExamSection {
  id: string;
  title: string;
  /** "Answer all questions. Show your working." */
  instructions?: string;
  questions: ExamQuestion[];
}

export interface PracticeExam {
  id: string;
  title: string;
  createdAt: number;
  /** Lessons it was built from. */
  sessionIds: string[];
  materialIds: string[];
  sections: ExamSection[];
  /** Minutes the paper is meant to take. */
  minutes: number;
  /** Topic → why it was emphasised, for the "why these questions" panel. */
  focus: { topic: string; reasons: string[] }[];
}

/** A student's answers, keyed by question id. */
export type ExamResponses = Record<string, string>;

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  awarded: number;
  marks: number;
}

export interface ExamResult {
  awarded: number;
  total: number;
  percent: number;
  perQuestion: QuestionResult[];
  /** Sections sorted worst-first, for the "what to revise" summary. */
  bySection: { sectionId: string; title: string; awarded: number; total: number }[];
  weakestTopics: string[];
}

export function allQuestions(exam: PracticeExam): ExamQuestion[] {
  return exam.sections.flatMap((section) => section.questions);
}

export function totalMarks(exam: PracticeExam): number {
  return allQuestions(exam).reduce((sum, q) => sum + q.marks, 0);
}

/**
 * Lenient answer matching, same spirit as the quiz checker.
 *
 * Worked questions are never auto-marked wrong: they're graded by the tutor on
 * the board afterwards, and guessing at partial credit for a derivation would
 * be worse than admitting we can't.
 */
export function checkExamAnswer(
  question: ExamQuestion,
  response: string,
): boolean | null {
  if (question.kind === "worked") return null;

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[\s$\\]/g, "")
      .replace(/[.,;:!?]+$/, "");

  const given = normalize(response);
  if (!given) return false;
  if (given === normalize(question.answer)) return true;

  if (question.choices?.length) {
    // "B" or "b)" should match the second choice.
    const letter = response.trim().toLowerCase().charCodeAt(0) - 97;
    const picked = question.choices[letter];
    if (picked && normalize(picked) === normalize(question.answer)) return true;
  }
  return false;
}

export function gradeExam(
  exam: PracticeExam,
  responses: ExamResponses,
): ExamResult {
  const perQuestion: QuestionResult[] = [];
  const bySection: ExamResult["bySection"] = [];
  const topicMisses = new Map<string, number>();

  for (const section of exam.sections) {
    let sectionAwarded = 0;
    let sectionTotal = 0;

    for (const question of section.questions) {
      const verdict = checkExamAnswer(question, responses[question.id] ?? "");
      // An unmarkable worked answer counts toward neither side of the ratio,
      // so a paper of derivations doesn't read as 0%.
      const counts = verdict !== null;
      const correct = verdict === true;
      const awarded = correct ? question.marks : 0;

      perQuestion.push({
        questionId: question.id,
        correct,
        awarded,
        marks: counts ? question.marks : 0,
      });

      if (counts) {
        sectionAwarded += awarded;
        sectionTotal += question.marks;
        if (!correct && question.topic) {
          topicMisses.set(question.topic, (topicMisses.get(question.topic) ?? 0) + 1);
        }
      }
    }

    bySection.push({
      sectionId: section.id,
      title: section.title,
      awarded: sectionAwarded,
      total: sectionTotal,
    });
  }

  const awarded = bySection.reduce((s, x) => s + x.awarded, 0);
  const total = bySection.reduce((s, x) => s + x.total, 0);

  return {
    awarded,
    total,
    percent: total ? Math.round((awarded / total) * 100) : 0,
    perQuestion,
    bySection: [...bySection].sort(
      (a, b) => a.awarded / (a.total || 1) - b.awarded / (b.total || 1),
    ),
    weakestTopics: [...topicMisses.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
      .slice(0, 5),
  };
}
