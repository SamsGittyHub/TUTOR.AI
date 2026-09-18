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
import { recordUsage } from "@/lib/server/usage";

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

/*
 * Drawing a picture routinely takes half a minute and sometimes more. Without
 * this the platform's own gateway decides when to give up, and what it returns
 * when it does is an HTML error page — which the board could only report as
 * "that drawing didn't come through", the least useful sentence available.
 */
export const maxDuration = 120;

/** Give up before maxDuration does, so the timeout is ours to describe. */
const UPSTREAM_TIMEOUT_MS = 105_000;

const ENDPOINT = "https://api.openai.com/v1/images/generations";

const UUID = /^[0-9a-f-]{36}$/;

/** What one picture is charged as, in tokens, against the daily allowance. */
const IMAGE_TOKEN_COST = 4000;

/**
 * The last line of defence.
 *
 * Anything that escapes the handler becomes a framework 500 whose body is an
 * HTML error page, and the board has no way to read that — every such failure
 * arrived on the whiteboard as the same shrugging "that drawing didn't come
 * through", whether the volume was unmounted, the database was down, or the
 * model was simply slow. A JSON error always, so the sentence a student reads
 * is about what actually went wrong.
 */
export async function POST(request: NextRequest) {
  try {
    return await draw(request);
  } catch (err) {
    console.error("[images] unhandled failure while drawing", err);
    return Response.json(
      { error: "The drawing failed on the server. It's been logged — try again." },
      { status: 500 },
    );
  }
}

async function draw(request: NextRequest) {
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

  /*
   * Two ways to stop waiting: the student navigated away, or the image model
   * has simply taken too long. They need telling apart — the first is not a
   * fault and the second is — so they're separate signals feeding one abort.
   */
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
      // Built in board-image.ts, where a test pins the model it names.
      body: JSON.stringify(imageRequestBody(parsed)),
      signal: timeout.signal,
    });
  } catch (err) {
    if (request.signal.aborted) {
      return Response.json({ error: "That drawing was cancelled." }, { status: 499 });
    }
    console.error("[images] couldn't reach the image model", err);
    return Response.json(
      {
        error: timeout.signal.aborted
          ? "The drawing took too long and was given up on. Asking again usually works."
          : "Couldn't reach the image model. It may be having a moment — try again.",
      },
      { status: 504 },
    );
  } finally {
    clearTimeout(expired);
    request.signal.removeEventListener("abort", stop);
  }

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
    console.error(`[images] ${upstream.status} from the image model:`, detail.slice(0, 500));

    /*
     * The provider's own words are always appended. A 400 used to be reported
     * as a bare "refused that description", which reads as the student having
     * asked for something forbidden when it is just as often a parameter this
     * server sent that the model doesn't take — and hiding the detail made
     * those two indistinguishable from the outside.
     */
    const aboutModel = /model/i.test(detail);
    const said = detail ? ` ${detail.slice(0, 200)}` : "";
    return Response.json(
      {
        error: aboutModel
          ? `The drawing model ${IMAGE_MODEL} isn't available to this key.${said}`
          : upstream.status === 400
            ? `The image model refused that request.${said}`
            : `Couldn't draw that (${upstream.status}).${said}`,
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

  /*
   * The caller names the id so its board card can carry the final URL from
   * the moment it goes up, instead of waiting for this response. Validated
   * as a plain UUID before it reaches the filesystem — storeFile's own
   * safeSegment would neutralise anything stranger, but a path component
   * arriving from a browser gets checked here too rather than relying on a
   * guard two layers down.
   */
  const requested = typeof body.id === "string" ? body.id : "";
  const id = UUID.test(requested) ? requested : randomUUID();

  try {
    await storeFile(user.id, "board-images", `${id}.png`, bytes);
  } catch (err) {
    // Nearly always the volume: unmounted, full, or read-only. The picture is
    // already generated and already paid for at this point, so this is worth
    // saying precisely rather than letting it escape as a blank 500.
    console.error("[images] couldn't write the picture to storage", err);
    return Response.json(
      { error: "The picture was drawn but couldn't be saved on the server." },
      { status: 500 },
    );
  }

  /*
   * Bookkeeping, deliberately after the point of no return and deliberately
   * not fatal: the student has their picture either way, and losing a drawing
   * that exists on disk because a usage row wouldn't insert would be a much
   * worse bug than an undercounted total.
   */
  try {
    await recordUsage(user.id, 0, IMAGE_TOKEN_COST);
  } catch (err) {
    console.error("[images] the picture was saved but usage wasn't recorded", err);
  }

  const { width, height } = dimensionsFor(parsed.shape);
  return Response.json({
    id,
    src: `/api/images/${id}`,
    width,
    height,
    caption: parsed.caption,
  });
}
