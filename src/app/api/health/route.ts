import { runPreflight } from "@/lib/server/preflight";

/**
 * Railway's healthcheck target.
 *
 * Returns 503 while a required piece is missing, so a deploy that can't reach
 * Postgres or hasn't been migrated fails visibly instead of serving 500s to
 * students. Degraded-but-working states (no volume, no key vault) report in
 * the body without failing the check.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { ok, checks } = await runPreflight();
  return Response.json(
    { ok, checks, at: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
