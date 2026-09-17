import type { NextRequest } from "next/server";

import { currentUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { MAX_UPLOAD_BYTES, storeFile } from "@/lib/server/storage";

/**
 * Stores the original file for a material that already exists.
 *
 * Parsing still happens in the browser — pdf.js and mammoth run there, and
 * moving them server-side would mean shipping the whole extraction pipeline
 * twice. This endpoint only keeps the original so it can be re-downloaded or
 * re-parsed on another device.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const materialId = String(form?.get("materialId") ?? "");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file in the upload." }, { status: 400 });
  }
  if (!materialId) {
    return Response.json({ error: "Which material?" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: "That file is larger than the 200 MB limit." },
      { status: 413 },
    );
  }

  // The material must already be theirs — this is the ownership check.
  const owned = await query("select 1 from materials where id = $1 and user_id = $2", [
    materialId,
    user.id,
  ]);
  if (!owned.length) {
    return Response.json({ error: "That material isn't yours." }, { status: 404 });
  }

  const stored = await storeFile(
    user.id,
    materialId,
    file.name,
    new Uint8Array(await file.arrayBuffer()),
  );

  await query("update materials set storage_path = $3 where id = $1 and user_id = $2", [
    materialId,
    user.id,
    stored.path,
  ]);

  return Response.json({ ok: true, bytes: stored.bytes });
}
