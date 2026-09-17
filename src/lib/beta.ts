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
