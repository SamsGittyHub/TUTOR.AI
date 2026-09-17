import "server-only";

import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";

import { query, queryOne } from "./db";

/**
 * Passwords and sessions, on nothing but node:crypto.
 *
 * scrypt rather than argon2 or bcrypt because both of those are native modules
 * — one more thing to compile on every Railway deploy, for a KDF that is not
 * meaningfully stronger at these parameters. The session token is opaque and
 * only its SHA-256 is stored, so a leaked auth_sessions table cannot be
 * replayed against the app.
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
export const SESSION_COOKIE = "tutorai_session";
/** The pre-rename cookie. Read, never written, so live sessions survive. */
export const LEGACY_SESSION_COOKIE = "chalk_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await scrypt(password, salt, expected.length);
  // Lengths must match before timingSafeEqual, which throws otherwise.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

/** Mints a session row and returns the raw token to hand the browser. */
export async function createSession(
  userId: string,
  userAgent?: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await query(
    `insert into auth_sessions (id, user_id, token_hash, user_agent, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, sha256(token), userAgent?.slice(0, 300) ?? null, expiresAt],
  );
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(LEGACY_SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Expired rows are swept here. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token =
    store.get(SESSION_COOKIE)?.value ?? store.get(LEGACY_SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<{
    id: string;
    email: string;
    display_name: string | null;
    expires_at: Date;
  }>(
    `select u.id, u.email, u.display_name, s.expires_at
       from auth_sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1`,
    [sha256(token)],
  );
  if (!row) return null;

  if (row.expires_at.getTime() <= Date.now()) {
    await query("delete from auth_sessions where token_hash = $1", [sha256(token)]);
    return null;
  }

  return { id: row.id, email: row.email, displayName: row.display_name };
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token =
    store.get(SESSION_COOKIE)?.value ?? store.get(LEGACY_SESSION_COOKIE)?.value;
  if (token) {
    await query("delete from auth_sessions where token_hash = $1", [sha256(token)]);
  }
  await clearSessionCookie();
}

/** For route handlers that must have a user; throws a 401 Response otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) {
    throw Response.json({ error: "Not signed in." }, { status: 401 });
  }
  return user;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return null;
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}
