import type { MaterialChunk } from "../db";
import { estimateTokens } from "./chunk";
import { cosine, fuseRankings } from "./vector";

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

/**
 * How much of the student's material one turn is allowed to carry, in
 * characters (~4 chars/token). This is the single largest input-token cost in
 * a typed turn — larger than the system prompt and the conversation history
 * combined — and unlike either of those, it can't benefit from prompt
 * caching, because retrieval pulls different chunks on every question.
 *
 * BM25/hybrid retrieval front-loads the most relevant chunks first, so the
 * far end of this budget is doing much less work than the front of it —
 * cutting it costs more in reach (how much of a long document one turn can
 * see) than it does in relevance (which chunks show up at all).
 */
export const DEFAULT_CHAR_BUDGET = 12_000;

export interface RetrievalResult {
  chunks: MaterialChunk[];
  /** True when the whole material fit and nothing was selected away. */
  complete: boolean;
  totalChunks: number;
  /**
   * True when BM25 actually matched query terms. False means the ordering is
   * just "the opening of the material" — a fallback, not a ranking, and it
   * must not outvote a real semantic hit during fusion.
   */
  matched: boolean;
}

export function retrieve(
  chunks: MaterialChunk[],
  query: string,
  charBudget = DEFAULT_CHAR_BUDGET,
): RetrievalResult {
  if (!chunks.length) return { chunks: [], complete: true, totalChunks: 0, matched: false };

  const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
  if (totalChars <= charBudget) {
    return { chunks, complete: true, totalChunks: chunks.length, matched: false };
  }

  const queryTerms = terms(query);
  if (!queryTerms.length) {
    // No usable query (a bare "keep going") — the opening of each material is
    // the least-bad default.
    return { chunks: fill(chunks, charBudget), complete: false, totalChunks: chunks.length, matched: false };
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
    return { chunks: fill(chunks, charBudget), complete: false, totalChunks: N, matched: false };
  }

  // Keep document order in the prompt so the tutor reads material forwards.
  const picked = fill(hits, charBudget).sort((a, b2) => a.order - b2.order);
  return { chunks: picked, complete: picked.length === N, totalChunks: N, matched: true };
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

/**
 * BM25 and cosine, fused by rank.
 *
 * Lexical retrieval wins on locators and exact terminology; semantic wins on
 * paraphrase. Neither is reliably better, so both vote. Falls back to plain
 * BM25 when the query or the chunks have no vectors.
 */
export function retrieveHybrid(
  chunks: MaterialChunk[],
  query: string,
  queryVector: number[] | null,
  charBudget = DEFAULT_CHAR_BUDGET,
): RetrievalResult {
  const lexical = retrieve(chunks, query, charBudget);
  if (!queryVector?.length) return lexical;

  const embedded = chunks.filter((c) => c.embedding?.length);
  if (!embedded.length) return lexical;

  // Everything already fit — fusion can only reorder what's all going in anyway.
  if (lexical.complete && lexical.chunks.length === chunks.length) return lexical;

  const semantic = embedded
    .map((chunk) => ({ chunk, score: cosine(queryVector, chunk.embedding!) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.chunk);

  if (!semantic.length) return lexical;

  // When BM25 matched nothing, its "ranking" is just the opening of the
  // material. Letting that vote would bury the one chunk the student actually
  // asked about — which is precisely the paraphrase case semantic search exists
  // for. So it only joins the fusion when it genuinely matched something.
  const fused = lexical.matched
    ? fuseRankings<MaterialChunk>([lexical.chunks, semantic], (chunk) => chunk.id)
    : semantic;

  const picked = fill(fused, charBudget).sort((a, b) => a.order - b.order);
  return {
    chunks: picked,
    complete: picked.length === chunks.length,
    totalChunks: chunks.length,
    matched: true,
  };
}
