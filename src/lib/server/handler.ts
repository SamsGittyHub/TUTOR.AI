import "server-only";

import { currentUser, type SessionUser } from "./auth";

/**
 * Wraps a route handler so every one of them gets the same three things: a
 * guaranteed user, JSON body parsing, and an error shape the client can rely
 * on. Without this each route re-implements the 401 and the try/catch.
 */
export function authed<T>(
  fn: (user: SessionUser, request: Request) => Promise<T>,
) {
  return async (request: Request): Promise<Response> => {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
    try {
      return Response.json(await fn(user, request));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      console.error("[api]", message);
      return Response.json({ error: message }, { status: 500 });
    }
  };
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
