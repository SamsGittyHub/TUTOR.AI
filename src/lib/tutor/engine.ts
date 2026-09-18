"use client";

import { normalizeAction, actionToText, type TutorAction } from "../actions";
import type { Material, MaterialChunk, QuizQuestion, TranscriptEntry } from "../db";
import { formatContext, retrieve, retrieveHybrid } from "../materials/retrieve";
import { getProvider, type ChatMessage, type ImagePart, type ProviderId, type Usage } from "../providers";
import { languageInstruction } from "../language";
import { extractFirstJson, JsonObjectStream } from "../stream-json";
import {
  buildIllustrateMessage,
  buildQuizPrompt,
  buildSystemPrompt,
  ILLUSTRATE_SYSTEM,
  REPAIR_INSTRUCTION,
} from "./prompts";

import { shouldOfferPicture } from "../illustration-pace";

export interface TurnRequest {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  studentMessage: string;
  transcript: TranscriptEntry[];
  materials: Material[];
  chunks: MaterialChunk[];
  boardSummary: string;
  /** The student's question, embedded — enables semantic retrieval when present. */
  queryVector?: number[] | null;
  /** The student's own handwriting, when they've worked something out on the board. */
  studentImages?: ImagePart[];
  /** What previous lessons established about how this person learns. */
  learning?: string;
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

const DRAW_REMINDER = `<drawing>
Before you answer: is there a physical thing in this topic — apparatus, a
specimen, an organ, a device, a place, a mechanism, an artefact? If there is,
include a show_image of it in this turn. Don't mention that you're drawing it
and don't wait for it. If the topic is purely symbolic, skip it.
</drawing>`;

/*
 * The other half of the cadence. Without this the model keeps drawing on hold
 * turns and every one of them has to be thrown away below, which wastes the
 * tokens it spent describing a picture nobody will see.
 */
const HOLD_REMINDER = `<drawing>
You drew a picture recently, so don't draw one this turn — teach it with
words, worked steps, and the board's own tables and diagrams instead. The
exception is being asked outright for something to look at; then draw it.
</drawing>`;

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

function buildMessages(request: TurnRequest, mayDraw: boolean): ChatMessage[] {
  const history = request.transcript.slice(-MAX_TRANSCRIPT_ENTRIES);
  const messages: ChatMessage[] = history.map((entry) => ({
    role: entry.role === "student" ? "user" : "assistant",
    content: entry.text,
  }));

  // Retrieval keys off what the student just said plus the last thing taught,
  // so "explain that again" still lands on the right passage.
  const lastTutor = [...history].reverse().find((e) => e.role === "tutor")?.text ?? "";
  const query = `${request.studentMessage}\n${lastTutor.slice(0, 400)}`;
  const result = retrieveHybrid(request.chunks, query, request.queryVector ?? null);

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

  /*
   * A standing reminder, sent every turn rather than left in the system
   * prompt. Drawing is an optional branch of a fourteen-type schema, and a
   * model asked once at the top of a long prompt reliably forgets it by the
   * time it's writing the turn — the instruction has to be recent to compete.
   * Phrased as a test the model applies to this specific topic, so algebra
   * still doesn't get a picture it doesn't need.
   */
  blocks.push(mayDraw ? DRAW_REMINDER : HOLD_REMINDER);
  blocks.push(request.studentMessage);

  messages.push({
    role: "user",
    content: blocks.join("\n\n"),
    // The student's own work goes first: it's what they're asking about, and
    // burying it behind four pages of slides makes the model answer the slides.
    images: [
      ...(request.studentImages ?? []),
      ...collectImages(request.materials, result.chunks),
    ].slice(0, MAX_IMAGES),
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
  const baseSystem = buildSystemPrompt({
    materials: request.materials,
    hasMaterialContext: request.chunks.length > 0,
    learning: request.learning,
  });
  // Appended rather than prepended: the action protocol has to lead, or a
  // weaker model starts treating the language note as the thing being asked.
  const system = baseSystem + languageInstruction();
  /*
   * Decided once, up front, and then enforced in three places: what the model
   * is told, what it's allowed to emit, and whether the fallback pass runs at
   * all. Deciding it once is the point — three independent judgements about
   * the same turn is how it ended up drawing on all of them.
   */
  const mayDraw = shouldOfferPicture(request.transcript, request.studentMessage);
  const messages = buildMessages(request, mayDraw);

  const actions: TutorAction[] = [];
  const seenIds = new Set<string>();
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };

  const consume = (raw: unknown) => {
    const action = normalizeAction(raw);
    if (!action) return;
    /*
     * A hold turn is by definition one where the student didn't ask for a
     * picture — shouldOfferPicture returns true whenever they did — so
     * dropping this can't swallow something that was actually requested.
     */
    if (action.type === "show_image" && !mayDraw) return;
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
      // A turn is "two to five board cards, then done" by design — a few
      // hundred tokens in the typical case. 4000 is still generous headroom
      // for a verbose write_steps or a wide table, not a number chosen to be
      // tight; it's a backstop against a genuinely runaway response rather
      // than a limit anyone should expect to hit teaching normally.
      maxTokens: 4000,
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

  /*
   * If the turn drew nothing, ask once, separately, whether it should have.
   *
   * Every attempt to get this out of the main turn failed — the instruction
   * competed with the card budget, and kept losing after the budget was fixed,
   * because remembering an optional branch of a fourteen-type schema while
   * also teaching is a lot to ask of a cheap model. This asks one question and
   * takes a two-key answer, which is about the simplest thing a model can be
   * asked to do, and it always runs rather than needing to be remembered.
   *
   * Never allowed to break a lesson: any failure here is swallowed, because a
   * missing picture is a worse outcome than a missing picture *and* an error.
   */
  if (mayDraw && !actions.some((a) => a.type === "show_image")) {
    try {
      await illustrate(request, provider, (action) => {
        actions.push(action);
        request.onAction(action);
      });
    } catch {
      // A lesson without a drawing is still a lesson.
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
    // "remember" is a note to itself about the student, not a card the student
    // is looking at; it reaches the next turn through the learning block.
    .filter(
      (a) =>
        a.type !== "say" &&
        a.type !== "done" &&
        a.type !== "erase" &&
        a.type !== "remember",
    )
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
      "You write practice questions for a student, drawn strictly from their own study material. You reply with JSON and nothing else." + languageInstruction(),
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

/**
 * One cheap call deciding whether this turn wants a picture, and emitting it.
 *
 * Deliberately not streamed and deliberately capped short: the entire expected
 * answer is a two-key object, so anything long means the model has gone off
 * and the JSON extractor will reject it anyway.
 */
async function illustrate(
  request: TurnRequest,
  provider: ReturnType<typeof getProvider>,
  emit: (action: TutorAction) => void,
): Promise<void> {
  let raw = "";
  await provider.stream({
    apiKey: request.apiKey,
    model: request.model,
    system: ILLUSTRATE_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildIllustrateMessage(request.studentMessage, request.boardSummary),
      },
    ],
    maxTokens: 300,
    effort: "low",
    signal: request.signal,
    onText: (delta) => {
      raw += delta;
    },
  });

  const decision = extractFirstJson(raw) as
    | { draw?: unknown; prompt?: unknown; caption?: unknown; style?: unknown; shape?: unknown }
    | null;
  if (!decision || decision.draw !== true) return;

  const action = normalizeAction({
    type: "show_image",
    prompt: decision.prompt,
    caption: decision.caption,
    style: decision.style,
    shape: decision.shape,
  });
  // normalizeAction drops a show_image with nothing to draw, which is exactly
  // what a malformed decision looks like.
  if (action) emit(action);
}
