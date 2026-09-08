/**
 * The review scheduler — a trimmed-down SM-2.
 *
 * Every quiz question becomes a card. Answer it right and it comes back after
 * 1 day, then 3, then roughly interval × ease — the gaps stretch as the fact
 * proves it sticks. Miss it and it's back tomorrow, no ceremony. The numbers
 * are deliberately boring: this has to feel like a helpful queue, not a system
 * to maintain.
 *
 * Pure functions only — no IndexedDB, no DOM — so the test runner can compile
 * this file standalone.
 */

export const DAY_MS = 86_400_000;
export const MAX_INTERVAL_DAYS = 180;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;

export interface ReviewCard {
  id: string;
  /** Normalized prompt — the dedupe key. Regenerating a near-identical quiz
   *  must reschedule the existing card, not pile up copies. */
  promptKey: string;
  materialIds: string[];
  prompt: string;
  choices?: string[];
  answer: string;
  explanation?: string;
  sourceLocator?: string;
  createdAt: number;
  dueAt: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

/** The slice of QuizQuestion a card needs, kept structural for pure testing. */
export interface QuestionLike {
  prompt: string;
  choices?: string[];
  answer: string;
  explanation?: string;
  sourceLocator?: string;
}

/** Collapse a prompt to its comparable core: letters and numbers only. */
export function promptKeyOf(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfTomorrow(now: number): number {
  return startOfDay(now) + DAY_MS;
}

export function endOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** A card is due if its time has come — today counts, tomorrow doesn't. */
export function isDue(card: ReviewCard, now: number = Date.now()): boolean {
  return card.dueAt <= endOfToday(now);
}

/** Apply one grade to a card and return the rescheduled copy. */
export function schedule(
  card: ReviewCard,
  correct: boolean,
  now: number = Date.now(),
): ReviewCard {
  const next: ReviewCard = { ...card };

  if (correct) {
    next.reps = card.reps + 1;
    next.intervalDays =
      card.reps === 0 ? 1 : card.reps === 1 ? 3 : Math.min(Math.round(card.intervalDays * card.ease), MAX_INTERVAL_DAYS);
    next.ease = Math.min(MAX_EASE, round2(card.ease + 0.15));
    next.dueAt = startOfTomorrow(now) + (next.intervalDays - 1) * DAY_MS;
  } else {
    next.reps = 0;
    next.lapses = card.lapses + 1;
    next.intervalDays = 1;
    next.ease = Math.max(MIN_EASE, round2(card.ease - 0.2));
    next.dueAt = startOfTomorrow(now);
  }

  return next;
}

export function newCard(
  id: string,
  question: QuestionLike,
  materialIds: string[],
  correct: boolean,
  now: number = Date.now(),
): ReviewCard {
  const base: ReviewCard = {
    id,
    promptKey: promptKeyOf(question.prompt),
    materialIds: [...materialIds],
    prompt: question.prompt,
    choices: question.choices,
    answer: question.answer,
    explanation: question.explanation,
    sourceLocator: question.sourceLocator,
    createdAt: now,
    dueAt: now,
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
  };
  return schedule(base, correct, now);
}

/**
 * Grade a question into a card list. An exact prompt match refreshes the
 * existing card's content and applies the grade; anything else inserts.
 */
export function upsertCard(
  existing: ReviewCard[],
  question: QuestionLike,
  materialIds: string[],
  correct: boolean,
  now: number,
  newId: string,
): { cards: ReviewCard[]; card: ReviewCard; created: boolean } {
  const key = promptKeyOf(question.prompt);
  const index = existing.findIndex((c) => c.promptKey === key);

  if (index === -1) {
    const card = newCard(newId, question, materialIds, correct, now);
    return { cards: [...existing, card], card, created: true };
  }

  const card = schedule(
    {
      ...existing[index],
      materialIds: [...materialIds],
      choices: question.choices,
      answer: question.answer,
      explanation: question.explanation,
      sourceLocator: question.sourceLocator,
    },
    correct,
    now,
  );
  const cards = [...existing];
  cards[index] = card;
  return { cards, card, created: false };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
