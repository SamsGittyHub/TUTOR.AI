"use client";

import { normalizeAction, actionToText, type TutorAction } from "../actions";
import type { Material, MaterialChunk, QuizQuestion, TranscriptEntry } from "../db";
import { formatContext, retrieve } from "../materials/retrieve";
import { getProvider, type ChatMessage, type ImagePart, type ProviderId, type Usage } from "../providers";
import { extractFirstJson, JsonObjectStream } from "../stream-json";
import {
  buildQuizPrompt,
  buildSystemPrompt,
  REPAIR_INSTRUCTION,
} from "./prompts";

export interface TurnRequest {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  studentMessage: string;
  transcript: TranscriptEntry[];
  materials: Material[];
  chunks: MaterialChunk[];
  boardSummary: string;
  onAction: (action: TutorAction) => void;
  onStray?: (text: string) => void;
  signal?: AbortSignal;
}

export interface TurnResult {
  actions: TutorAction[];
  usage: Usage;
  /** Set when the model needed a second pass or fell back to plain text. */
  degraded?: "repaired" | "plain-text";
  citedLocators: string[];
}

const MAX_TRANSCRIPT_ENTRIES = 16;
const MAX_IMAGES = 4;

/** Chunks written by the extractor when a page could only be captured visually. */
function isImageBacked(chunk: MaterialChunk): boolean {
  return /^\[(Photo of notes|Page \d+ has no selectable text)/.test(chunk.text);
}

function collectImages(
  materials: Material[],
  chunks: MaterialChunk[],
): ImagePart[] {
  const wanted = new Set(
    chunks.filter(isImageBacked).map((c) => `${c.materialId}::${c.locator}`),
  );
  if (!wanted.size) return [];

  const images: ImagePart[] = [];
  for (const material of materials) {
    for (const image of material.images ?? []) {
      if (images.length >= MAX_IMAGES) return images;
      if (wanted.has(`${material.id}::${image.locator}`)) {
        images.push({ mediaType: image.mediaType, base64: image.base64 });
      }
    }
  }
  return images;
}

function buildMessages(request: TurnRequest): ChatMessage[] {
  const history = request.transcript.slice(-MAX_TRANSCRIPT_ENTRIES);
  const messages: ChatMessage[] = history.map((entry) => ({
    role: entry.role === "student" ? "user" : "assistant",
    content: entry.text,
  }));

  // Retrieval keys off what the student just said plus the last thing taught,
  // so "explain that again" still lands on the right passage.
  const lastTutor = [...history].reverse().find((e) => e.role === "tutor")?.text ?? "";
  const query = `${request.studentMessage}\n${lastTutor.slice(0, 400)}`;
  const result = retrieve(request.chunks, query);

  const nameOf = (id: string) =>
    request.materials.find((m) => m.id === id)?.name ?? "material";
  const context = formatContext(result.chunks, nameOf);

  const blocks: string[] = [];
  if (context) {
    blocks.push(
      `<material${result.complete ? "" : ` note="${result.chunks.length} of ${result.totalChunks} excerpts, selected for this question"`}>\n${context}\n</material>`,
    );
  }
  if (request.boardSummary) {
    blocks.push(`<board>\nAlready on the board:\n${request.boardSummary}\n</board>`);
  }
  blocks.push(request.studentMessage);

  messages.push({
    role: "user",
    content: blocks.join("\n\n"),
    images: collectImages(request.materials, result.chunks),
  });

  return messages;
}

/**
 * Runs one tutor turn end to end: retrieve, stream, parse, repair.
 *
 * Actions reach `onAction` as they close, not when the stream finishes — that
 * progressive delivery is the whole "being taught live" feel, and it's why the
 * parser is tolerant rather than strict.
 */
export async function runTutorTurn(request: TurnRequest): Promise<TurnResult> {
  const provider = getProvider(request.providerId);
  const system = buildSystemPrompt({
    materials: request.materials,
    hasMaterialContext: request.chunks.length > 0,
  });
  const messages = buildMessages(request);

  const actions: TutorAction[] = [];
  const seenIds = new Set<string>();
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };

  const consume = (raw: unknown) => {
    const action = normalizeAction(raw);
    if (!action) return;
    // Models reuse ids across turns; keep them unique so highlight/erase and
    // React keys stay honest.
    if (seenIds.has(action.id)) action.id = `${action.id}_${actions.length}`;
    seenIds.add(action.id);
    actions.push(action);
    request.onAction(action);
  };

  const runPass = async (passMessages: ChatMessage[]) => {
    const parser = new JsonObjectStream();
    await provider.stream({
      apiKey: request.apiKey,
      model: request.model,
      system,
      messages: passMessages,
      maxTokens: 8000,
      effort: "low",
      signal: request.signal,
      onText: (delta) => {
        for (const object of parser.push(delta)) consume(object);
      },
      onUsage: (u) => {
        usage = {
          inputTokens: usage.inputTokens + u.inputTokens,
          outputTokens: usage.outputTokens + u.outputTokens,
        };
      },
    });
    const trailing = parser.flush();
    return { stray: parser.stray, trailing };
  };

  const first = await runPass(messages);

  let degraded: TurnResult["degraded"];

  if (!actions.length) {
    // Second chance: hand the model its own output and the rule it broke.
    const rawText = `${first.stray} ${first.trailing}`.trim();
    if (rawText && !request.signal?.aborted) {
      degraded = "repaired";
      const repairMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: rawText.slice(0, 4000) },
        { role: "user", content: REPAIR_INSTRUCTION },
      ];
      try {
        await runPass(repairMessages);
      } catch {
        /* fall through to plain text */
      }
    }

    if (!actions.length && rawText) {
      // Third fallback: the student still gets taught, just without a board.
      degraded = "plain-text";
      for (const paragraph of rawText.split(/\n{2,}/).slice(0, 6)) {
        if (!paragraph.trim()) continue;
        const action = normalizeAction({ type: "say", text: paragraph.trim() });
        if (action) {
          actions.push(action);
          request.onAction(action);
        }
      }
      request.onStray?.(rawText);
    }
  }

  const citedLocators = [
    ...new Set(
      actions.flatMap((a) => (a.sourceRefs ?? []).map((r) => r.locator)).filter(Boolean),
    ),
  ];

  return { actions, usage, degraded, citedLocators };
}

