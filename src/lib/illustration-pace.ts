/**
 * How often the tutor reaches for a picture.
 *
 * Drawing had to be forced before it happened at all: the model was asked
 * nicely, then reminded every turn, and when neither worked a separate
 * deterministic pass was added that asked "should this have a picture?" after
 * any turn that drew nothing. That pass works — which is the problem. Almost
 * every topic contains *something* physical if you look hard enough, so the
 * honest answer is nearly always yes, and a lesson turned into a slideshow.
 *
 * Frequency is a teaching decision, not a modelling one, so it's made here
 * rather than asked for in a prompt. A picture is worth looking at partly
 * because the last three things weren't pictures.
 *
 * The one thing that always overrides the cadence is being asked. A student
 * who says "show me what that looks like" gets a picture on that turn, no
 * matter how recently the last one went up.
 */

/** A transcript line, as far as this module needs to know. */
export interface PacedLine {
  role: "student" | "tutor";
  text: string;
}

/**
 * Tutor turns that must pass after a picture before another is offered.
 *
 * Three means a picture, then two turns taught without one, then a picture is
 * available again — roughly one in three questions, and never two in a row.
 */
export const TURNS_BETWEEN_PICTURES = 3;

/**
 * How a picture announces itself in a transcript line.
 *
 * Deliberately anchored to the board prefix that actionToText writes rather
 * than matching the bare words: a tutor who says "look at the picture of the
 * heart on the left" is talking about a picture, not drawing one, and would
 * otherwise suppress the next.
 */
export const PICTURE_IN_TRANSCRIPT = /\[board:[^\]]*\] picture of /;

const ASKED_FOR_ONE =
  /\b(?:draw|sketch|illustrate|illustration|diagram|picture|image|photo|visuali[sz]e)\b|\bshow me\b|\bwhat (?:does|do|did|would) .{0,40}look like\b/i;

/** True when the student asked for something to look at, in so many words. */
export function askedForPicture(message: string): boolean {
  return ASKED_FOR_ONE.test(message);
}

/**
 * Tutor turns since the last one that put a picture up, or null if none has.
 *
 * The most recent tutor turn counts as 1, so a picture drawn last turn gives
 * 1 — the smallest possible gap, and the one worth refusing.
 */
export function turnsSincePicture(transcript: readonly PacedLine[]): number | null {
  let turns = 0;
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const line = transcript[i];
    if (line.role !== "tutor") continue;
    turns += 1;
    if (PICTURE_IN_TRANSCRIPT.test(line.text)) return turns;
  }
  return null;
}

/** Whether the cadence alone allows a picture this turn. */
export function pictureIsDue(turnsSince: number | null): boolean {
  return turnsSince === null || turnsSince >= TURNS_BETWEEN_PICTURES;
}

/** The whole decision: asked for, or far enough from the last one. */
export function shouldOfferPicture(
  transcript: readonly PacedLine[],
  studentMessage: string,
): boolean {
  return (
    askedForPicture(studentMessage) || pictureIsDue(turnsSincePicture(transcript))
  );
}
