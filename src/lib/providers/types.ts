export type ProviderId = "anthropic" | "openai" | "google" | "openrouter";

export interface ImagePart {
  /** e.g. "image/png" */
  mediaType: string;
  /** Bare base64, no data: prefix. */
  base64: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: ImagePart[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface StreamOptions {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** Maps to native effort/reasoning controls where the provider has them. */
  effort?: "low" | "medium" | "high";
  temperature?: number;
  signal?: AbortSignal;
  onText: (delta: string) => void;
  onUsage?: (usage: Usage) => void;
}

export interface ModelInfo {
  id: string;
  label: string;
  /** USD per million tokens, for the cost readout. Omit when unknown. */
  inputPrice?: number;
  outputPrice?: number;
  vision?: boolean;
  note?: string;
}

export interface ValidationResult {
  ok: boolean;
  message: string;
}

export interface Provider {
  id: ProviderId;
  label: string;
  blurb: string;
  keyPrefix: string;
  keyUrl: string;
  models: ModelInfo[];
  /** Model ids not in `models` are allowed — the field is free text. */
  allowsCustomModel: boolean;
  validateKey(apiKey: string, signal?: AbortSignal): Promise<ValidationResult>;
  stream(options: StreamOptions): Promise<void>;
}

export class ProviderError extends Error {
  readonly status?: number;
  readonly hint?: string;

  constructor(message: string, status?: number, hint?: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.hint = hint;
  }
}

/** Turns a failed provider response into something a student can act on. */
export async function throwForResponse(
  response: Response,
  providerLabel: string,
): Promise<never> {
  let detail = "";
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string; type?: string } | string;
        message?: string;
      };
      const err = parsed.error;
      detail =
        (typeof err === "string" ? err : err?.message) ?? parsed.message ?? text;
    } catch {
      detail = text;
    }
  } catch {
    /* body already consumed or unreadable */
  }

  const hints: Record<number, string> = {
    401: "That key was rejected. Check for a stray space, or that it belongs to this provider.",
    403: "The key is valid but not allowed to use this model. Check your plan or model access.",
    404: "That model id doesn't exist for this provider. Pick another from the list.",
    413: "The request was too large — trim the material context or use a smaller excerpt.",
    429: "Rate limited or out of credit on your account. Wait a moment or top up.",
  };

  throw new ProviderError(
    `${providerLabel} returned ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ""}`,
    response.status,
    hints[response.status],
  );
}
