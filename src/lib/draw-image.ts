"use client";

import { BETA } from "./beta";
import { dimensionsFor, imageSrcFor, type DrawnImage, type ImageRequest } from "./board-image";
import { loadKeys } from "./keys";

/**
 * Asking the server for a picture.
 *
 * The id is chosen here, before the request goes out, so the board card knows
 * its own final URL immediately. That ordering is the whole fix for a real
 * bug: generation takes tens of seconds, and a student who closed the lesson
 * before it finished used to lose the picture entirely — the file was sitting
 * on the server, but the card that pointed at it had been saved without a src
 * and the image was orphaned. Now the lesson saves a working URL within a
 * second, and the picture simply appears whenever it's ready, including on a
 * visit days later.
 */

export interface PlannedImage {
  id: string;
  src: string;
  width: number;
  height: number;
}

/** Reserves an id and the URL it will be served from. Nothing is sent yet. */
export function planImage(request: ImageRequest): PlannedImage {
  const id = crypto.randomUUID();
  const { width, height } = dimensionsFor(request.shape);
  return { id, src: imageSrcFor(id), width, height };
}

/**
 * Generates the picture at an id from planImage.
 *
 * Resolves to an error only when the request was refused outright — a slow
 * generation isn't a failure, and the card finds out it succeeded by the
 * image loading, not by this returning.
 */
export async function requestImage(
  id: string,
  request: ImageRequest,
): Promise<DrawnImage> {
  try {
    const response = await fetch("/api/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...request,
        id,
        // In beta the key is the server's and the browser holds none.
        apiKey: BETA ? undefined : (loadKeys().openai ?? ""),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      /*
       * Every failure the server anticipates names itself. A response with no
       * error field is therefore something it didn't anticipate — a crash, or
       * a gateway that gave up on the request — and the status code is the
       * only clue anyone gets, so it goes in the message rather than being
       * swallowed into a sentence that fits every possible cause equally.
       */
      return { error: body.error ?? `That drawing didn't come through (${response.status}).` };
    }
    return { src: body.src, width: body.width, height: body.height };
  } catch {
    /*
     * The request never completed — a dropped connection, a phone changing
     * network mid-lesson. Crucially this is not evidence that the drawing
     * failed: the server may have finished it and written it under the id we
     * chose. Reporting a failure here would replace a picture that is sitting
     * on disk with an error message, so say nothing and let the card keep
     * asking for its image URL until it either appears or it's clearly late.
     */
    return { unresolved: true };
  }
}
