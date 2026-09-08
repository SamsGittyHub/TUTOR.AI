import type { MaterialChunk } from "../db";
import { estimateTokens } from "./chunk";

/**
 * Retrieval without a vector database.
 *
 * The PRD sketches embeddings and pgvector. Running entirely in the browser on
 * the student's own key, that would mean an extra paid embedding call per
 * upload and a second index to keep in sync. BM25 over a few hundred chunks
 * costs nothing, runs in a millisecond, and — for "explain slide 12" or "what's
 * a Krebs cycle intermediate" — finds the same passages. Short materials skip
 * retrieval entirely and get stuffed whole.
 */

const STOPWORDS = new Set(
  ("a an and are as at be by for from has have how i in is it its of on or that " +
    "the this to was what when where which who why with you your explain me my " +
    "please can could would about again more some do does did").split(" "),
);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export interface RetrievalResult {
  chunks: MaterialChunk[];
  /** True when the whole material fit and nothing was selected away. */
  complete: boolean;
  totalChunks: number;
}

export function retrieve(
  chunks: MaterialChunk[],
  query: string,
  charBudget = 24_000,
): RetrievalResult {
  if (!chunks.length) return { chunks: [], complete: true, totalChunks: 0 };

  const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
  if (totalChars <= charBudget) {
    return { chunks, complete: true, totalChunks: chunks.length };
  }

  const queryTerms = terms(query);
  if (!queryTerms.length) {
    // No usable query (a bare "keep going") — the opening of each material is
    // the least-bad default.
    return { chunks: fill(chunks, charBudget), complete: false, totalChunks: chunks.length };
  }

  const docTerms = chunks.map((c) => terms(c.text));
  const df = new Map<string, number>();
  for (const list of docTerms) {
    for (const term of new Set(list)) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const N = chunks.length;
  const avgLen = docTerms.reduce((s, t) => s + t.length, 0) / N;

  // Locators are their own tiny corpus. "page" appears in every one of them and
  // means nothing; "17" appears in one and means everything. Weighting the
  // locator match by rarity is what makes "explain page 17 again" land.
  const locatorDf = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of new Set(terms(chunk.locator))) {
      locatorDf.set(term, (locatorDf.get(term) ?? 0) + 1);
    }
  }
  const k1 = 1.4;
  const b = 0.72;

  const scored = chunks.map((chunk, i) => {
    const counts = new Map<string, number>();
    for (const term of docTerms[i]) counts.set(term, (counts.get(term) ?? 0) + 1);
    const len = docTerms[i].length || 1;

    let score = 0;
    for (const term of queryTerms) {
      const tf = counts.get(term);
      if (!tf) continue;
      const idf = Math.log(1 + (N - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / avgLen)));
    }
    const locatorTerms = new Set(terms(chunk.locator));
    for (const term of queryTerms) {
      if (!locatorTerms.has(term)) continue;
      score += 5 * Math.log(1 + N / (1 + (locatorDf.get(term) ?? 0)));
    }
    return { chunk, score };
  });

  const hits = scored
    .filter((s) => s.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .map((s) => s.chunk);

  if (!hits.length) {
    return { chunks: fill(chunks, charBudget), complete: false, totalChunks: N };
  }

  // Keep document order in the prompt so the tutor reads material forwards.
  const picked = fill(hits, charBudget).sort((a, b2) => a.order - b2.order);
  return { chunks: picked, complete: picked.length === N, totalChunks: N };
}

function fill(chunks: MaterialChunk[], charBudget: number): MaterialChunk[] {
  const out: MaterialChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    if (used + chunk.text.length > charBudget && out.length) break;
    out.push(chunk);
    used += chunk.text.length;
  }
  return out;
}

/** Renders retrieved chunks as the `materialContext` block in the prompt. */
export function formatContext(
  chunks: MaterialChunk[],
  nameOf: (materialId: string) => string,
): string {
  if (!chunks.length) return "";
  const parts = chunks.map(
    (chunk) =>
      `<excerpt material="${nameOf(chunk.materialId)}" id="${chunk.materialId}" locator="${chunk.locator}">\n${chunk.text}\n</excerpt>`,
  );
  const tokens = parts.reduce((sum, p) => sum + estimateTokens(p), 0);
  return `${parts.join("\n\n")}\n<!-- ~${tokens} tokens of material -->`;
}
