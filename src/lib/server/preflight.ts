import "server-only";

import { keyVaultAvailable } from "./crypto";
import { queryOne } from "./db";
import { storageIsPersistent, storageRoot } from "./storage";

/**
 * What this deployment actually has configured.
 *
 * Every one of these fails quietly if you let it: no volume means uploads
 * vanish on the next deploy, no key secret means students re-paste their key
 * forever, unapplied migrations mean confusing 500s. So the state is reported
 * — at boot in the logs, and from /api/health — rather than discovered.
 */

export interface Check {
  name: string;
  ok: boolean;
  /** False when this is a degraded-but-working state rather than a failure. */
  required: boolean;
  detail: string;
}

export async function runPreflight(): Promise<{
  ok: boolean;
  checks: Check[];
}> {
  const checks: Check[] = [];

  // Database
  let dbOk = false;
  let dbDetail = "DATABASE_URL is not set.";
  if (process.env.DATABASE_URL) {
    try {
      await queryOne("select 1 as ok");
      dbOk = true;
      dbDetail = "connected";
    } catch (error) {
      dbDetail = `unreachable: ${(error as Error).message}`;
    }
  }
  checks.push({ name: "database", ok: dbOk, required: true, detail: dbDetail });

  // Migrations — a connected database with no tables is the confusing case.
  let migrationsOk = false;
  let migrationsDetail = "not checked (no database)";
  if (dbOk) {
    try {
      const row = await queryOne<{ count: string }>(
        "select count(*)::text as count from schema_migrations",
      );
      const count = Number(row?.count ?? 0);
      migrationsOk = count > 0;
      migrationsDetail = migrationsOk
        ? `${count} applied`
        : "none applied — run `npm run migrate`";
    } catch {
      migrationsDetail = "schema_migrations missing — run `npm run migrate`";
    }
  }
  checks.push({
    name: "migrations",
    ok: migrationsOk,
    required: true,
    detail: migrationsDetail,
  });

  // File storage
  checks.push({
    name: "storage",
    ok: storageIsPersistent(),
    required: false,
    detail: storageIsPersistent()
      ? storageRoot()
      : `${storageRoot()} — ephemeral, uploads are lost on redeploy. Attach a volume.`,
  });

  // Key vault
  checks.push({
    name: "key vault",
    ok: keyVaultAvailable(),
    required: false,
    detail: keyVaultAvailable()
      ? "enabled"
      : "TUTOR_AI_KEY_SECRET unset — students re-enter their API key on each device",
  });

  return { ok: checks.every((c) => c.ok || !c.required), checks };
}

/** One-line-per-check summary for the deploy log. */
export function formatPreflight(checks: Check[]): string {
  return checks
    .map((c) => {
      const mark = c.ok ? "✓" : c.required ? "✗" : "!";
      return `  ${mark} ${c.name.padEnd(11)} ${c.detail}`;
    })
    .join("\n");
}
