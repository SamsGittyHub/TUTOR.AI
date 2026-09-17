#!/usr/bin/env node
/**
 * Applies every migrations/*.sql exactly once, in filename order.
 *
 * Each file runs inside a transaction with its name recorded in
 * schema_migrations, so re-running is a no-op and a half-applied migration can
 * never happen. Usage: DATABASE_URL=... node scripts/migrate.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const local = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({
  connectionString: url,
  ssl: local ? undefined : { rejectUnauthorized: false },
});

await client.connect();
await client.query(`
  create table if not exists schema_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  )
`);

const { rows } = await client.query("select name from schema_migrations");
const done = new Set(rows.map((r) => r.name));
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

let applied = 0;
for (const name of files) {
  if (done.has(name)) {
    console.log(`· ${name} (already applied)`);
    continue;
  }
  const sql = await readFile(join(dir, name), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [name]);
    await client.query("commit");
    console.log(`✓ ${name}`);
    applied += 1;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error(`✗ ${name}\n  ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(applied ? `\n${applied} migration(s) applied.` : "\nNothing to do.");
await client.end();
