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

/** Live voice runs on OpenAI's realtime model — same shared key. */
export const BETA_REALTIME_MODEL = "gpt-5.6-terra";

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
