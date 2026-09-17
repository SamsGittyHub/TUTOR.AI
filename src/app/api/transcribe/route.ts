import type { NextRequest } from "next/server";

import { currentUser } from "@/lib/server/auth";
import { BETA_OPENAI_KEY, hasBetaOpenAiKey } from "@/lib/server/beta-key";

/**
 * Audio/video transcription for beta users, who hold no keys of their own.
 * The browser does the heavy lifting (downmixing, chunking) and posts the
 * same multipart form it would post to OpenAI; this route re-signs it with
 * the shared key and passes the JSON verdict straight back.
 */

const TRANSCRIPTIONS = "https://api.openai.com/v1/audio/transcriptions";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  if (!hasBetaOpenAiKey()) {
    return Response.json(
      { error: "The OpenAI API key is not configured on this server." },
      { status: 503 },
    );
  }

  const upstream = await fetch(TRANSCRIPTIONS, {
    method: "POST",
    headers: { authorization: `Bearer ${BETA_OPENAI_KEY}` },
    body: form,
    signal: request.signal,
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
