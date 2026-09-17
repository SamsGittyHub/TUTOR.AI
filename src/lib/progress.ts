/**
 * Progress math: per-material mastery, due forecast, attempt trends.
 *
 * Mastery is a blend a student could recompute in their head:
 *   60% recent quiz accuracy (last 5 attempts, newer weighted higher)
 *   40% card health (how much of the material's review queue is standing)
 * Deliberately explainable over accurate-to-the-decimal — the bar it clears is
 * "New / Learning / Strong", not a psychometric model.
 *
 * Pure functions only — same constraint as srs.ts.
 */

import type { ReviewCard } from "./srs";
import { DAY_MS, endOfToday, isDue, startOfDay } from "./srs";

export interface AttemptLike {
  id: string;
  sessionId: string;
  title: string;
  materialIds: string[];
  createdAt: number;
  score: number;
  total: number;
}

export type MasteryLabel = "New" | "Learning" | "Strong";

export interface MasteryResult {
  materialId: string;
  /** 0–100, rounded. */
  mastery: number;
  label: MasteryLabel;
  attemptCount: number;
  lastScore: { score: number; total: number } | null;
  cardCount: number;
  dueNow: number;
}

/**
 * Recency-weighted accuracy over the last `window` attempts, or null when
 * there are none. Weight `n - i` for the i-th most recent, so the newest
 * counts double the oldest of two and five times the oldest of five.
 */
export function recentAttemptAccuracy(
  attempts: AttemptLike[],
  window = 5,
): number | null {
  const list = [...attempts].sort((a, b) => b.createdAt - a.createdAt).slice(0, window);
  if (!list.length) return null;
  let weighted = 0;
  let weights = 0;
  list.forEach((attempt, i) => {
    const w = list.length - i;
    weighted += w * (attempt.total > 0 ? attempt.score / attempt.total : 0);
    weights += w;
  });
  return weights > 0 ? weighted / weights : null;
}

/**
 * Share of the queue in good standing: cards with at least one correct rep
 * count 1, lapsed-only cards count 0, never-graded cards count 0.5.
 */
export function cardHealth(cards: ReviewCard[]): number | null {
  if (!cards.length) return null;
  let sum = 0;
  for (const card of cards) {
    if (card.reps > 0) sum += 1;
    else if (card.lapses > 0) sum += 0;
    else sum += 0.5;
  }
  return sum / cards.length;
}

/** Blend accuracy and card health. No data at all → 0. */
export function computeMastery(attempts: AttemptLike[], cards: ReviewCard[]): number {
  const accuracy = recentAttemptAccuracy(attempts);
  const health = cardHealth(cards);
  if (accuracy === null && health === null) return 0;

  const parts: Array<[number, number]> = [];
  if (accuracy !== null) parts.push([accuracy, 0.6]);
  if (health !== null) parts.push([health, 0.4]);
  const weightSum = parts.reduce((sum, [, w]) => sum + w, 0);
  const blended = parts.reduce((sum, [v, w]) => sum + v * w, 0) / weightSum;
  return Math.round(blended * 100);
}

export function masteryLabel(value: number, hasData: boolean): MasteryLabel {
  if (!hasData) return "New";
  if (value >= 70) return "Strong";
  return "Learning";
}

export function masteryForMaterial(
  materialId: string,
  attempts: AttemptLike[],
  cards: ReviewCard[],
  now: number = Date.now(),
): MasteryResult {
  const materialAttempts = attempts.filter((a) => a.materialIds.includes(materialId));
  const materialCards = cards.filter((c) => c.materialIds.includes(materialId));
  const hasData = materialAttempts.length > 0 || materialCards.length > 0;
  const mastery = hasData ? computeMastery(materialAttempts, materialCards) : 0;
  const last = [...materialAttempts].sort((a, b) => b.createdAt - a.createdAt)[0];

  return {
    materialId,
    mastery,
    label: masteryLabel(mastery, hasData),
    attemptCount: materialAttempts.length,
    lastScore: last ? { score: last.score, total: last.total } : null,
    cardCount: materialCards.length,
    dueNow: materialCards.filter((c) => isDue(c, now)).length,
  };
}

/**
 * Due counts per day for the next `days` days. Bucket 0 is "today" (due by
 * end of day, including overdue); bucket 1 is tomorrow; anything past the
 * window is dropped.
 */
export function bucketForecast(cards: ReviewCard[], now: number, days = 7): number[] {
  const buckets = new Array<number>(days).fill(0);
  const todayEnd = endOfToday(now);
  const todayStart = startOfDay(now);

  for (const card of cards) {
    if (card.dueAt <= todayEnd) {
      buckets[0] += 1;
      continue;
    }
    const offset = Math.round((startOfDay(card.dueAt) - todayStart) / DAY_MS);
    if (offset >= 1 && offset < days) buckets[offset] += 1;
  }
  return buckets;
}

/* -------------------------------------------------------------------------- */
/* Subject ranking                                                             */
/* -------------------------------------------------------------------------- */

