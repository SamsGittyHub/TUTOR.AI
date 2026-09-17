import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import {
  createSession,
  hashPassword,
  passwordProblem,
  setSessionCookie,
  validateEmail,
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
  if (!email) return Response.json({ error: "Enter a valid email." }, { status: 400 });

  const problem = passwordProblem(body.password);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const displayName =
    typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim().slice(0, 80)
      : null;

  const taken = await queryOne("select 1 from users where email_lower = lower($1)", [email]);
  if (taken) {
    return Response.json(
      { error: "That email already has an account. Sign in instead." },
      { status: 409 },
    );
  }

  const id = randomUUID();
  await queryOne(
    `insert into users (id, email, password_hash, display_name)
     values ($1, $2, $3, $4) returning id`,
    [id, email, await hashPassword(body.password as string), displayName],
  );

  const { token, expiresAt } = await createSession(id, request.headers.get("user-agent"));
  await setSessionCookie(token, expiresAt);

  return Response.json({ user: { id, email, displayName } }, { status: 201 });
}
