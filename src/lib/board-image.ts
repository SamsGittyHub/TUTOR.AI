/**
 * Turning "draw me a picture of that" into an image prompt.
 *
 * The tutor asks for a picture in a sentence; an image model wants a
 * description plus a style. Bridging the two is worth keeping out of both the
 * API route and the voice page, because it's the part with rules — a
 * whiteboard drawing must be legible at card width, unlabelled diagrams teach
 * nothing, and a model left to itself will happily return a moody photograph
 * of a textbook when what was wanted was a labelled cross-section.
 *
 * Pure and dependency-free so the rules are testable without a key.
 */

export type ImageShape = "square" | "wide" | "tall";
export type ImageStyle = "diagram" | "sketch" | "realistic";

export interface ImageRequest {
  /** What to draw, in the tutor's own words. */
  prompt: string;
  /** The line written under the picture on the board. */
  caption?: string;
  style: ImageStyle;
  shape: ImageShape;
}

export const MAX_IMAGE_PROMPT = 900;
export const MAX_CAPTION = 120;

const SHAPES: Record<ImageShape, { size: string; width: number; height: number }> = {
  square: { size: "1024x1024", width: 1024, height: 1024 },
  wide: { size: "1536x1024", width: 1536, height: 1024 },
  tall: { size: "1024x1536", width: 1024, height: 1536 },
};

export function sizeFor(shape: ImageShape): string {
  return SHAPES[shape].size;
}

export function dimensionsFor(shape: ImageShape): { width: number; height: number } {
  const { width, height } = SHAPES[shape];
  return { width, height };
}

export function isShape(value: unknown): value is ImageShape {
  return value === "square" || value === "wide" || value === "tall";
}

export function isStyle(value: unknown): value is ImageStyle {
  return value === "diagram" || value === "sketch" || value === "realistic";
}

/**
 * Reads one `draw_image` tool call.
 *
 * Returns an error string rather than throwing: this runs inside a live
 * conversation, and the tutor recovering with "I couldn't draw that, let me
 * describe it instead" is better than a session that stops.
 */
export function normalizeImageRequest(
  args: Record<string, unknown>,
): ImageRequest | { error: string } {
  const prompt = String(args.prompt ?? "").replace(/\s+/g, " ").trim();
  if (!prompt) return { error: "No description was given, so there's nothing to draw." };
  if (prompt.length < 4) {
    return { error: "That description is too short to draw anything useful from." };
  }

  const caption = String(args.caption ?? "").replace(/\s+/g, " ").trim();

  return {
    prompt: prompt.slice(0, MAX_IMAGE_PROMPT),
    caption: caption ? caption.slice(0, MAX_CAPTION) : undefined,
    style: isStyle(args.style) ? args.style : "diagram",
    shape: isShape(args.shape) ? args.shape : "wide",
  };
}

/* -------------------------------------------------------------------------- */
/* The prompt                                                                  */
/* -------------------------------------------------------------------------- */

const STYLE_PREAMBLE: Record<ImageStyle, string> = {
  diagram:
    "A clean, labelled educational diagram in a flat vector style on a plain white background. " +
    "Bold, evenly weighted outlines, a small palette of flat colours, generous white space.",
  sketch:
    "A hand-drawn whiteboard sketch, as a teacher would draw it with a marker: " +
    "confident freehand strokes, two or three marker colours, plain white background, no shading.",
  realistic:
    "A clear, evenly lit reference photograph, sharp focus on the subject, " +
    "uncluttered neutral background, textbook-plate framing.",
};

const RULES =
  "Label the important parts with short words in a plain sans-serif typeface, " +
  "spelled correctly and large enough to read when the picture is 700 pixels wide. " +
  "No title bar, frame, border, caption strip, watermark, signature or logo. " +
  "Nothing cropped at the edges. Accuracy matters more than beauty: this is teaching material, " +
  "so do not invent structures that are not really there.";

/**
 * The full prompt sent to the image model.
 *
 * Built here rather than left to the tutor, so every picture that lands on the
 * board looks like it belongs to the same lesson.
 */
export function buildImagePrompt(request: ImageRequest): string {
  return `${STYLE_PREAMBLE[request.style]}\n\nSubject: ${request.prompt}\n\n${RULES}`;
}

/** The model every picture on the board is drawn by. */
export const IMAGE_MODEL = "gpt-image-2.5-flare-2026-09-08";

/**
 * The exact body posted to the image API.
 *
 * Built here rather than inline in the route so the thing that actually
 * decides which model draws is covered by a test. A constant that is correct
 * in the file and never reaches the request is the failure worth catching.
 */
export function imageRequestBody(request: ImageRequest): {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  n: number;
} {
  return {
    model: IMAGE_MODEL,
    prompt: buildImagePrompt(request),
    size: sizeFor(request.shape),
    /*
     * Asked for explicitly rather than left to the model's default, because
     * generation time scales with it and a board card is looked at around
     * 700px wide. "medium" rather than "low": the prompt demands labels that
     * are spelled correctly and legible, and label text is the first thing to
     * fall apart at the bottom of the quality range. This is the dial to turn
     * if drawings still feel slow.
     */
    quality: "medium",
    n: 1,
  };
}

/* -------------------------------------------------------------------------- */
/* Landing a picture on the board                                              */
/* -------------------------------------------------------------------------- */

/**
 * Where an image will be served from, given its id.
 *
 * Knowable before the image exists, which is the point: the board card can
 * carry its final src from the moment it goes up, so the lesson saves with a
 * working URL rather than waiting on a generation that might outlive the page.
 */
export function imageSrcFor(id: string): string {
  return `/api/images/${id}`;
}

/** What comes back once the image model has been asked. */
export interface DrawnImage {
  src?: string;
  width?: number;
  height?: number;
  error?: string;
}

/** The shape of a board card, as far as this module needs to know. */
interface ImageCardLike {
  id: string;
  type: string;
  src?: string;
  error?: string;
}

/**
 * Fills in the picture card that was waiting for this drawing.
 *
 * Kept separate from the fetch so the awkward part — finding one card in a
 * list that has grown since the request went out — is testable. The tutor
 * carries on writing while an image generates, so by the time it lands the
 * card is rarely the last one.
 */
export function applyDrawnImage<T extends ImageCardLike>(
  actions: T[],
  id: string,
  result: DrawnImage,
): T[] {
  return actions.map((action) =>
    action.id === id && action.type === "show_image" ? { ...action, ...result } : action,
  );
}

/**
 * Marks pictures that were still drawing when the lesson was put away.
 *
 * Applied when a saved lesson is reopened. Without it a card whose generation
 * never came back renders as permanently in progress, and the student waits
 * for something that stopped being on its way days ago.
 */
export function settleUnfinishedImages<T extends ImageCardLike>(actions: T[]): T[] {
  return actions.map((action) =>
    action.type === "show_image" && !action.src && !action.error
      ? { ...action, error: "That drawing didn't finish." }
      : action,
  );
}
