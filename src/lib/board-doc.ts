import type { TutorAction } from "./actions";
import type { DocxBlock } from "./docx";

/**
 * Board actions → document blocks.
 *
 * The Markdown export already knows how to turn a lesson into prose; this is
 * the same reading of the action log, aimed at a paginated document instead.
 * Both drop cards the tutor erased — it wiped them because they were wrong,
 * and a student's notes should not preserve the mistakes.
 *
 * Visual actions (diagrams, plots) become image placeholders here and are
 * filled in by the caller once it has rasterised them: this module stays pure
 * so it can be tested without a DOM.
 */

export interface BoardDocOptions {
  title: string;
  date?: number;
  materialName?: (id: string) => string;
  /** Ids the caller can rasterise. Anything not listed is described in text. */
  rasterisable?: Set<string>;
}

/** An action that needs a picture before the document can be built. */
export interface PendingImage {
  actionId: string;
  caption?: string;
}

function citation(
  action: TutorAction,
  materialName?: (id: string) => string,
): string | null {
  if (!action.sourceRefs?.length) return null;
  const parts = action.sourceRefs.map((ref) => {
    const name = ref.materialId && materialName ? materialName(ref.materialId) : "";
    return [name, ref.locator].filter(Boolean).join(", ");
  });
  const unique = [...new Set(parts.filter(Boolean))];
  return unique.length ? `Source: ${unique.join(" · ")}` : null;
}

/**
 * Returns the blocks, plus the visual cards still needing a rendered image.
 * Image blocks are emitted with empty data for the caller to fill by index.
 */
export function boardToBlocks(
  actions: TutorAction[],
  options: BoardDocOptions,
): { blocks: DocxBlock[]; pending: PendingImage[] } {
  const erased = new Set(
    actions.filter((a) => a.type === "erase").map((a) => a.targetId),
  );
  const canRaster = options.rasterisable;

  const blocks: DocxBlock[] = [
    { kind: "heading", text: options.title, level: 1 },
  ];
  if (options.date) {
    blocks.push({
      kind: "paragraph",
      italic: true,
      text: new Date(options.date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    });
  }

  const pending: PendingImage[] = [];
  const cite = (action: TutorAction) => {
    const text = citation(action, options.materialName);
    if (text) blocks.push({ kind: "quote", text });
  };

  for (const action of actions) {
    if (erased.has(action.id)) continue;

    switch (action.type) {
      case "lesson_plan":
        blocks.push({ kind: "heading", text: action.title, level: 2 });
        blocks.push({ kind: "numbered", items: action.steps });
        break;

      case "say":
        blocks.push({ kind: "paragraph", text: action.text });
        break;

      case "write_text":
        if (action.style === "title") {
          blocks.push({ kind: "heading", text: action.text, level: 2 });
        } else if (action.style === "note") {
          blocks.push({ kind: "quote", text: action.text });
        } else {
          blocks.push({ kind: "paragraph", text: action.text });
        }
        cite(action);
        break;

      case "write_equation":
        // LaTeX in a monospace run: Word has no maths import we can rely on,
        // and a picture of an equation can't be edited or searched.
        blocks.push({ kind: "mono", text: action.latex });
        if (action.label) {
          blocks.push({ kind: "paragraph", italic: true, text: action.label });
        }
        cite(action);
        break;

      case "write_steps":
        if (action.title) {
          blocks.push({ kind: "heading", text: action.title, level: 2 });
        }
        blocks.push({
          kind: "numbered",
          items: action.steps.map((step) =>
            [step.text, step.latex, step.note ? `(${step.note})` : ""]
              .filter(Boolean)
              .join("   "),
          ),
        });
        cite(action);
        break;

      case "write_table":
        if (action.title) {
          blocks.push({ kind: "heading", text: action.title, level: 2 });
        }
        blocks.push({ kind: "table", headers: action.headers, rows: action.rows });
        cite(action);
        break;

      case "draw_diagram":
      case "draw_plot": {
        const caption = action.title ?? undefined;
        if (canRaster?.has(action.id)) {
          pending.push({ actionId: action.id, caption });
          blocks.push({
            kind: "image",
            image: { data: new Uint8Array(), widthPx: 0, heightPx: 0, caption },
          });
        } else if (action.type === "draw_diagram") {
          // No picture available — describe it rather than drop it.
          if (caption) blocks.push({ kind: "heading", text: caption, level: 2 });
          blocks.push({
            kind: "bullets",
            items: action.edges.length
              ? action.edges.map((edge) => {
                  const from = action.nodes.find((n) => n.id === edge.from)?.label ?? edge.from;
                  const to = action.nodes.find((n) => n.id === edge.to)?.label ?? edge.to;
                  return `${from} → ${to}${edge.label ? ` (${edge.label})` : ""}`;
                })
              : action.nodes.map((n) => n.label),
          });
        } else {
          if (caption) blocks.push({ kind: "heading", text: caption, level: 2 });
          blocks.push({
            kind: "bullets",
            items: action.curves.map(
              (c) => `${c.expr}${c.label ? ` — ${c.label}` : ""}`,
            ),
          });
        }
        cite(action);
        break;
      }

      case "show_image": {
        const caption = action.caption ?? undefined;
        if (canRaster?.has(action.id)) {
          pending.push({ actionId: action.id, caption });
          blocks.push({
            kind: "image",
            image: { data: new Uint8Array(), widthPx: 0, heightPx: 0, caption },
          });
        } else {
          // The picture couldn't be captured. Say what it showed rather than
          // leaving a gap where the student remembers a drawing.
          blocks.push({
            kind: "paragraph",
            italic: true,
            text: `[a drawing of ${action.prompt}]`,
          });
        }
        cite(action);
        break;
      }

      case "ask_question": {
        blocks.push({ kind: "paragraph", text: `Check yourself: ${action.question}` });
        if (action.choices?.length) {
          blocks.push({ kind: "bullets", items: action.choices });
        }
        if (action.answer) {
          blocks.push({ kind: "paragraph", italic: true, text: `Answer: ${action.answer}` });
        }
        if (action.explanation) {
          blocks.push({ kind: "paragraph", text: action.explanation });
        }
        blocks.push({ kind: "spacer" });
        break;
      }

      // Board bookkeeping: meaningless once the board is a document.
      case "highlight":
      case "erase":
      case "remember":
      case "done":
        break;
    }
  }

  return { blocks, pending };
}

/** Fills the image placeholders, in the order boardToBlocks emitted them. */
export function attachImages(
  blocks: DocxBlock[],
  rendered: { data: Uint8Array; widthPx: number; heightPx: number }[],
): DocxBlock[] {
  let i = 0;
  return blocks
    .map((block) => {
      if (block.kind !== "image") return block;
      const image = rendered[i++];
      // A card that failed to rasterise is dropped rather than shipped as a
      // zero-byte image Word will refuse to open.
      if (!image?.data.length) return null;
      return { ...block, image: { ...block.image, ...image } };
    })
    .filter((b): b is DocxBlock => b !== null);
}
