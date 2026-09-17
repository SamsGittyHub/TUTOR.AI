"use client";

import type { ProviderId } from "../providers/types";

/**
 * Embeddings from the student's own provider.
 *
 * The alternative was shipping a 25 MB transformer to every browser. Using the
 * provider they already have a key for costs about $0.00002 per page, runs
 * once per upload, and needs no new dependency — which is the same reasoning
 * that put inference on their key in the first place.
 *
 * Anthropic has no embedding endpoint, so a Claude user falls back to BM25.
 * That's the honest degradation: retrieval gets worse at paraphrase, not
 * broken.
 */

export interface EmbedModel {
  provider: ProviderId;
  model: string;
  endpoint: string;
}

export const EMBED_MODELS: Partial<Record<ProviderId, EmbedModel>> = {
  openai: {
    provider: "openai",
    model: "text-embedding-3-small",
    endpoint: "https://api.openai.com/v1/embeddings",
  },
  google: {
    provider: "google",
    model: "text-embedding-004",
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents",
  },
};

/** Which provider can embed, given the keys on hand. */
export function embedderFor(
  keys: Partial<Record<ProviderId, string>>,
): { model: EmbedModel; apiKey: string } | null {
  for (const id of ["openai", "google"] as const) {
    const model = EMBED_MODELS[id];
    const apiKey = keys[id];
    if (model && apiKey) return { model, apiKey };
  }
  return null;
}

/** Providers cap batch size; 96 is under every one of them. */
const BATCH = 96;

async function embedOpenAI(
  texts: string[],
  model: EmbedModel,
  apiKey: string,
  signal?: AbortSignal,
): Promise<number[][]> {
  const response = await fetch(model.endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: model.model, input: texts }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Embedding failed (${response.status}).`);
  }
  const body = (await response.json()) as {
    data?: { index: number; embedding: number[] }[];
  };
  // The API is documented to preserve order, but it also returns an index —
  // trusting the index costs nothing and survives that changing.
  const out: number[][] = new Array(texts.length);
  for (const row of body.data ?? []) out[row.index] = row.embedding;
  return out;
}

async function embedGoogle(
  texts: string[],
  model: EmbedModel,
  apiKey: string,
  signal?: AbortSignal,
): Promise<number[][]> {
  const response = await fetch(`${model.endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model.model}`,
        content: { parts: [{ text }] },
      })),
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Embedding failed (${response.status}).`);
  }
  const body = (await response.json()) as {
    embeddings?: { values: number[] }[];
  };
  return (body.embeddings ?? []).map((e) => e.values);
}

/** Embeds a list of texts, in batches, preserving order. */
export async function embedTexts(
  texts: string[],
  model: EmbedModel,
  apiKey: string,
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vectors =
      model.provider === "google"
        ? await embedGoogle(slice, model, apiKey, options.signal)
        : await embedOpenAI(slice, model, apiKey, options.signal);
    out.push(...vectors);
    options.onProgress?.(Math.min(i + BATCH, texts.length), texts.length);
  }
  return out;
}
