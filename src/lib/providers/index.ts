import { anthropic } from "./anthropic";
import { google } from "./google";
import { openai } from "./openai";
import { openrouter } from "./openrouter";
import type { ModelInfo, Provider, ProviderId } from "./types";

export * from "./types";

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic,
  openai,
  google,
  openrouter,
};

export const PROVIDER_LIST: Provider[] = [anthropic, openai, google, openrouter];

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS[id];
}

export function findModel(id: ProviderId, modelId: string): ModelInfo | undefined {
  return PROVIDERS[id].models.find((m) => m.id === modelId);
}

/** Rough dollar cost of a turn. Returns null when we don't know the prices. */
export function estimateCost(
  providerId: ProviderId,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const model = findModel(providerId, modelId);
  if (!model?.inputPrice || !model.outputPrice) return null;
  return (
    (inputTokens / 1_000_000) * model.inputPrice +
    (outputTokens / 1_000_000) * model.outputPrice
  );
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
