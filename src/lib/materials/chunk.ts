import type { MaterialChunk } from "../db";

/** Rough token estimate — good enough for budgeting, not for billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface SourceUnit {
  /** "page 3", "slide 8", "04:12" */
  locator: string;
  text: string;
}

const TARGET_CHARS = 3200; // ≈800 tokens
const MIN_CHARS = 400;

/**
 * Splits extracted text into chunks that keep their place in the original.
 *
 * A page that's already the right size stays whole — splitting a slide in half
 * costs the tutor the one thing that makes citations work. Long pages break on
 * paragraph boundaries, then on sentences, and only then mid-text.
 */
export function chunkUnits(materialId: string, units: SourceUnit[]): MaterialChunk[] {
  const chunks: MaterialChunk[] = [];
  let order = 0;
  let carry = "";
  let carryLocator = "";

  const flush = () => {
    const text = carry.trim();
    if (text.length) {
      chunks.push({
        id: `${materialId}:${order}`,
        materialId,
        locator: carryLocator,
        text,
        order,
      });
      order += 1;
    }
    carry = "";
    carryLocator = "";
  };

  for (const unit of units) {
    const clean = unit.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!clean) continue;

    if (clean.length <= TARGET_CHARS) {
      // Small units ride together until they're worth storing separately.
      if (carry.length + clean.length > TARGET_CHARS) flush();
      if (!carry) carryLocator = unit.locator;
      else if (carryLocator && !carryLocator.includes("–"))
        carryLocator = `${carryLocator}–${unit.locator}`;
      carry += (carry ? "\n\n" : "") + clean;
      if (carry.length >= TARGET_CHARS - MIN_CHARS) flush();
      continue;
    }

    flush();
    for (const piece of splitLong(clean)) {
      chunks.push({
        id: `${materialId}:${order}`,
        materialId,
        locator: unit.locator,
        text: piece,
        order,
      });
      order += 1;
    }
  }
  flush();
  return chunks;
}

function splitLong(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const out: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > TARGET_CHARS) {
      push();
      const sentences = paragraph.match(/[^.!?]+[.!?]+|\S+$/g) ?? [paragraph];
      for (const sentence of sentences) {
        if (current.length + sentence.length > TARGET_CHARS) push();
        if (sentence.length > TARGET_CHARS) {
          for (let i = 0; i < sentence.length; i += TARGET_CHARS) {
            out.push(sentence.slice(i, i + TARGET_CHARS).trim());
          }
          continue;
        }
        current += sentence;
      }
      push();
      continue;
    }
    if (current.length + paragraph.length > TARGET_CHARS) push();
    current += (current ? "\n\n" : "") + paragraph;
  }
  push();
  return out.filter(Boolean);
}
