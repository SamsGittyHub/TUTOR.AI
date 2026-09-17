/**
 * Reminding a student that cards are due.
 *
 * The scheduler has always known what's ripe today and the calendar has always
 * known what's coming, and neither ever reached the student — which makes
 * spaced repetition a thing that works only for people who were going to open
 * the app anyway, i.e. the people who needed it least.
 *
 * The rules are here, away from the Notification API, because the ones that
 * matter are about restraint: a reminder that fires twice in a day, or fires
 * when nothing is due, gets permission revoked and never fires again.
 */

export const REMINDER_KEY = "tutor-ai.last-reminded";

/** Local midnight, so "once a day" means what a student would expect. */
function dayOf(at: number): string {
  return new Date(at).toDateString();
}

/**
 * Whether to show a reminder now.
 *
 * Once per calendar day, only when something is actually due, and never for a
 * queue the student has already cleared.
 */
export function shouldRemind(
  lastRemindedAt: number | null,
  dueCount: number,
  now: number = Date.now(),
): boolean {
  if (dueCount <= 0) return false;
  if (lastRemindedAt === null) return true;
  return dayOf(lastRemindedAt) !== dayOf(now);
}

/** What the reminder says. Specific, because "you have reviews" is ignorable. */
export function reminderText(dueCount: number): { title: string; body: string } {
  return {
    title: dueCount === 1 ? "1 card is ready" : `${dueCount} cards are ready`,
    body:
      dueCount === 1
        ? "One question you got wrong is due for another go."
        : "They're due now because that's when you'd be about to forget them.",
  };
}
