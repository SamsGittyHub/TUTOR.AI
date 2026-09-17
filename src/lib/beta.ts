import type { ProviderId } from "./providers/types";

/**
 * Free-beta mode.
 *
 * While this is true the tutor runs on one shared key that lives only on the
 * server (src/lib/server/beta-key.ts): every model call is proxied through
 * /api/llm for signed-in users, and the API-key section of Settings is
 * disabled. Flip BETA to false to go back to bring-your-own-key.
 */

export const BETA = true;

export const BETA_PROVIDER: ProviderId = "openai";
export const BETA_MODEL = "gpt-5.6-terra";

/**
 * Live voice runs on OpenAI's speech-to-speech model, on the same shared key.
 * This is a different model from the chat one: the Realtime API works on audio
 * directly rather than transcribing, which is what makes barge-in feel like
 * interrupting a person instead of cancelling a playback.
 */
export const BETA_REALTIME_MODEL = "gpt-realtime-2.1-mini";

/** Output voice. Fixed for now; a picker is a settings question, not a code one. */
export const BETA_REALTIME_VOICE = "alloy";

/**
 * Pictures on the board.
 *
 * The live tutor draws its own illustrations — a labelled cross-section, a
 * free-body diagram, the thing the student can't picture — rather than only
 * the shapes the board can render from JSON. Same shared key, same daily cap.
 */
export const BETA_IMAGE_MODEL = "gpt-image-2.5-flare-2026-09-08";

/**
 * The typed board's voice, both directions.
 *
 * It used to run on the browser's own speechSynthesis and SpeechRecognition:
 * free, but a robot reading in Chrome and Edge and silence everywhere else,
 * and no idea what language the lesson was in. These are the same models the
 * live session uses, on the same shared key, so the typed board sounds like
 * the spoken one and works in any browser.
 */
export const BETA_TTS_MODEL = "gpt-4o-mini-tts-2025-12-15";
export const BETA_TTS_VOICE = "alloy";
export const BETA_STT_MODEL = "gpt-realtime-whisper";

/**
 * The key a call should use.
 *
 * In beta there is nothing to send — the gateway injects the real one — so a
 * placeholder keeps the provider signatures unchanged. Outside beta this is
 * the student's own key, and an empty string still means "ask for one".
 */
export function keyFor(stored: string | undefined): string {
  return BETA ? stored || "beta" : (stored ?? "");
}

/** Whether the tutor can run at all right now. */
export function hasUsableKey(stored: string | undefined): boolean {
  return BETA || Boolean(stored);
}
