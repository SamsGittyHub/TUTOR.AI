#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const envPath = path.join(root, ".env");

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const idx = arg.indexOf("=");
    const key = idx >= 0 ? arg.slice(2, idx) : arg.slice(2);
    const value = idx >= 0 ? arg.slice(idx + 1) : "";
    out[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return out;
}

function ensureValue(value, fallback) {
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function readExistingEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function toEnvLine(key, value) {
  return `${key}=${String(value).replace(/\r?\n/g, " ")}`;
}

function prompt(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdin.resume();
    stdout.write(`${question}: `);
    stdin.once("data", (chunk) => {
      const value = chunk.toString().trim();
      resolve(value);
    });
  });
}

const args = parseArgs(process.argv.slice(2));
const existing = readExistingEnv(envPath);

const databaseUrl = ensureValue(
  process.env.DATABASE_URL ?? args.databaseUrl ?? existing.DATABASE_URL,
  "postgresql://tutorai:tutorai@localhost:55432/tutorai",
);
const storageDir = ensureValue(
  process.env.TUTOR_AI_STORAGE_DIR ?? args.storageDir ?? existing.TUTOR_AI_STORAGE_DIR,
  path.join(root, ".storage"),
);
const keySecret = ensureValue(
  process.env.TUTOR_AI_KEY_SECRET ?? args.keySecret ?? existing.TUTOR_AI_KEY_SECRET,
  crypto.randomBytes(32).toString("base64url"),
);
const apiKey = ensureValue(
  process.env.OPENAI_API_KEY ?? args.apiKey ?? existing.OPENAI_API_KEY,
  "",
);

const finalEnv = {
  DATABASE_URL: databaseUrl,
  TUTOR_AI_KEY_SECRET: keySecret,
  TUTOR_AI_STORAGE_DIR: storageDir,
  PGPOOL_MAX: ensureValue(existing.PGPOOL_MAX, "10"),
  OPENAI_API_KEY: apiKey,
};

const hasExisting = fs.existsSync(envPath);
if (!hasExisting) {
  fs.writeFileSync(envPath, `${Object.entries(finalEnv)
    .map(([key, value]) => toEnvLine(key, value))
    .join("\n")}\n`, "utf8");
  console.log(`Created ${path.relative(root, envPath)}`);
} else {
  const merged = { ...readExistingEnv(envPath), ...finalEnv };
  const lines = Object.entries(merged).map(([key, value]) => toEnvLine(key, value));
  fs.writeFileSync(envPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Updated ${path.relative(root, envPath)}`);
}

if (!apiKey) {
  const userKey = await prompt("Paste your OpenAI API key");
  const cleaned = userKey.trim();
  if (cleaned) {
    finalEnv.OPENAI_API_KEY = cleaned;
    const lines = Object.entries({ ...readExistingEnv(envPath), ...finalEnv }).map(([key, value]) =>
      toEnvLine(key, value),
    );
    fs.writeFileSync(envPath, `${lines.join("\n")}\n`, "utf8");
    console.log("Saved your API key to .env");
  }
}

console.log("\nReady to run:");
console.log("  npm run migrate");
console.log("  npm run dev");

console.log(`
On Railway, set these in the app service's Variables tab
(this file is local only and is never committed):

  DATABASE_URL                 \${{Postgres.DATABASE_URL}}
  TUTOR_AI_KEY_SECRET          ${keySecret}
  OPENAI_API_KEY               the shared key everyone's usage runs on

Attach a volume too — its mount path is picked up automatically, and
without one every uploaded file is lost on the next deploy.

The beta runs on one shared key with no per-student cap — usage is logged to
the usage_daily table for your own visibility, but nothing is ever throttled.
Watch your OpenAI dashboard's spend, not this app, for the number that matters.
`);
