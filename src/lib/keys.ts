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
 * The PRD left server-side-vs-client-side open; this build answers it
 * client-side. Keys never leave the browser except in requests to the
 * provider's own API, there is no backend to breach, and nothing to log. The
 * cost is honest and stated in the UI: localStorage is readable by any script
 * that runs on this origin, so we obfuscate at rest rather than pretending to
 * encrypt, and offer session-only storage for shared machines.
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
