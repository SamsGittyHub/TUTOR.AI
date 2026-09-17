import type { NextRequest } from "next/server";

import { currentUser } from "@/lib/server/auth";

/**
 * Mints an ephemeral Realtime session token.
 *
 * The browser cannot open a WebRTC session against OpenAI with a raw API key
 * without exposing it in the SDP exchange, so the key is posted here, used
 * once, and never stored — the response is a token that expires in about a
 * minute. This is the one place a provider key touches the server, and it is
 * deliberately write-only: nothing logs it, nothing persists it.
 *
 * The student's key still comes from their own browser, so the BYOK stance
 * holds: we are a relay for one call, not a key holder.
 */

const REALTIME_SESSIONS = "https://api.openai.com/v1/realtime/sessions";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return Response.json(
      { error: "Live voice needs an OpenAI key. Add one in Settings." },
      { status: 400 },
    );
  }

  const model =
    typeof body.model === "string" && body.model
      ? body.model
      : "gpt-4o-realtime-preview";

  const response = await fetch(REALTIME_SESSIONS, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice: typeof body.voice === "string" ? body.voice : "alloy",
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
      modalities: ["audio", "text"],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Pass the provider's own wording through — it's more useful than ours.
    return Response.json(
      {
        error:
          response.status === 401
            ? "OpenAI rejected that key."
            : `Couldn't start a live session (${response.status}). ${detail.slice(0, 200)}`,
      },
      { status: response.status === 401 ? 401 : 502 },
    );
  }

  const session = await response.json();
  return Response.json({ session });
}
