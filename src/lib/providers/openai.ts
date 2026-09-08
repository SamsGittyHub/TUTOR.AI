import { readSSE } from "./sse";
import {
  type ChatMessage,
  type Provider,
  type StreamOptions,
  type ValidationResult,
  throwForResponse,
} from "./types";

const BASE = "https://api.openai.com/v1";

/** Shared by OpenAI and OpenRouter — same chat-completions wire format. */
export function toOpenAIMessages(system: string, messages: ChatMessage[]) {
  return [
    { role: "system", content: system },
    ...messages.map((m) => {
      if (!m.images?.length) return { role: m.role, content: m.content };
      return {
        role: m.role,
        content: [
          ...m.images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
          })),
          { type: "text" as const, text: m.content },
        ],
      };
    }),
  ];
}

export async function streamOpenAICompatible(
  url: string,
  extraHeaders: Record<string, string>,
  label: string,
  options: StreamOptions,
  extraBody: Record<string, unknown> = {},
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model: options.model,
      messages: toOpenAIMessages(options.system, options.messages),
      max_completion_tokens: options.maxTokens ?? 8000,
      stream: true,
      stream_options: { include_usage: true },
      ...extraBody,
    }),
    signal: options.signal,
  });
  if (!response.ok) await throwForResponse(response, label);

  let inputTokens = 0;
  let outputTokens = 0;

  await readSSE(response, (data) => {
    if (!data || data === "[DONE]") return;
    let event: {
      choices?: { delta?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (event.error?.message) throw new Error(`${label}: ${event.error.message}`);
    const delta = event.choices?.[0]?.delta?.content;
    if (delta) options.onText(delta);
    if (event.usage) {
      inputTokens = event.usage.prompt_tokens ?? inputTokens;
      outputTokens = event.usage.completion_tokens ?? outputTokens;
    }
  });

  options.onUsage?.({ inputTokens, outputTokens });
}

export const openai: Provider = {
  id: "openai",
  label: "OpenAI",
  blurb: "GPT models. Reliable JSON, wide model range, easy key to get.",
  keyPrefix: "sk-",
  keyUrl: "https://platform.openai.com/api-keys",
  allowsCustomModel: true,
  models: [
    { id: "gpt-4.1", label: "GPT-4.1", inputPrice: 2, outputPrice: 8, vision: true },
    {
      id: "gpt-4.1-mini",
      label: "GPT-4.1 mini",
      inputPrice: 0.4,
      outputPrice: 1.6,
      vision: true,
      note: "Cheap and quick — good default for review sessions.",
    },
    { id: "gpt-4o", label: "GPT-4o", inputPrice: 2.5, outputPrice: 10, vision: true },
    { id: "o4-mini", label: "o4-mini", inputPrice: 1.1, outputPrice: 4.4, vision: true },
  ],

  async validateKey(apiKey, signal): Promise<ValidationResult> {
    try {
      const response = await fetch(`${BASE}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal,
      });
      if (response.ok) return { ok: true, message: "Key works." };
      if (response.status === 401)
        return { ok: false, message: "OpenAI rejected that key." };
      const body = await response.text();
      return { ok: false, message: `OpenAI returned ${response.status}: ${body.slice(0, 160)}` };
    } catch (error) {
      return { ok: false, message: `Couldn't reach OpenAI: ${(error as Error).message}` };
    }
  },

  async stream(options: StreamOptions): Promise<void> {
    // Reasoning models reject `temperature`; everything else accepts it.
    const isReasoning = /^(o\d|gpt-5)/.test(options.model);
    return streamOpenAICompatible(
      `${BASE}/chat/completions`,
      {},
      "OpenAI",
      options,
      isReasoning
        ? { reasoning_effort: options.effort ?? "low" }
        : { temperature: options.temperature ?? 0.4 },
    );
  },
};
