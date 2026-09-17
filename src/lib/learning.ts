/**
 * What this student, specifically, learns from.
 *
 * Two different kinds of knowledge, kept in one file per account:
 *
 *   - **Counted.** Every turn uses some mix of card types — a diagram, a
 *     worked set of steps, a generated picture — and the student's next
 *     message says whether it landed or whether they came back confused.
 *     Tallied over a term, that is a far better answer to "does this person
 *     learn from pictures?" than asking them would be.
 *   - **Noticed.** Things a tally can never see: that they need the units
 *     written beside every number, that they get there faster when asked
 *     before being told. The tutor writes those down itself.
 *
 * Both are fed back into the next lesson's prompt. The point is a tutor who
 * has taught you before and remembers how it went — which is most of what
 * separates a tutor from a search engine.
 *
 * Pure and dependency-free: the rules live here, the storage lives elsewhere,
 * and the awkward parts are testable without an account.
 */

/** The card types whose effect on understanding is worth counting. */
export const TEACHING_MODES = [
  "write_text",
  "write_equation",
  "write_steps",
  "write_table",
  "draw_diagram",
  "draw_plot",
  "show_image",
  "ask_question",
] as const;

export type TeachingMode = (typeof TEACHING_MODES)[number];

/** How a mode has actually gone for this student. */
export interface ModeTally {
  /** Turns that used it. */
  shown: number;
  /** ...and the student carried on. */
  landed: number;
  /** ...and the student came back confused. */
  confused: number;
}

export interface LearningNote {
  id: string;
  text: string;
  /** Times this has been observed. A repeated note outranks a one-off. */
  seen: number;
  at: number;
}

export interface LearningProfile {
  modes: Partial<Record<TeachingMode, ModeTally>>;
  notes: LearningNote[];
  updatedAt: number;
}

export type Reaction = "landed" | "confused";

/** Below this, a mode's record is an anecdote and is not reported as a finding. */
export const MIN_MODE_SHOWN = 5;

/**
 * Where a tally starts being halved.
 *
 * Without this, how someone learned in September outvotes how they learn now
 * for the rest of the year. Halving keeps the shape of the record while
 * letting recent lessons actually move it.
 */
const DECAY_AT = 40;

/** How many notes are kept. Beyond this the oldest, least-seen ones go. */
export const MAX_NOTES = 24;

const MAX_NOTE_CHARS = 220;

export function emptyProfile(now: number = Date.now()): LearningProfile {
  return { modes: {}, notes: [], updatedAt: now };
}

export function isTeachingMode(value: unknown): value is TeachingMode {
  return TEACHING_MODES.includes(value as TeachingMode);
}

/* -------------------------------------------------------------------------- */
/* Counting                                                                    */
/* -------------------------------------------------------------------------- */

function decay(tally: ModeTally): ModeTally {
  if (tally.shown < DECAY_AT) return tally;
  return {
    shown: Math.round(tally.shown / 2),
    landed: Math.round(tally.landed / 2),
    confused: Math.round(tally.confused / 2),
  };
}

/**
 * Records how one turn went.
 *
 * `modes` is what the tutor actually put on the board that turn; `reaction` is
 * read from what the student said next. A turn that used three card types
 * credits all three — there is no way to know which one did the work, and over
 * enough turns the mixture washes out.
 */
export function recordTurn(
  profile: LearningProfile,
  modes: TeachingMode[],
  reaction: Reaction,
  now: number = Date.now(),
): LearningProfile {
  if (!modes.length) return profile;

  const next: Partial<Record<TeachingMode, ModeTally>> = { ...profile.modes };
  for (const mode of new Set(modes)) {
    const current = next[mode] ?? { shown: 0, landed: 0, confused: 0 };
    next[mode] = decay({
      shown: current.shown + 1,
      landed: current.landed + (reaction === "landed" ? 1 : 0),
      confused: current.confused + (reaction === "confused" ? 1 : 0),
    });
  }
  return { ...profile, modes: next, updatedAt: now };
}

