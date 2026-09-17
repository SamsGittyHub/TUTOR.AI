import type { NextRequest } from "next/server";

import { currentUser } from "@/lib/server/auth";
import { BETA_OPENAI_KEY, hasBetaOpenAiKey } from "@/lib/server/beta-key";
import { limitMessage, recordUsage, usageToday } from "@/lib/server/usage";

/**
 * The beta's single API gateway.
 *
 * Signed-in users don't hold a key in beta (src/lib/beta.ts): every chat
 * completion and embedding is proxied here, and this route injects the shared
 * key server-side. The response body streams straight through, so the client's
 * SSE parser can't tell the difference between this and a direct call.
 *
 * Deliberately narrow: only OpenAI, only the two endpoints the beta needs,
 * and the model is clamped to the beta's pick so a curious tester can't run
 * an o3 bill through the shared key.
 */

const OPENAI_BASE = "https://api.openai.com/v1";
const ALLOWED_PATHS = new Set(["/chat/completions", "/embeddings"]);
const BETA_CHAT_MODEL = "gpt-5.6-terra";
const BETA_EMBED_MODEL = "text-embedding-3-small";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  let payload: { providerId?: unknown; path?: unknown; body?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  if (payload.providerId !== "openai") {
    return Response.json(
      { error: "This beta runs on OpenAI only." },
      { status: 400 },
    );
  }
  const path = typeof payload.path === "string" ? payload.path : "";
  if (!ALLOWED_PATHS.has(path)) {
    return Response.json({ error: "Endpoint not available in the beta." }, { status: 400 });
  }

  if (!hasBetaOpenAiKey()) {
    return Response.json(
      { error: "The OpenAI API key is not configured on this server." },
      { status: 503 },
    );
  }

  // Checked before the upstream call, so a capped account never costs anything.
  const usage = await usageToday(user.id);
  if (usage.exceeded) {
    return Response.json({ error: limitMessage(usage) }, { status: 429 });
  }

  const body =
    payload.body && typeof payload.body === "object"
      ? ({ ...(payload.body as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  // Clamp the model so the shared key can only spend on what the beta chose.
  body.model = path === "/embeddings" ? BETA_EMBED_MODEL : BETA_CHAT_MODEL;

  const upstream = await fetch(`${OPENAI_BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${BETA_OPENAI_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return new Response(detail, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  }

  // Streaming bodies are passed through untouched — the client's SSE parser
  // must not be able to tell this apart from a direct call — so usage is read
  // off a tee of the stream rather than by buffering it.
  const contentType =
    upstream.headers.get("content-type") ?? "text/event-stream";

  if (!upstream.body) {
    return new Response(null, { status: upstream.status, headers: { "content-type": contentType } });
  }

  const [toClient, toMeter] = upstream.body.tee();
  void meterStream(user.id, toMeter);

  return new Response(toClient, {
    status: upstream.status,
    headers: { "content-type": contentType },
  });
}

/**
 * Reads the usage block out of a copy of the response.
 *
 * OpenAI reports token counts in the final SSE frame (with stream_options) or
 * in the plain JSON body of a non-streaming call. Either way this runs after
 * the student already has their answer, so a metering failure can never break
 * a lesson — it only risks under-counting, which the next request re-checks.
 */
async function meterStream(userId: string, body: ReadableStream<Uint8Array>) {
  try {
    const text = await new Response(body).text();
    let input = 0;
    let output = 0;

    // Take the last usage object seen: streamed responses repeat it as null
    // until the final frame.
    for (const match of text.matchAll(/"usage"\s*:\s*(\{[^}]*\})/g)) {
      try {
        const parsed = JSON.parse(match[1]) as {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
        if (parsed.prompt_tokens || parsed.completion_tokens) {
          input = parsed.prompt_tokens ?? 0;
          output = parsed.completion_tokens ?? 0;
        }
      } catch {
        // A usage block split across chunks; the next one will do.
      }
    }

    if (input || output) await recordUsage(userId, input, output);
  } catch {
    // Metering is best-effort by design; never surface it to the student.
  }
}
