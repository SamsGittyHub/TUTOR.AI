/**
 * Vector maths and rank fusion for hybrid retrieval.
 *
 * Kept separate from the embedding call so it's pure and testable — the parts
 * that can silently ruin retrieval (an unnormalized vector, a fusion that
 * ignores one ranker) are exactly the parts worth unit tests.
 */

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += a[i] * b[i];
  return sum;
}

export function magnitude(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity, 0 when either vector is empty or degenerate. */
export function cosine(a: number[], b: number[]): number {
  const denominator = magnitude(a) * magnitude(b);
  return denominator === 0 ? 0 : dot(a, b) / denominator;
}

/**
 * Reciprocal rank fusion.
 *
 * Blending a BM25 score with a cosine score directly means comparing numbers
 * on different scales, and whichever happens to be larger wins. RRF only looks
 * at each ranker's ordering, which is the part that's actually comparable. k=60
 * is the value from the original paper and is not sensitive.
 */
export function fuseRankings<T>(
  rankings: T[][],
  identity: (item: T) => string,
  k = 60,
): T[] {
  const scores = new Map<string, number>();
  const items = new Map<string, T>();

  for (const ranking of rankings) {
    ranking.forEach((item, index) => {
      const id = identity(item);
      items.set(id, item);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => items.get(id)!)
    .filter(Boolean);
}
