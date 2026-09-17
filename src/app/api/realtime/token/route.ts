import type { NextRequest } from "next/server";

import { BETA, BETA_REALTIME_MODEL } from "@/lib/beta";
import { currentUser } from "@/lib/server/auth";
import { BETA_OPENAI_KEY, hasBetaOpenAiKey } from "@/lib/server/beta-key";

/**
 * Mints an ephemeral Realtime session token.
 *
 * The browser cannot open a WebRTC session against OpenAI with a raw API key
 * without exposing it in the SDP exchange, so the key is posted here, used
 * once, and never stored — the response is a token that expires in about a
 * minute. This is the one place a provider key touches the server, and it is
 * deliberately write-only: nothing logs it, nothing persists it.
 *
 * In the free beta the key is the server's, so nothing is asked of the student
 * at all. Outside it, the student's key still comes from their own browser and
 * the BYOK stance holds: we are a relay for one call, not a key holder.
 */

const REALTIME_SESSIONS = "https://api.openai.com/v1/realtime/sessions";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  // The shared key wins when it exists: in beta the browser sends none at all.
  const clientKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = hasBetaOpenAiKey() ? BETA_OPENAI_KEY : clientKey;

  if (!apiKey) {
    return Response.json(
      {
        error: BETA
          ? "Live voice isn't configured on this server yet."
          : "Live voice needs an OpenAI key. Add one in Settings.",
      },
      { status: BETA ? 503 : 400 },
    );
  }

  const model =
    typeof body.model === "string" && body.model
      ? body.model
      : BETA
        ? BETA_REALTIME_MODEL
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
