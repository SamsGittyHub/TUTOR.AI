"use client";

/**
 * Browser storage key names, and the rename from the old ones.
 *
 * The product was called Chalk, and its localStorage keys said so. Renaming
 * them outright would silently log people out of their own saved API key and
 * reset their settings — the kind of breakage nobody reports, they just
 * re-paste the key and assume the app is flaky. So every read falls back to
 * the old name once and copies the value forward.
 *
 * The fallbacks can be deleted once no browser plausibly holds the old keys.
 */

const PREFIX = "tutorai";
const LEGACY_PREFIX = "chalk";

export const KEYS_STORAGE = `${PREFIX}.keys.v1`;
export const KEYS_MODE = `${PREFIX}.keys.mode`;
export const KEYS_SALT = `${PREFIX}.salt`;
export const SETTINGS = `${PREFIX}.settings.v1`;
export const THEME = `${PREFIX}.theme.v1`;
export const VOICE_PREF = `${PREFIX}.voice.v1`;
export const QUIZ_SELECTION = `${PREFIX}.quiz.materials.v1`;
export const TEACH_HANDOFF = `${PREFIX}.teach.v1`;
export const CHAT_WIDTH = `${PREFIX}.chatwidth.v1`;
export const SIDEBAR_WIDTH = `${PREFIX}.sidewidth.v1`;
export const SIDEBAR_HIDDEN = `${PREFIX}.sidehidden.v1`;
export const CHAT_DOCKED = `${PREFIX}.chatdocked.v1`;
export const LANGUAGE = `${PREFIX}.language.v1`;

function legacyNameFor(key: string): string {
  return `${LEGACY_PREFIX}${key.slice(PREFIX.length)}`;
}

/**
 * Reads a key, migrating a value stored under the old name if it's still there.
 *
 * Every access is wrapped: a browser set to block site data throws on the
 * accessor itself rather than returning null.
 */
export function readStored(
  store: Storage,
  key: string,
): string | null {
  try {
    const current = store.getItem(key);
    if (current !== null) return current;

    const legacy = store.getItem(legacyNameFor(key));
    if (legacy === null) return null;

    // Carry it forward, then drop the old copy so this only happens once.
    store.setItem(key, legacy);
    store.removeItem(legacyNameFor(key));
    return legacy;
  } catch {
    return null;
  }
}

/** Removes both the current and legacy names — used by "forget all keys". */
export function clearStored(store: Storage, key: string): void {
  try {
    store.removeItem(key);
    store.removeItem(legacyNameFor(key));
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
