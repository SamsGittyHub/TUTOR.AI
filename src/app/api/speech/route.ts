import type { NextRequest } from "next/server";

import { BETA_TTS_MODEL, BETA_TTS_VOICE } from "@/lib/beta";
import { stripForSpeech, TUTOR_VOICE_INSTRUCTIONS } from "@/lib/speech";
import { currentUser } from "@/lib/server/auth";
import { BETA_OPENAI_KEY, hasBetaOpenAiKey } from "@/lib/server/beta-key";
import { recordUsage } from "@/lib/server/usage";

/**
 * The tutor's voice on the typed board.
 *
 * One line of narration in, one audio clip out. The browser plays it and
 * throws it away — nothing is stored, because a lesson's audio is
 * reconstructible from the lesson and keeping it would mean keeping a
 * recording of everything the student was ever taught.
 *
 * The text is cleaned here as well as in the browser: this endpoint bills the
 * operator's key per character, so what reaches it should already be speech
 * rather than a card full of LaTeX.
 */

export const runtime = "nodejs";

/** A sentence of narration, not a paragraph — this should never be slow. */
export const maxDuration = 60;

/** Below the browser's own deadline, so a stall is described rather than cut. */
const UPSTREAM_TIMEOUT_MS = 20_000;

const ENDPOINT = "https://api.openai.com/v1/audio/speech";

/** Charged against the daily allowance, roughly per sentence. */
const SPEECH_TOKEN_COST = 200;

export async function POST(request: NextRequest) {
  try {
    return await speak(request);
  } catch (err) {
    console.error("[speech] unhandled failure", err);
    return Response.json({ error: "The tutor's voice failed on the server." }, { status: 500 });
  }
}

async function speak(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const input = stripForSpeech(String(body.text ?? ""));
  if (!input) return Response.json({ error: "Nothing to say." }, { status: 400 });

  const clientKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = hasBetaOpenAiKey() ? BETA_OPENAI_KEY : clientKey;
  if (!apiKey) {
    return Response.json(
      { error: "The tutor's voice needs an OpenAI key, and this server doesn't have one." },
      { status: 503 },
    );
  }

  // Bounded, for the same reason the browser bounds its side: a clip that
  // never arrives is worse than one that fails, because the queue waiting on
  // it is what makes the tutor speak at all.
  const timeout = new AbortController();
  const expired = setTimeout(() => timeout.abort(), UPSTREAM_TIMEOUT_MS);
  const stop = () => timeout.abort();
  request.signal.addEventListener("abort", stop);

  let upstream: Response;
  try {
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: BETA_TTS_MODEL,
        voice: typeof body.voice === "string" && body.voice ? body.voice : BETA_TTS_VOICE,
        input,
        instructions: TUTOR_VOICE_INSTRUCTIONS,
        response_format: "mp3",
      }),
      signal: timeout.signal,
    });
  } catch {
    if (request.signal.aborted) {
      return Response.json({ error: "That line was cancelled." }, { status: 499 });
    }
    return Response.json({ error: "The tutor's voice didn't answer in time." }, { status: 504 });
  } finally {
    clearTimeout(expired);
    request.signal.removeEventListener("abort", stop);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      {
        error:
          upstream.status === 401
            ? "OpenAI rejected that key."
            : `The tutor's voice failed (${upstream.status}). ${detail.slice(0, 200)}`,
      },
      { status: upstream.status === 401 ? 401 : 502 },
    );
  }

  const audio = await upstream.arrayBuffer();

  /*
   * After the audio is in hand, and never fatal. This used to run first and
   * unguarded, so a database hiccup threw away a clip that had already been
   * generated and paid for — and the tutor simply went quiet for that line.
   */
  try {
    await recordUsage(user.id, 0, SPEECH_TOKEN_COST);
  } catch (err) {
    console.error("[speech] spoke but didn't record usage", err);
  }
  return new Response(audio, {
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(audio.byteLength),
      "cache-control": "no-store",
    },
  });
}
