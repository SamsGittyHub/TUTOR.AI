import { DAY_MS, startOfDay } from "./srs";

/**
 * Turning an exam date into a study plan.
 *
 * The shape is deliberately the one a tutor would sketch on paper: spread the
 * topics over the days you have, revisit each one a second time closer to the
 * exam, and put a full review the day before. It is not an optimizer — it is a
 * schedule a student will actually follow, which is a different thing.
 *
 * Pure functions only, same constraint as srs.ts and progress.ts, so the test
 * runner can compile this standalone.
 */

export interface PlanInput {
  /** Exam timestamp. */
  examAt: number;
  /** What the exam covers. One block per topic per pass. */
  topics: string[];
  /** Minutes the student can give it on a normal day. */
  minutesPerDay?: number;
  /** How long one sitting should be. */
  blockMinutes?: number;
  /** Days per week available; 7 means every day. */
  now?: number;
}

export interface PlannedBlock {
  title: string;
  topic?: string;
  startsAt: number;
  minutes: number;
  /** Which pass over the material this is. */
  pass: 1 | 2 | "review";
}

const DEFAULT_BLOCK_MINUTES = 45;
const DEFAULT_MINUTES_PER_DAY = 90;

/** Study days between now and the exam, excluding the exam day itself. */
export function studyDays(examAt: number, now: number): number[] {
  const first = startOfDay(now);
  const last = startOfDay(examAt);
  const days: number[] = [];
  for (let d = first; d < last; d += DAY_MS) days.push(d);
  return days;
}

/**
 * Spreads topics across the available days in two passes plus a final review.
 *
 * With very little time the second pass is dropped before the first — seeing
 * everything once beats seeing half of it twice.
 */
export function buildPlan(input: PlanInput): PlannedBlock[] {
  const now = input.now ?? Date.now();
  const blockMinutes = input.blockMinutes ?? DEFAULT_BLOCK_MINUTES;
  const perDay = Math.max(1, Math.floor(
    (input.minutesPerDay ?? DEFAULT_MINUTES_PER_DAY) / blockMinutes,
  ));

  const topics = input.topics.map((t) => t.trim()).filter(Boolean);
  const days = studyDays(input.examAt, now);
  if (!days.length || !topics.length) return [];

  const capacity = days.length * perDay;
  // Reserve the last day for review whenever there's more than one day.
  const reviewSlots = days.length > 1 ? Math.min(perDay, topics.length) : 0;
  const teachingCapacity = Math.max(0, capacity - reviewSlots);

  const wanted: Array<{ topic: string; pass: 1 | 2 }> = [
    ...topics.map((topic) => ({ topic, pass: 1 as const })),
    ...topics.map((topic) => ({ topic, pass: 2 as const })),
  ];
  // Drop second-pass blocks first when the calendar is tight.
  const scheduled = wanted.slice(0, Math.max(0, teachingCapacity));

  const blocks: PlannedBlock[] = [];
  const reviewDay = days.length > 1 ? days[days.length - 1] : null;
  const teachingDays = reviewDay ? days.slice(0, -1) : days;

  // Spread the sittings across the whole window rather than packing the first
  // few days and leaving a dead stretch before the exam — the gap between
  // seeing a topic and seeing it again is the part that does the work.
  const perDayNeeded = Math.min(
    perDay,
    Math.max(1, Math.ceil(scheduled.length / Math.max(1, teachingDays.length))),
  );

  let cursor = 0;
  for (const day of teachingDays) {
    const remainingDays = teachingDays.length - teachingDays.indexOf(day);
    const remaining = scheduled.length - cursor;
    // Take the even share, but never leave more than the remaining days can hold.
    const take = Math.min(
      perDay,
      Math.max(perDayNeeded, Math.ceil(remaining / remainingDays)),
      remaining,
    );
    for (let slot = 0; slot < take; slot += 1) {
      const item = scheduled[cursor];
      cursor += 1;
      blocks.push({
        title:
          item.pass === 1 ? `Learn: ${item.topic}` : `Second pass: ${item.topic}`,
        topic: item.topic,
        // Sittings sit at 16:00, 17:00, … so the day reads in order.
        startsAt: day + (16 + slot) * 3600_000,
        minutes: blockMinutes,
        pass: item.pass,
      });
    }
  }

  // Anything that didn't fit on a teaching day goes onto the review day too.
  if (reviewDay) {
    let slot = 0;
    for (; cursor < scheduled.length && slot < perDay; cursor += 1, slot += 1) {
      const item = scheduled[cursor];
      blocks.push({
        title: `Second pass: ${item.topic}`,
        topic: item.topic,
        startsAt: reviewDay + (16 + slot) * 3600_000,
        minutes: blockMinutes,
        pass: item.pass,
      });
    }
    if (slot < perDay) {
      blocks.push({
        title: "Full review — everything on the exam",
        startsAt: reviewDay + (16 + slot) * 3600_000,
        minutes: blockMinutes,
        pass: "review",
      });
    }
  }

  return blocks;
}

/** Human summary for the confirmation line above a generated plan. */
export function describePlan(blocks: PlannedBlock[]): string {
  if (!blocks.length) return "No time left to plan — the exam is today or tomorrow.";
  const days = new Set(blocks.map((b) => startOfDay(b.startsAt))).size;
  const hours = Math.round((blocks.reduce((s, b) => s + b.minutes, 0) / 60) * 10) / 10;
  return `${blocks.length} sittings across ${days} day${days === 1 ? "" : "s"} — about ${hours} hours.`;
}
