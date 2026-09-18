import "server-only";

/**
 * Shared beta key. Keep it server-only and sourced from the deployment
 * environment, never from the repo. In Railway this is configured as an env
 * var (for example OPENAI_API_KEY), so the server can use it without exposing
 * the secret in code or git history.
 */

const rawKey =
  process.env.OPENAI_API_KEY ??
  process.env.BETA_OPENAI_KEY ??
  process.env.TUTOR_AI_OPENAI_KEY ??
  "";

export const BETA_OPENAI_KEY = rawKey.trim();

/** The model the beta runs on, shared by the gateway and the translator. */
export const BETA_CHAT_MODEL = "gpt-5.6-terra";

export function hasBetaOpenAiKey(): boolean {
  return BETA_OPENAI_KEY.length > 0;
}
