import { BETA, BETA_MODEL, BETA_PROVIDER } from "./beta";
import type { ProviderId } from "./providers/types";
import { readStored, SETTINGS } from "./storage-keys";

/**
 * Provider/model choice, shared by the board and the flashcards page. Both
 * routes read the same localStorage key, so a model picked in one is the
 * model the other uses.
 */

export const SETTINGS_KEY = SETTINGS;

export interface Settings {
  providerId: ProviderId;
  model: string;
}

export const DEFAULT_SETTINGS: Settings = {
  providerId: "anthropic",
  model: "claude-sonnet-5",
};

/** The beta runs on one provider, because the shared key only works for one. */
const BETA_SETTINGS: Settings = {
  providerId: BETA_PROVIDER,
  model: BETA_MODEL,
};

export function loadSettings(): Settings {
  // Forced, not defaulted: a saved choice from before the beta — or a
  // provider picked on another device — would otherwise send the turn
  // straight to that vendor with a placeholder key, bypassing the gateway
  // entirely and failing with a confusing 401.
  if (BETA) return BETA_SETTINGS;
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = readStored(localStorage, SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (BETA || typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
