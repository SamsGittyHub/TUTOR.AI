import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import {
  dimensionsFor,
  IMAGE_MODEL,
  imageRequestBody,
  normalizeImageRequest,
} from "@/lib/board-image";
import { currentUser } from "@/lib/server/auth";
import { BETA_OPENAI_KEY, hasBetaOpenAiKey } from "@/lib/server/beta-key";
import { storeFile } from "@/lib/server/storage";
import { limitMessage, recordUsage, usageToday } from "@/lib/server/usage";

/**
 * Draws a picture for the board.
 *
 * The image model returns base64, which is far too big to keep inside a
 * board action — a saved lesson with six illustrations would be a multi-megabyte
 * jsonb row. So the bytes go to the same volume the student's uploads live on,
 * under their own id, and the card carries a URL.
 *
 * Metered against the same daily allowance as everything else: a picture costs
 * the operator real money, and one enthusiastic tester with an image model is
 * how a shared key disappears in an afternoon.
 */

export const runtime = "nodejs";

const ENDPOINT = "https://api.openai.com/v1/images/generations";

/** What one picture is charged as, in tokens, against the daily allowance. */
const IMAGE_TOKEN_COST = 4000;

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = normalizeImageRequest(
    body && typeof body === "object" ? (body as Record<string, unknown>) : {},
  );
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  // The shared key wins when it exists, exactly as the realtime route does.
  const clientKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = hasBetaOpenAiKey() ? BETA_OPENAI_KEY : clientKey;
  if (!apiKey) {
    return Response.json(
      { error: "Drawing needs an OpenAI key, and this server doesn't have one." },
      { status: 503 },
    );
  }

  // Checked before the upstream call, so a capped account never costs anything.
  const usage = await usageToday(user.id);
  if (usage.exceeded) {
    return Response.json({ error: limitMessage(usage) }, { status: 429 });
  }

  const upstream = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    // Built in board-image.ts, where a test pins the model it names.
    body: JSON.stringify(imageRequestBody(parsed)),
    signal: request.signal,
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    if (upstream.status === 401) {
      return Response.json({ error: "OpenAI rejected that key." }, { status: 401 });
    }

    /*
     * A 400 used to be reported as "the image model refused that description",
     * which blames the student's request for what is just as likely the model
     * id being unavailable on this account. Say which it is: nothing is more
     * expensive to debug on a deployment than an error that names the wrong
     * cause, and the provider's own wording is more useful than ours.
     */
    const aboutModel = /model/i.test(detail);
    return Response.json(
      {
        error:
          upstream.status === 400 && !aboutModel
            ? "The image model refused that description."
            : aboutModel
              ? `The drawing model ${IMAGE_MODEL} isn't available to this key. ${detail.slice(0, 200)}`
              : `Couldn't draw that (${upstream.status}). ${detail.slice(0, 200)}`,
      },
      { status: upstream.status === 400 ? 400 : 502 },
    );
  }

  const result = (await upstream.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = result.data?.[0];

  // b64_json is what the image models return; a URL is accepted in case a
  // future one hands back a link instead, so the card isn't left empty.
  let bytes: Uint8Array | null = null;
  if (first?.b64_json) {
    bytes = Uint8Array.from(Buffer.from(first.b64_json, "base64"));
  } else if (first?.url) {
    const fetched = await fetch(first.url).catch(() => null);
    if (fetched?.ok) bytes = new Uint8Array(await fetched.arrayBuffer());
  }

  if (!bytes?.byteLength) {
    return Response.json({ error: "No image came back." }, { status: 502 });
  }

  const id = randomUUID();
  await storeFile(user.id, "board-images", `${id}.png`, bytes);
  await recordUsage(user.id, 0, IMAGE_TOKEN_COST);

  const { width, height } = dimensionsFor(parsed.shape);
  return Response.json({
    id,
    src: `/api/images/${id}`,
    width,
    height,
    caption: parsed.caption,
  });
}
