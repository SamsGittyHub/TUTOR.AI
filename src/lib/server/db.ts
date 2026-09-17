import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * One pool per process, cached across dev hot-reloads.
 *
 * Railway hands us DATABASE_URL and terminates TLS itself, so verification is
 * relaxed for the managed host the same way `railway connect` does it. A local
 * docker Postgres gets no TLS at all.
 */

declare global {
  // eslint-disable-next-line no-var
  var __chalkPool: Pool | undefined;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Point it at your Railway Postgres (or the local docker one) before starting the server.",
    );
  }
  return url;
}

export function pool(): Pool {
  if (!global.__chalkPool) {
    const url = connectionString();
    const local = /localhost|127\.0\.0\.1/.test(url);
    global.__chalkPool = new Pool({
      connectionString: url,
      ssl: local ? undefined : { rejectUnauthorized: false },
      max: Number(process.env.PGPOOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
    });
  }
  return global.__chalkPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}

/** First row or null — the shape most lookups actually want. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run a unit of work in a transaction, rolling back on any throw. */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
