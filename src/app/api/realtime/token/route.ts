import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

import { BETA, BETA_REALTIME_MODEL, BETA_REALTIME_VOICE } from "@/lib/beta";
import { currentUser } from "@/lib/server/auth";
import { AUDIO_INPUT } from "@/lib/realtime-events";
import { VOICE_TOOLS } from "@/lib/voice-tools";
import { BETA_OPENAI_KEY, hasBetaOpenAiKey } from "@/lib/server/beta-key";

/**
 * Mints an ephemeral Realtime client secret.
 *
 * A browser can't hold the real key: WebRTC exchanges an SDP offer directly
 * with OpenAI, so whatever authorises that call is visible to the page. This
 * route is the only thing that touches the real key, and it hands back a
 * credential that expires in about a minute.
 *
 * GA interface, not the beta one:
 *   - POST /v1/realtime/client_secrets, not /v1/realtime/sessions
 *   - no OpenAI-Beta header
 *   - session.type is required, and output audio lives under session.audio.output
 *
 * In the free beta the key is the server's, so nothing is asked of the student
 * at all. Outside it, the student's key comes from their own browser and the
 * BYOK stance holds: we are a relay for one call, not a key holder.
 */

const CLIENT_SECRETS = "https://api.openai.com/v1/realtime/client_secrets";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  // The shared key wins when it exists: in beta the browser sends none.
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
    typeof body.model === "string" && body.model ? body.model : BETA_REALTIME_MODEL;
  const voice =
    typeof body.voice === "string" && body.voice ? body.voice : BETA_REALTIME_VOICE;

  const response = await fetch(CLIENT_SECRETS, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      // Recommended for apps with individual end users, so enforcement can
      // target one account rather than the whole organisation. Hashed, because
      // OpenAI needs a stable handle, not the student's identity.
      "OpenAI-Safety-Identifier": createHash("sha256")
        .update(`tutorai:${user.id}`)
        .digest("hex")
        .slice(0, 32),
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model,
        instructions:
          typeof body.instructions === "string" ? body.instructions : undefined,
        audio: {
          output: { voice },
          /*
           * Set here as well as in the session.update that follows, because
           * the gap between them is real audio: the microphone is already
           * live while the data channel is still opening, and a session that
           * starts on the defaults spends those first seconds interrupting
           * itself on room noise.
           */
          input: AUDIO_INPUT,
        },
        /*
         * The tutor can write on the board and look things up in the student's
         * own work. Declared server-side so a page can't quietly widen what
         * the session is able to ask for.
         */
        tools: VOICE_TOOLS,
        tool_choice: "auto",
      },
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

  const created = (await response.json()) as {
    value?: string;
    expires_at?: number;
    // Older shapes nested it; accept either rather than failing on a rename.
    client_secret?: { value?: string };
    session?: { model?: string };
  };

  const secret = created.value ?? created.client_secret?.value;
  if (!secret) {
    return Response.json(
      { error: "No client secret came back from OpenAI." },
      { status: 502 },
    );
  }

  return Response.json({
    clientSecret: secret,
    model: created.session?.model ?? model,
    expiresAt: created.expires_at ?? null,
  });
}