export interface ModeStanding {
  mode: TeachingMode;
  shown: number;
  /** Share of turns the student carried on from, 0..1. */
  rate: number;
  /** False while the record is still too thin to mean anything. */
  confident: boolean;
}

/**
 * Modes ranked by how well they've worked, best first.
 *
 * Thin records are ranked last rather than hidden, so a mode the tutor has
 * barely tried doesn't look like one that failed.
 */
export function modeRanking(profile: LearningProfile): ModeStanding[] {
  return Object.entries(profile.modes)
    .map(([mode, tally]) => ({
      mode: mode as TeachingMode,
      shown: tally.shown,
      rate: tally.shown ? tally.landed / tally.shown : 0,
      confident: tally.shown >= MIN_MODE_SHOWN,
    }))
    .sort((a, b) => {
      if (a.confident !== b.confident) return a.confident ? -1 : 1;
      return b.rate - a.rate || b.shown - a.shown;
    });
}

/* -------------------------------------------------------------------------- */
/* Noticing                                                                    */
/* -------------------------------------------------------------------------- */

/** Comparable form of a note, for spotting the same observation twice. */
function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    // Short words carry no meaning here, but a digit always does: "needs two
    // worked examples" and "needs three worked examples" are different notes.
    .filter((word) => word.length > 3 || /\d/.test(word))
    .sort()
    .join(" ");
}

/**
 * Writes down something the tutor noticed.
 *
 * The same observation made again bumps its count rather than adding a second
 * copy — a memory that fills up with six phrasings of "likes diagrams" is a
 * memory the next lesson's prompt can't use.
 */
export function rememberNote(
  profile: LearningProfile,
  text: string,
  now: number = Date.now(),
): LearningProfile {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);
  if (clean.length < 8) return profile;

  const key = fingerprint(clean);
  const existing = profile.notes.find((note) => fingerprint(note.text) === key);

  const notes = existing
    ? profile.notes.map((note) =>
        note === existing ? { ...note, seen: note.seen + 1, at: now } : note,
      )
    : [
        ...profile.notes,
        { id: `n_${now.toString(36)}_${profile.notes.length}`, text: clean, seen: 1, at: now },
      ];

  // Over the cap, the least reinforced and oldest go first.
  const kept =
    notes.length <= MAX_NOTES
      ? notes
      : [...notes].sort((a, b) => b.seen - a.seen || b.at - a.at).slice(0, MAX_NOTES);

  return { ...profile, notes: kept, updatedAt: now };
}

