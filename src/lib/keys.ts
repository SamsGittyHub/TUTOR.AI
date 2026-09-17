"use client";

import type { ProviderId } from "./providers/types";
import {
  clearStored,
  KEYS_MODE,
  KEYS_SALT,
  KEYS_STORAGE,
  readStored,
} from "./storage-keys";

/**
 * Key storage.
 *
 * Two layers. The browser copy is what every request actually reads — calls
 * still go straight from here to the provider, with no server in the path.
 * The account copy exists so a student isn't re-pasting their key on every
 * device and after every cache clear; it's AES-256-GCM at rest, under a secret
 * that lives outside the database.
 *
 * The honest costs, both stated in Settings. localStorage is readable by any
 * script on this origin, so the browser copy is obfuscated rather than
 * pretend-encrypted. And syncing means we hold a copy at all — which is why it
 * can be turned off, and why turning it off deletes what's already stored.
 */

const STORAGE_KEY = KEYS_STORAGE;
const MODE_KEY = KEYS_MODE;

export type KeyStorageMode = "local" | "session";

export type KeyMap = Partial<Record<ProviderId, string>>;

function scramble(value: string, salt: string): string {
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    out.push(value.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
  }
  return btoa(String.fromCharCode(...out));
}

function unscramble(value: string, salt: string): string {
  try {
    const bytes = atob(value);
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
      out += String.fromCharCode(bytes.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
    }
    return out;
  } catch {
    return "";
  }
}

/** Stable per-browser salt so the blob isn't plainly greppable. */
function salt(): string {
  // The salt must survive the rename with the blob it scrambled, or every
  // stored key decodes to noise.
  const existing = readStored(localStorage, KEYS_SALT);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  localStorage.setItem(KEYS_SALT, fresh);
  return fresh;
}

function store(): Storage {
  const mode = (readStored(localStorage, MODE_KEY) as KeyStorageMode | null) ?? "local";
  return mode === "session" ? sessionStorage : localStorage;
}

export function getStorageMode(): KeyStorageMode {
  if (typeof window === "undefined") return "local";
  return (readStored(localStorage, MODE_KEY) as KeyStorageMode | null) ?? "local";
}

export function setStorageMode(mode: KeyStorageMode): void {
  const current = loadKeys();
  localStorage.setItem(MODE_KEY, mode);
  clearStored(localStorage, STORAGE_KEY);
  clearStored(sessionStorage, STORAGE_KEY);
  saveKeys(current);
}

export function loadKeys(): KeyMap {
  if (typeof window === "undefined") return {};
  const raw = readStored(store(), STORAGE_KEY);
  if (!raw) return {};
  try {
    const decoded = JSON.parse(unscramble(raw, salt())) as KeyMap;
    return decoded ?? {};
  } catch {
    return {};
  }
}

export function saveKeys(keys: KeyMap): void {
  if (typeof window === "undefined") return;
  const cleaned: KeyMap = {};
  for (const [id, value] of Object.entries(keys)) {
    if (value && value.trim()) cleaned[id as ProviderId] = value.trim();
  }
  store().setItem(STORAGE_KEY, scramble(JSON.stringify(cleaned), salt()));
}

export function setKey(id: ProviderId, value: string): KeyMap {
  const keys = loadKeys();
  if (value.trim()) keys[id] = value.trim();
  else delete keys[id];
  saveKeys(keys);
  // Mirror to the account in the background. The local copy is what this
  // browser reads, so nothing waits on the network.
  void pushAccountKey(id, value.trim());
  return keys;
}

export function clearAllKeys(): void {
  clearStored(localStorage, STORAGE_KEY);
  clearStored(sessionStorage, STORAGE_KEY);
}

/** "sk-ant-…4f2a" — enough to recognize, useless to steal. */
export function maskKey(value: string): string {
  if (value.length <= 12) return "•".repeat(value.length);
  return `${value.slice(0, 7)}…${value.slice(-4)}`;
}

/* -------------------------------------------------------------------------- */
/* Account sync                                                                */
/* -------------------------------------------------------------------------- */

export interface AccountKeyState {
  /** False when the server has no TUTOR_AI_KEY_SECRET configured. */
  available: boolean;
  /** Whether this account wants keys kept server-side. */
  sync: boolean;
}

interface KeysResponse {
  keys: { providerId: ProviderId; key: string; hint: string }[];
  sync: boolean;
  available: boolean;
}

/**
 * Pulls the account's keys into this browser.
 *
 * Local wins on conflict: a key just pasted here shouldn't be clobbered by an
 * older one from another device. Returns whether anything new arrived, so the
 * caller can re-render.
 */
export async function pullAccountKeys(): Promise<AccountKeyState & { added: number }> {
  if (typeof window === "undefined") {
    return { available: false, sync: false, added: 0 };
  }
  try {
    const response = await fetch("/api/keys");
    if (!response.ok) return { available: false, sync: false, added: 0 };
    const body = (await response.json()) as KeysResponse;

    const local = loadKeys();
    let added = 0;
    for (const entry of body.keys ?? []) {
      if (!local[entry.providerId] && entry.key) {
        local[entry.providerId] = entry.key;
        added += 1;
      }
    }
    if (added) saveKeys(local);

    return { available: body.available, sync: body.sync, added };
  } catch {
    return { available: false, sync: false, added: 0 };
  }
}

/** Mirrors one key up to the account. Silent on failure — the local copy works. */
export async function pushAccountKey(
  id: ProviderId,
  value: string,
): Promise<void> {
  try {
    await fetch("/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: id, key: value }),
    });
  } catch {
    // Syncing is a convenience; never let it fail a key the student just set.
  }
}

export async function setAccountSync(enabled: boolean): Promise<void> {
  await fetch("/api/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sync: enabled }),
  });
}

/** "Forget all keys" has to clear the account copy too, or they come back. */
export async function clearAccountKeys(): Promise<void> {
  try {
    await fetch("/api/keys", { method: "DELETE" });
  } catch {
    // Local keys are cleared regardless by clearAllKeys().
  }
}
