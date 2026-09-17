#!/usr/bin/env node
/**
 * Runs before a new version takes traffic.
 *
 * Applies migrations, then prints what this deployment actually has. Railway's
 * preDeployCommand runs against the live database with the new code already
 * built, which is exactly where a migration belongs: if it fails, the old
 * version keeps serving and the deploy stops.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.DATABASE_URL) {
  console.error(
    "\nDATABASE_URL is not set.\n\n" +
      "On Railway: add a Postgres service, then in this service's Variables add\n" +
      "  DATABASE_URL = ${{Postgres.DATABASE_URL}}\n" +
      "(substituting your Postgres service's name if you renamed it).\n",
  );
  process.exit(1);
}

console.log("\nApplying migrations");
execFileSync("node", [join(root, "scripts", "migrate.mjs")], {
  stdio: "inherit",
  env: process.env,
});

console.log("\nDeployment configuration");

const volume =
  process.env.TUTOR_AI_STORAGE_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH;
if (volume) {
  console.log(`  ok  uploads      ${volume}`);
} else {
  console.log(
    "  !   uploads      ephemeral - original files are lost on every redeploy.\n" +
      "                   Attach a volume to this service (any mount path); it is\n" +
      "                   detected automatically via RAILWAY_VOLUME_MOUNT_PATH.",
  );
}

const secret = process.env.TUTOR_AI_KEY_SECRET;
if (secret && secret.length >= 16) {
  console.log("  ok  key vault    enabled");
} else if (secret) {
  console.log("  !   key vault    TUTOR_AI_KEY_SECRET is too short (need 16+ chars)");
} else {
  console.log(
    "  !   key vault    off - students re-enter their API key on every device.\n" +
      "                   Set TUTOR_AI_KEY_SECRET to a long random string:\n" +
      "                     openssl rand -base64 48",
  );
}

const betaKey = process.env.OPENAI_API_KEY ?? process.env.BETA_OPENAI_KEY;
if (betaKey) {
  const limit = Number(process.env.TUTOR_AI_DAILY_TOKEN_LIMIT) || 300000;
  console.log(`  ok  free beta     on — shared key, ${limit.toLocaleString()} tokens/user/day`);
} else {
  console.log(
    "  !   free beta     off — no OPENAI_API_KEY, so students are asked for\n" +
      "                   their own key. Set it to run the free beta.",
  );
}

console.log("\nReady.\n");
