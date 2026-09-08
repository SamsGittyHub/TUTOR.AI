import { streamOpenAICompatible } from "./openai";
import {
  type Provider,
  type StreamOptions,
  type ValidationResult,
} from "./types";

const BASE = "https://openrouter.ai/api/v1";

function referer(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return {
    "HTTP-Referer": window.location.origin,
    "X-Title": "Chalk AI Tutor",
  };
}

/** The catch-all: Llama, Mistral, DeepSeek, Qwen, and anything else routed. */
export const openrouter: Provider = {
  id: "openrouter",
  label: "OpenRouter",
  blurb: "One key, hundreds of models — including open-weight and free tiers.",
  keyPrefix: "sk-or-",
  keyUrl: "https://openrouter.ai/keys",
  allowsCustomModel: true,
  models: [
    {
      id: "deepseek/deepseek-chat",
      label: "DeepSeek Chat",
      inputPrice: 0.27,
      outputPrice: 1.1,
      note: "Strong math for the price.",
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct",
      label: "Llama 3.3 70B",
      inputPrice: 0.12,
      outputPrice: 0.3,
    },
    {
      id: "qwen/qwen-2.5-72b-instruct",
      label: "Qwen 2.5 72B",
      inputPrice: 0.12,
      outputPrice: 0.39,
    },
    {
      id: "mistralai/mistral-small-3.2-24b-instruct",
      label: "Mistral Small 3.2",
      inputPrice: 0.05,
      outputPrice: 0.1,
      note: "Pennies per session. Expect rougher diagrams.",
    },
  ],

  async validateKey(apiKey, signal): Promise<ValidationResult> {
    try {
      const response = await fetch(`${BASE}/auth/key`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal,
      });
      if (response.ok) {
        const body = (await response.json()) as {
          data?: { limit_remaining?: number | null; usage?: number };
        };
        const remaining = body.data?.limit_remaining;
        return {
          ok: true,
          message:
            remaining === null || remaining === undefined
              ? "Key works."
              : `Key works. $${remaining.toFixed(2)} of credit left.`,
        };
      }
      if (response.status === 401)
        return { ok: false, message: "OpenRouter rejected that key." };
      const text = await response.text();
      return {
        ok: false,
        message: `OpenRouter returned ${response.status}: ${text.slice(0, 160)}`,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Couldn't reach OpenRouter: ${(error as Error).message}`,
      };
    }
  },

  async stream(options: StreamOptions): Promise<void> {
    return streamOpenAICompatible(
      `${BASE}/chat/completions`,
      referer(),
      "OpenRouter",
      options,
      { temperature: options.temperature ?? 0.4 },
    );
  },
};
