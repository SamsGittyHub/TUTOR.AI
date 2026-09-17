import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Encryption for the one secret we now hold: the student's provider API key.
 *
 * AES-256-GCM, so a tampered ciphertext fails to decrypt rather than returning
 * plausible garbage that we'd then send to a provider. The key is derived from
 * TUTOR_AI_KEY_SECRET, which lives in the environment and never in Postgres —
 * a database dump on its own decrypts nothing.
 *
 * There is deliberately no fallback secret. Running without one would store
 * keys under a value anyone could read out of this file, which is worse than
 * refusing to start.
 */

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.TUTOR_AI_KEY_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "TUTOR_AI_KEY_SECRET is missing or too short. Set it to a long random string — API keys can't be stored without it.",
    );
  }
  // A fixed salt is fine here: the secret is already high-entropy, and a random
  // one would have to be stored beside the ciphertext to be usable.
  cachedKey = scryptSync(secret, "tutorai.keyvault.v1", 32);
  return cachedKey;
}

/** True when the server is configured to store keys at all. */
export function keyVaultAvailable(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export interface Sealed {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}

export function seal(plaintext: string): Sealed {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag() };
}

/** Returns null when the ciphertext doesn't authenticate — a rotated or wrong secret. */
export function open(sealed: Sealed): string | null {
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), sealed.nonce);
    decipher.setAuthTag(sealed.authTag);
    return Buffer.concat([
      decipher.update(sealed.ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** "…4f2a" — enough to recognize a stored key, useless to steal. */
export function hintFor(key: string): string {
  return `…${key.trim().slice(-4)}`;
}
