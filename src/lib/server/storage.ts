import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Original uploads on disk.
 *
 * On Railway this points at a mounted volume; locally it's ./.storage. Files
 * are laid out as <root>/<userId>/<materialId>/<name> so deleting an account
 * or a material is a directory removal, and every path is re-resolved against
 * the root before use — a material id arriving from the client must never be
 * able to climb out with "../".
 */

/**
 * Where originals live, in order of preference:
 *
 *   1. TUTOR_AI_STORAGE_DIR, if it's set explicitly.
 *   2. RAILWAY_VOLUME_MOUNT_PATH — Railway sets this on any service with a
 *      volume attached, so mounting one is the whole configuration step.
 *   3. CHALK_STORAGE_DIR, the pre-rename name, so an existing deploy's volume
 *      doesn't come back empty.
 *   4. ./.storage, for local development.
 *
 * Getting this wrong is quiet rather than loud — uploads succeed into the
 * container's ephemeral filesystem and vanish on the next deploy — which is
 * why the volume path is detected rather than left to be remembered.
 */
const ROOT = resolve(
  process.env.TUTOR_AI_STORAGE_DIR ??
    process.env.RAILWAY_VOLUME_MOUNT_PATH ??
    process.env.CHALK_STORAGE_DIR ??
    ".storage",
);

/** True when originals are going somewhere that survives a redeploy. */
export function storageIsPersistent(): boolean {
  return Boolean(
    process.env.TUTOR_AI_STORAGE_DIR ??
      process.env.RAILWAY_VOLUME_MOUNT_PATH ??
      process.env.CHALK_STORAGE_DIR,
  );
}

export function storageRoot(): string {
  return ROOT;
}

/** 25 MB is the transcription cap; PDFs and slide decks rarely exceed it. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

function safeSegment(value: string): string {
  // Anything that isn't a plain id becomes one, deterministically.
  return /^[A-Za-z0-9._-]{1,120}$/.test(value) && !value.startsWith(".")
    ? value
    : createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** Resolves a storage path and refuses anything that escapes the root. */
function resolveWithin(...segments: string[]): string {
  const path = resolve(join(ROOT, ...segments.map(safeSegment)));
  if (path !== ROOT && !path.startsWith(ROOT + sep)) {
    throw new Error("Refusing a path outside the storage root.");
  }
  return path;
}

export interface StoredFile {
  /** Relative to the root — what goes in materials.storage_path. */
  path: string;
  bytes: number;
}

export async function storeFile(
  userId: string,
  materialId: string,
  filename: string,
  data: Uint8Array,
): Promise<StoredFile> {
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("That file is larger than the 200 MB limit.");
  }
  const name = safeSegment(filename) === filename ? filename : `${randomUUID()}.bin`;
  const full = resolveWithin(userId, materialId, name);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
  return {
    path: [safeSegment(userId), safeSegment(materialId), safeSegment(name)].join("/"),
    bytes: data.byteLength,
  };
}

export async function readStored(relativePath: string): Promise<Buffer> {
  return readFile(resolveWithin(...relativePath.split("/")));
}

export async function deleteMaterialFiles(
  userId: string,
  materialId: string,
): Promise<void> {
  await rm(resolveWithin(userId, materialId), { recursive: true, force: true });
}

export async function deleteUserFiles(userId: string): Promise<void> {
  await rm(resolveWithin(userId), { recursive: true, force: true });
}
