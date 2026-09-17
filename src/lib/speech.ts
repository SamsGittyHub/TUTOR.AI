/**
 * The rules behind the board's voice, in both directions.
 *
 * Two problems worth separating from the browser plumbing that surrounds them:
 *
 *   - What the tutor should actually say. A board card is written to be read,
 *     not heard: raw LaTeX out loud is a stream of backslashes, and markdown
 *     punctuation is worse.
 *   - When the student has stopped talking. There is no isFinal from a
 *     recogniser any more — the microphone produces a level and this decides
 *     where one utterance ends, which is the difference between a tutor that
 *     answers and one that interrupts.
 *
 * Pure and dependency-free, so both can be tested without a microphone.
 */

/* -------------------------------------------------------------------------- */
/* What to say                                                                 */
/* -------------------------------------------------------------------------- */

const MAX_SPOKEN = 1200;

/**
 * A board line as something worth hearing.
 *
 * Symbols are named rather than spelled: "x squared" is what a teacher says,
 * and "x caret two" is what an unfiltered reader says. Anything left over that
 * is plainly notation becomes the word "formula", which is at least honest.
 */
export function stripForSpeech(text: string): string {
  return text
    // Display and inline maths, in either delimiter.
    .replace(/\$\$[^$]*\$\$/g, " formula ")
    .replace(/\$[^$\n]{1,200}\$/g, " formula ")
    .replace(/\\\[[\s\S]*?\\\]/g, " formula ")
    .replace(/\\\((.*?)\\\)/g, " formula ")
    // Markdown that carries no meaning aloud.
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\s]*/gm, "")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    // Anything still wearing a backslash is notation nobody wants read out.
    .replace(/\\[a-zA-Z]+/g, " formula ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPOKEN);
}

/**
 * True when a line has something left worth playing audio for.
 *
 * A line that was nothing but notation strips down to the word "formula", and
 * hearing "formula" on its own tells the student nothing while still costing a
 * round trip to say it.
 */
export function worthSpeaking(text: string): boolean {
  const spoken = stripForSpeech(text)
    .replace(/\b(formula|code)\b/g, " ")
    .replace(/[^a-zA-Z0-9]/g, "");
  return spoken.length > 1;
}

/**
 * How the tutor should sound.
 *
 * gpt-4o-mini-tts takes direction as well as text, which is the whole reason
 * to leave the browser's reader behind: this is a person explaining something
 * at a board, not a screen reader getting through a paragraph.
 */
export const TUTOR_VOICE_INSTRUCTIONS =
  "Speak as a patient tutor standing at a whiteboard with one student: warm, " +
  "unhurried, and clear. Land the key word of each sentence. Pause briefly at " +
  "full stops, as if giving them a moment to look at what you just wrote. " +
  "Never sound like a narrator reading a script.";

/* -------------------------------------------------------------------------- */
/* When the student has finished speaking                                      */
/* -------------------------------------------------------------------------- */

export interface ListenSettings {
  /** Level above which the microphone is carrying speech, not room noise. */
  threshold: number;
  /** Quiet time that ends an utterance. */
  silenceMs: number;
  /** Below this, an utterance is a cough or a door and is thrown away. */
  minSpeechMs: number;
  /** Above this, cut anyway — a long answer still has to be transcribed. */
  maxSpeechMs: number;
}

export const LISTEN_DEFAULTS: ListenSettings = {
  // Chosen against a normal laptop microphone: keyboard noise sits well below
  // this, and speech at arm's length sits well above it.
  threshold: 0.018,
  // Long enough to survive the pause in the middle of a sentence, short enough
  // that the tutor doesn't feel slow to answer.
  silenceMs: 900,
  minSpeechMs: 350,
  maxSpeechMs: 30_000,
};

export interface ListenState {
  speaking: boolean;
  /** When the current utterance began. */
  startedAt: number;
  /** The last moment the level was above the threshold. */
  lastVoiceAt: number;
}

export const IDLE_LISTENING: ListenState = {
  speaking: false,
  startedAt: 0,
  lastVoiceAt: 0,
};

export type ListenAction = "none" | "start" | "stop" | "discard";

/**
 * One tick of the microphone level.
 *
 * Returns the next state and what the recorder should do about it. Written as
 * a fold over (state, level, now) rather than as timers inside the hook, so
 * the awkward cases — a cough, a pause mid-sentence, someone who doesn't stop
 * talking — can be tested by feeding it numbers.
 */
export function advanceListening(
  state: ListenState,
  level: number,
  now: number,
  settings: ListenSettings = LISTEN_DEFAULTS,
): { state: ListenState; action: ListenAction } {
  const loud = level >= settings.threshold;

  if (!state.speaking) {
    if (!loud) return { state, action: "none" };
    return {
      state: { speaking: true, startedAt: now, lastVoiceAt: now },
      action: "start",
    };
  }

  if (loud) {
    return { state: { ...state, lastVoiceAt: now }, action: "none" };
  }

  const quietFor = now - state.lastVoiceAt;
  const spokeFor = state.lastVoiceAt - state.startedAt;

  if (now - state.startedAt >= settings.maxSpeechMs) {
    return { state: IDLE_LISTENING, action: "stop" };
  }
  if (quietFor < settings.silenceMs) return { state, action: "none" };

  // Long enough to be a sentence, or short enough to be a chair scraping.
  return {
    state: IDLE_LISTENING,
    action: spokeFor >= settings.minSpeechMs ? "stop" : "discard",
  };
}

/** Root-mean-square level of one analyser frame, 0..1. */
export function levelOf(samples: Float32Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