export function forgetNote(
  profile: LearningProfile,
  id: string,
  now: number = Date.now(),
): LearningProfile {
  return {
    ...profile,
    notes: profile.notes.filter((note) => note.id !== id),
    updatedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/* Telling the tutor                                                           */
/* -------------------------------------------------------------------------- */

const MODE_NAMES: Record<TeachingMode, string> = {
  write_text: "written explanation",
  write_equation: "a bare equation",
  write_steps: "step-by-step working",
  write_table: "a comparison table",
  draw_diagram: "a diagram",
  draw_plot: "a plot",
  show_image: "a generated picture",
  ask_question: "asking them a question",
};

export function modeName(mode: TeachingMode): string {
  return MODE_NAMES[mode] ?? mode;
}

/** Rates above this are working; below the other one, they are not. */
const GOOD_RATE = 0.7;
const POOR_RATE = 0.45;

/**
 * The block folded into the next lesson's system prompt.
 *
 * Deliberately written as findings with the evidence attached, not as orders.
 * A model told "always use pictures" will illustrate an algebra rearrangement;
 * one told "pictures have landed 9 times out of 10 for this student" uses its
 * judgement, which is what it is for.
 */
export function describeLearning(profile: LearningProfile): string {
  const ranked = modeRanking(profile).filter((m) => m.confident);
  const lines: string[] = [];

  const working = ranked.filter((m) => m.rate >= GOOD_RATE);
  const not = ranked.filter((m) => m.rate < POOR_RATE);

  for (const standing of working) {
    lines.push(
      `- ${modeName(standing.mode)} works: they carried on ${Math.round(
        standing.rate * 100,
      )}% of the ${standing.shown} times you used it.`,
    );
  }
  for (const standing of not) {
    lines.push(
      `- ${modeName(standing.mode)} tends not to: they came back confused after ${Math.round(
        (1 - standing.rate) * 100,
      )}% of the ${standing.shown} times you used it.`,
    );
  }

  const notes = [...profile.notes].sort((a, b) => b.seen - a.seen || b.at - a.at);
  const noted = notes.map(
    (note) => `- ${note.text}${note.seen > 1 ? ` (noticed ${note.seen} times)` : ""}`,
  );

  if (!lines.length && !noted.length) return "";

  const parts = [
    `## How this student learns

You have taught this person before. This is what you worked out, from what
actually happened rather than from what they said they preferred.`,
  ];
  if (lines.length) parts.push(lines.join("\n"));
  if (noted.length) parts.push(`Things you noticed:\n${noted.join("\n")}`);
  parts.push(
    `Treat this as evidence, not as orders — a picture is still wrong for an
algebra rearrangement. When something new shows up, record it with a
"remember" action; one short, specific sentence, and only when you've seen it
more than once.`,
  );

  return parts.join("\n\n");
}

/** A line or two for the live tutor, which has no room for the full block. */
export function briefLearning(profile: LearningProfile): string {
  const ranked = modeRanking(profile).filter((m) => m.confident);
  const best = ranked.filter((m) => m.rate >= GOOD_RATE).slice(0, 2);
  const worst = ranked.filter((m) => m.rate < POOR_RATE).slice(0, 1);
  const top = [...profile.notes].sort((a, b) => b.seen - a.seen).slice(0, 3);

  const bits: string[] = [];
  if (best.length) bits.push(`Learns well from ${best.map((m) => modeName(m.mode)).join(" and ")}.`);
  if (worst.length) bits.push(`${worst.map((m) => modeName(m.mode)).join(", ")} tends to lose them.`);
  for (const note of top) bits.push(note.text);
  return bits.join(" ");
}

/* -------------------------------------------------------------------------- */
/* Storage shape                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Reads a profile back from whatever the database returned.
 *
 * This row is written by one version of the app and read by the next, and a
 * malformed field must degrade to an empty memory rather than take a lesson
 * down with it.
 */
export function parseProfile(raw: unknown, now: number = Date.now()): LearningProfile {
  if (!raw || typeof raw !== "object") return emptyProfile(now);
  const record = raw as Record<string, unknown>;

  const modes: Partial<Record<TeachingMode, ModeTally>> = {};
  if (record.modes && typeof record.modes === "object") {
    for (const [key, value] of Object.entries(record.modes as Record<string, unknown>)) {
      if (!isTeachingMode(key) || !value || typeof value !== "object") continue;
      const tally = value as Record<string, unknown>;
      const shown = Number(tally.shown) || 0;
      if (shown <= 0) continue;
      modes[key] = {
        shown,
        landed: Math.min(shown, Number(tally.landed) || 0),
        confused: Math.min(shown, Number(tally.confused) || 0),
      };
    }
  }

  const notes: LearningNote[] = Array.isArray(record.notes)
    ? record.notes
        .map((raw, index): LearningNote | null => {
          if (!raw || typeof raw !== "object") return null;
          const note = raw as Record<string, unknown>;
          const text = String(note.text ?? "").replace(/\s+/g, " ").trim();
          if (text.length < 8) return null;
          return {
            id: String(note.id ?? `n_${index}`),
            text: text.slice(0, MAX_NOTE_CHARS),
            seen: Math.max(1, Number(note.seen) || 1),
            at: Number(note.at) || now,
          };
        })
        .filter((note): note is LearningNote => note !== null)
        .slice(0, MAX_NOTES)
    : [];

  return { modes, notes, updatedAt: Number(record.updatedAt) || now };
}
