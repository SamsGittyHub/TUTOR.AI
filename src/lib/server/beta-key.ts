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

/* -------------------------------------------------------------------------- */
/* Spending limits                                                             */
/* -------------------------------------------------------------------------- */

/**
 * On a shared key every request is the operator's money, and one enthusiastic
 * tester can burn a budget in an afternoon. So each call is metered per user
 * per UTC day and refused past a cap — checked before the upstream call, so a
 * capped account never costs anything.
 */

/** Roughly a long afternoon of lessons. Override with TUTOR_AI_DAILY_TOKEN_LIMIT. */
const DEFAULT_DAILY_TOKEN_LIMIT = 300_000;

export function dailyTokenLimit(): number {
  const raw = Number(process.env.TUTOR_AI_DAILY_TOKEN_LIMIT);
  return Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : DEFAULT_DAILY_TOKEN_LIMIT;
}
