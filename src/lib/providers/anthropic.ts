import { readSSE } from "./sse";
import {
  type Provider,
  type StreamOptions,
  type ValidationResult,
  throwForResponse,
} from "./types";

const BASE = "https://api.anthropic.com/v1";

/**
 * Anthropic goes straight from the browser, which needs an explicit opt-in
 * header — otherwise the API refuses to send CORS headers to a page origin.
 */
function headers(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

/** `output_config.effort` is a 4.6-and-later parameter; older ids reject it. */
function supportsEffort(model: string): boolean {
  return /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable-5)/.test(model);
}

function buildContent(text: string, images?: { mediaType: string; base64: string }[]) {
  if (!images?.length) return text;
  return [
    ...images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType,
        data: img.base64,
      },
    })),
    { type: "text" as const, text },
  ];
}

export const anthropic: Provider = {
  id: "anthropic",
  label: "Anthropic",
  blurb: "Claude — strongest at long step-by-step explanation and clean LaTeX.",
  keyPrefix: "sk-ant-",
  keyUrl: "https://console.anthropic.com/settings/keys",
  allowsCustomModel: true,
  models: [
    {
      id: "claude-opus-5",
      label: "Claude Opus 5",
      inputPrice: 5,
      outputPrice: 25,
      vision: true,
      note: "Best reasoning. Reach for it on proofs and hard problem sets.",
    },
    {
      id: "claude-sonnet-5",
      label: "Claude Sonnet 5",
      inputPrice: 2,
      outputPrice: 10,
      vision: true,
      note: "The everyday pick — fast, cheap enough to run a whole study session.",
    },
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      inputPrice: 1,
      outputPrice: 5,
      vision: true,
      note: "Cheapest. Fine for flashcard-grade review.",
    },
    {
      id: "claude-opus-4-8",
      label: "Claude Opus 4.8",
      inputPrice: 5,
      outputPrice: 25,
      vision: true,
    },
  ],

  async validateKey(apiKey, signal): Promise<ValidationResult> {
    try {
      const response = await fetch(`${BASE}/models?limit=1`, {
        headers: headers(apiKey),
        signal,
      });
      if (response.ok) return { ok: true, message: "Key works." };
      if (response.status === 401)
        return { ok: false, message: "Anthropic rejected that key." };
      const body = await response.text();
      return { ok: false, message: `Anthropic returned ${response.status}: ${body.slice(0, 160)}` };
    } catch (error) {
      return {
        ok: false,
        message: `Couldn't reach Anthropic: ${(error as Error).message}`,
      };
    }
  },

  async stream(options: StreamOptions): Promise<void> {
    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens ?? 8000,
      system: options.system,
      stream: true,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: buildContent(m.content, m.images),
      })),
    };
    if (supportsEffort(options.model)) {
      // Lessons want pace over deliberation; the schema does the thinking.
      body.output_config = { effort: options.effort ?? "low" };
    } else if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch(`${BASE}/messages`, {
      method: "POST",
      headers: headers(options.apiKey),
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!response.ok) await throwForResponse(response, "Anthropic");

    let inputTokens = 0;
    let outputTokens = 0;

    await readSSE(response, (data) => {
      if (!data || data === "[DONE]") return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = event.type as string | undefined;

      if (type === "content_block_delta") {
        const delta = event.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) options.onText(delta.text);
        return;
      }
      if (type === "message_start") {
        const usage = (event.message as { usage?: Record<string, number> } | undefined)
          ?.usage;
        if (usage) {
          inputTokens =
            (usage.input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0);
        }
        return;
      }
      if (type === "message_delta") {
        const usage = event.usage as Record<string, number> | undefined;
        if (usage?.output_tokens) outputTokens = usage.output_tokens;
        return;
      }
      if (type === "error") {
        const err = event.error as { message?: string } | undefined;
        throw new Error(err?.message ?? "Anthropic stream error");
      }
    });

    options.onUsage?.({ inputTokens, outputTokens });
  },
};
