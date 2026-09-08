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