export interface SubjectRank {
  courseId: string;
  name: string;
  color: string;
  /** 0-100, dominated by how questions were actually answered. */
  mastery: number;
  label: MasteryLabel;
  /** Questions answered across quizzes and practice exams. */
  answered: number;
  /** Of those, how many were right. */
  correct: number;
  attempts: number;
  cards: number;
  dueNow: number;
  /** Cards forgotten after being learned — the clearest weakness signal. */
  lapses: number;
  materials: number;
  /**
   * False when there's too little answered to rank honestly. A handful of
   * questions is not a pattern, and naming a weakest subject on that basis
   * sends a student to revise the wrong thing.
   */
  confident: boolean;
}

/** Questions answered before a subject is ranked rather than just listed. */
export const RANK_MIN_ANSWERED = 10;

/** A graded paper: practice exams and marked exam reviews both fit this. */
export interface GradedPaper {
  materialIds: string[];
  awarded: number;
  total: number;
  createdAt: number;
}

export interface SubjectInput {
  id: string;
  name: string;
  color: string;
  materialIds: string[];
}

export interface SubjectSignals {
  attempts: AttemptLike[];
  cards: ReviewCard[];
  papers?: GradedPaper[];
}

/**
 * How a subject is actually going.
 *
 * Weighted hard toward answered questions, because that's the only signal that
 * reflects whether the student can do the thing. Two adjustments matter:
 *
 *   - Questions, not quizzes. A twenty-question paper says more than a
 *     four-question one, so accuracy is weighted by how much was answered
 *     rather than treating every attempt as one vote.
 *   - Recency, with a long tail. Last week's score matters more than last
 *     month's, but not so much that one bad afternoon erases a term — each
 *     step back halves the weight, and nothing is dropped outright the way a
 *     fixed five-attempt window does.
 *
 * Review retention is folded in at a fifth: it says whether something stuck
 * after it was learned, which answered questions alone can't tell you.
 */
export function subjectMastery(signals: SubjectSignals): {
  mastery: number;
  answered: number;
  correct: number;
} {
  const graded: GradedPaper[] = [
    ...signals.attempts.map((a) => ({
      materialIds: a.materialIds,
      awarded: a.score,
      total: a.total,
      createdAt: a.createdAt,
    })),
    ...(signals.papers ?? []),
  ].filter((p) => p.total > 0);

  const answered = graded.reduce((sum, p) => sum + p.total, 0);
  const correct = graded.reduce((sum, p) => sum + p.awarded, 0);

  // Newest first, so the halving below is by how far back a paper is.
  const ordered = [...graded].sort((a, b) => b.createdAt - a.createdAt);

  let weighted = 0;
  let weights = 0;
  ordered.forEach((paper, index) => {
    // Size × recency: a big recent paper dominates, an old short one barely
    // registers, and nothing falls off a cliff.
    const weight = paper.total * Math.pow(0.5, index / 4);
    weighted += weight * (paper.awarded / paper.total);
    weights += weight;
  });
  const accuracy = weights > 0 ? weighted / weights : null;

  const health = cardHealth(signals.cards);

  if (accuracy === null && health === null) {
    return { mastery: 0, answered, correct };
  }

  const parts: Array<[number, number]> = [];
  if (accuracy !== null) parts.push([accuracy, 0.8]);
  if (health !== null) parts.push([health, 0.2]);
  const weightSum = parts.reduce((sum, [, w]) => sum + w, 0);
  const blended = parts.reduce((sum, [v, w]) => sum + v * w, 0) / weightSum;

  return { mastery: Math.round(blended * 100), answered, correct };
}

/**
 * Ranks subjects strongest to weakest.
 *
 * Pooled across everything filed under a subject rather than averaging
 * per-file averages, which would let one four-question file outvote a whole
 * term of notes.
 */
export function rankSubjects(
  subjects: SubjectInput[],
  attempts: AttemptLike[],
  cards: ReviewCard[],
  now: number = Date.now(),
  papers: GradedPaper[] = [],
): SubjectRank[] {
  return subjects
    .map((subject) => {
      const ids = new Set(subject.materialIds);
      const own = attempts.filter((a) => a.materialIds.some((id) => ids.has(id)));
      const ownPapers = papers.filter((p) => p.materialIds.some((id) => ids.has(id)));
      const ownCards = cards.filter((c) => c.materialIds.some((id) => ids.has(id)));

      const { mastery, answered, correct } = subjectMastery({
        attempts: own,
        cards: ownCards,
        papers: ownPapers,
      });

      return {
        courseId: subject.id,
        name: subject.name,
        color: subject.color,
        mastery,
        label: masteryLabel(mastery, answered > 0 || ownCards.length > 0),
        answered,
        correct,
        attempts: own.length + ownPapers.length,
        cards: ownCards.length,
        dueNow: ownCards.filter((c) => isDue(c, now)).length,
        lapses: ownCards.reduce((sum, c) => sum + c.lapses, 0),
        materials: subject.materialIds.length,
        confident: answered >= RANK_MIN_ANSWERED,
      };
    })
    .sort((a, b) => {
      // Ranked subjects first, then by mastery; unranked keep a stable order.
      if (a.confident !== b.confident) return a.confident ? -1 : 1;
      return b.mastery - a.mastery || a.name.localeCompare(b.name);
    });
}
