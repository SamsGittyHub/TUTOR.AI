import { readSSE } from "./sse";
import {
  type Provider,
  type StreamOptions,
  type ValidationResult,
  throwForResponse,
} from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const google: Provider = {
  id: "google",
  label: "Google",
  blurb: "Gemini. Huge context window — good when you upload a whole textbook.",
  keyPrefix: "AIza",
  keyUrl: "https://aistudio.google.com/apikey",
  allowsCustomModel: true,
  models: [
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      inputPrice: 1.25,
      outputPrice: 10,
      vision: true,
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      inputPrice: 0.3,
      outputPrice: 2.5,
      vision: true,
      note: "Free tier available — the cheapest way to try the tutor.",
    },
    {
      id: "gemini-2.0-flash",
      label: "Gemini 2.0 Flash",
      inputPrice: 0.1,
      outputPrice: 0.4,
      vision: true,
    },
  ],

  async validateKey(apiKey, signal): Promise<ValidationResult> {
    try {
      const response = await fetch(`${BASE}/models?key=${encodeURIComponent(apiKey)}`, {
        signal,
      });
      if (response.ok) return { ok: true, message: "Key works." };
      const body = await response.text();
      if (response.status === 400 || response.status === 403)
        return { ok: false, message: "Google rejected that key." };
      return { ok: false, message: `Google returned ${response.status}: ${body.slice(0, 160)}` };
    } catch (error) {
      return { ok: false, message: `Couldn't reach Google: ${(error as Error).message}` };
    }
  },

  async stream(options: StreamOptions): Promise<void> {
    const contents = options.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        ...(m.images ?? []).map((img) => ({
          inline_data: { mime_type: img.mediaType, data: img.base64 },
        })),
        { text: m.content },
      ],
    }));

    const url =
      `${BASE}/models/${encodeURIComponent(options.model)}:streamGenerateContent` +
      `?alt=sse&key=${encodeURIComponent(options.apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: options.system }] },
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 8000,
          temperature: options.temperature ?? 0.4,
        },
      }),
      signal: options.signal,
    });
    if (!response.ok) await throwForResponse(response, "Google");

    let inputTokens = 0;
    let outputTokens = 0;

    await readSSE(response, (data) => {
      if (!data) return;
      let event: {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        error?: { message?: string };
      };
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      if (event.error?.message) throw new Error(`Google: ${event.error.message}`);
      for (const part of event.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) options.onText(part.text);
      }
      if (event.usageMetadata) {
        inputTokens = event.usageMetadata.promptTokenCount ?? inputTokens;
        outputTokens = event.usageMetadata.candidatesTokenCount ?? outputTokens;
      }
    });

    options.onUsage?.({ inputTokens, outputTokens });
  },
};
