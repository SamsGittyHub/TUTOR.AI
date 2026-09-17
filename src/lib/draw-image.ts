"use client";

import { BETA } from "./beta";
import type { DrawnImage, ImageRequest } from "./board-image";
import { loadKeys } from "./keys";

/**
 * Asking the server for a picture.
 *
 * Both boards draw the same way: the typed tutor emits a show_image card
 * mid-stream and the live one calls draw_image mid-sentence, and either way
 * the card goes up empty and this fills it in. Never throws — a failed drawing
 * is a caption on the card, not a lesson that stops.
 */
export async function requestImage(request: ImageRequest): Promise<DrawnImage> {
  try {
    const response = await fetch("/api/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...request,
        // In beta the key is the server's and the browser holds none.
        apiKey: BETA ? undefined : (loadKeys().openai ?? ""),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.src) {
      return { error: body.error ?? "That drawing didn't come through." };
    }
    return { src: body.src, width: body.width, height: body.height };
  } catch {
    return { error: "That drawing didn't come through." };
  }
}
