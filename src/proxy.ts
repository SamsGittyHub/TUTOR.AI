import { NextResponse, type NextRequest } from "next/server";

/**
 * Route gate.
 *
 * Postgres is the source of truth now, so the study routes need an account.
 * This only checks that a session cookie exists — cheap, and it runs before
 * render so a signed-out visitor never sees a flash of the board. The cookie
 * is not trusted here: every API route re-reads it against auth_sessions, and
 * an expired or forged one still gets a 401 there.
 *
 * Next 16 renamed this convention from `middleware` to `proxy`.
 */

const SESSION_COOKIE = "tutorai_session";
const LEGACY_SESSION_COOKIE = "chalk_session";
const PROTECTED = ["/app", "/quiz", "/materials", "/courses", "/progress",
                   "/review", "/sessions", "/calendar", "/voice", "/settings",
                   "/practice-exam", "/exam-review", "/search"];

// Shared boards are the one study surface with no account behind it — that is
// the entire point of a link you can send to a classmate.
const PUBLIC_PREFIXES = ["/s/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(LEGACY_SESSION_COOKIE)
  ) {
    return NextResponse.next();
  }

  const login = new URL("/login", request.url);
  // Come back to whatever they were reaching for once they're in.
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and the public folder.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
