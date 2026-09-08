import type { ProviderId } from "./providers/types";

/**
 * Provider/model choice, shared by the board and the flashcards page. Both
 * routes read the same localStorage key, so a model picked in one is the
 * model the other uses.
 */

export const SETTINGS_KEY = "chalk.settings.v1";

export interface Settings {
  providerId: ProviderId;
  model: string;
}

export const DEFAULT_SETTINGS: Settings = {
  providerId: "anthropic",
  model: "claude-sonnet-5",
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
