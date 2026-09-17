import type { NextRequest } from "next/server";

import { currentUser } from "@/lib/server/auth";
import { MAX_UPLOAD_BYTES, storeFile } from "@/lib/server/storage";

/**
 * Keeps the photographs behind a review.
 *
 * The model reads them straight from the browser, so this is only about being
 * able to look at the paper again later — which is why a failed upload is not
 * allowed to fail the review itself.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const reviewId = String(form?.get("reviewId") ?? "");
  const locator = String(form?.get("locator") ?? "page");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file in the upload." }, { status: 400 });
  }
  if (!reviewId) return Response.json({ error: "Which review?" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That image is too large." }, { status: 413 });
  }

  const stored = await storeFile(
    user.id,
    reviewId,
    file.name || `${locator}.jpg`,
    new Uint8Array(await file.arrayBuffer()),
  );

  return Response.json({ storagePath: stored.path });
}