/** Compact transcript line for the next turn's history. */
export function summarizeTurn(actions: TutorAction[]): string {
  return actions.map(actionToText).join("\n");
}

/** What's currently on the board, as the model needs to see it. */
export function boardSummary(actions: TutorAction[]): string {
  const erased = new Set(
    actions.filter((a) => a.type === "erase").map((a) => (a as { targetId: string }).targetId),
  );
  return actions
    .filter((a) => !erased.has(a.id))
    .filter((a) => a.type !== "say" && a.type !== "done" && a.type !== "erase")
    .slice(-14)
    .map(actionToText)
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Quiz generation                                                             */
/* -------------------------------------------------------------------------- */

export interface QuizRequest {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  materials: Material[];
  chunks: MaterialChunk[];
  topic: string;
  count: number;
  signal?: AbortSignal;
}

interface RawQuestion {
  prompt?: string;
  question?: string;
  choices?: unknown;
  answer?: unknown;
  explanation?: unknown;
  sourceLocator?: unknown;
  source_locator?: unknown;
  sourceMaterial?: unknown;
  source_material?: unknown;
}

export async function generateQuiz(
  request: QuizRequest,
): Promise<{ questions: QuizQuestion[]; usage: Usage }> {
  const provider = getProvider(request.providerId);
  const result = retrieve(request.chunks, request.topic || "key concepts", 32_000);
  const nameOf = (id: string) =>
    request.materials.find((m) => m.id === id)?.name ?? "material";
  const context = formatContext(result.chunks, nameOf);

  let text = "";
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };

  await provider.stream({
    apiKey: request.apiKey,
    model: request.model,
    system:
      "You write practice questions for a student, drawn strictly from their own study material. You reply with JSON and nothing else.",
    messages: [
      {
        role: "user",
        content: context
          ? `<material>\n${context}\n</material>\n\n${buildQuizPrompt(request.count, request.topic)}`
          : buildQuizPrompt(request.count, request.topic),
      },
    ],
    maxTokens: 4000,
    effort: "low",
    signal: request.signal,
    onText: (delta) => {
      text += delta;
    },
    onUsage: (u) => {
      usage = u;
    },
  });

  const parsed = extractFirstJson<RawQuestion[] | { questions?: RawQuestion[] }>(text);
  const rawList = Array.isArray(parsed) ? parsed : (parsed?.questions ?? []);

  const questions: QuizQuestion[] = rawList
    .map((raw, index): QuizQuestion | null => {
      const prompt = String(raw.prompt ?? raw.question ?? "").trim();
      const answer = String(raw.answer ?? "").trim();
      if (!prompt || !answer) return null;
      const choices = Array.isArray(raw.choices)
        ? raw.choices.map((c) => String(c)).filter(Boolean)
        : undefined;
      return {
        id: `q${index + 1}`,
        prompt,
        choices: choices && choices.length >= 2 ? choices : undefined,
        answer,
        explanation: raw.explanation ? String(raw.explanation) : undefined,
        sourceLocator: raw.sourceLocator
          ? String(raw.sourceLocator)
          : raw.source_locator
            ? String(raw.source_locator)
            : undefined,
        sourceMaterial: raw.sourceMaterial
          ? String(raw.sourceMaterial)
          : raw.source_material
            ? String(raw.source_material)
            : undefined,
      };
    })
    .filter((q): q is QuizQuestion => q !== null);

  if (!questions.length) {
    throw new Error(
      "The model didn't return usable questions. Try again, or switch to a stronger model for quiz generation.",
    );
  }

  return { questions, usage };
}

/** Lenient answer check — a student shouldn't lose a point over whitespace. */
export function checkAnswer(question: QuizQuestion, response: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[\s$\\]/g, "")
      .replace(/[.,;:!?]+$/, "");
  const given = normalize(response);
  const expected = normalize(question.answer);
  if (!given) return false;
  if (given === expected) return true;
  if (question.choices) {
    // "B" or "b)" should match the second choice.
    const letterIndex = response.trim().toLowerCase().charCodeAt(0) - 97;
    if (
      response.trim().length <= 2 &&
      letterIndex >= 0 &&
      letterIndex < question.choices.length
    ) {
      return normalize(question.choices[letterIndex]) === expected;
    }
    return false;
  }
  // Short answers: accept a response that contains the expected answer.
  return expected.length > 2 && given.includes(expected);
}
