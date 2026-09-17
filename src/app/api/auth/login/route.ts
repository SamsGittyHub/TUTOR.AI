import type { NextRequest } from "next/server";

import {
  createSession,
  setSessionCookie,
  validateEmail,
  verifyPassword,
} from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const email = validateEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  // One message for both halves, so this endpoint can't be used to discover
  // which emails have accounts.
  const deny = () =>
    Response.json({ error: "Email or password is wrong." }, { status: 401 });

  if (!email || !password) return deny();

  const row = await queryOne<{
    id: string;
    email: string;
    password_hash: string;
    display_name: string | null;
  }>(
    `select id, email, password_hash, display_name
       from users where email_lower = lower($1)`,
    [email],
  );
  if (!row) return deny();
  if (!(await verifyPassword(password, row.password_hash))) return deny();

  const { token, expiresAt } = await createSession(row.id, request.headers.get("user-agent"));
  await setSessionCookie(token, expiresAt);

  return Response.json({
    user: { id: row.id, email: row.email, displayName: row.display_name },
  });
}
