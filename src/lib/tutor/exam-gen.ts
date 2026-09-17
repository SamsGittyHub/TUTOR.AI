"use client";

import type { Material, MaterialChunk, Session } from "../db";
import type {
  ExamQuestion,
  ExamQuestionKind,
  ExamSection,
  PracticeExam,
} from "../exam";
import { formatContext, retrieve } from "../materials/retrieve";
import { getProvider, type ProviderId, type Usage } from "../providers";
import { extractFirstJson } from "../stream-json";
import { allocateQuestions, findWeakPoints, type WeakPointInput } from "../weakpoints";

/**
 * Builds a practice paper out of the student's own lessons.
 *
 * The weighting is decided here, not by the model: weakpoints.ts ranks the
 * topics and allocates the question budget, and the model is told exactly how
 * many questions to write per topic. Asking a model to "focus on weak areas"
 * and hoping produces an evenly-spread paper with a sentence of lip service.
 */

export interface ExamRequest extends WeakPointInput {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  materials: Material[];
  chunks: MaterialChunk[];
  /** Total questions across the whole paper. */
  questionCount: number;
  minutes: number;
  signal?: AbortSignal;
}

interface RawQuestion {
  kind?: string;
  prompt?: string;
  question?: string;
  choices?: unknown;
  answer?: string;
  explanation?: string;
  marks?: unknown;
  topic?: string;
  sourceLocator?: string;
  source_locator?: string;
}

interface RawSection {
  title?: string;
  instructions?: string;
  questions?: RawQuestion[];
}

const KINDS: ExamQuestionKind[] = ["multiple_choice", "short_answer", "worked"];

function buildPrompt(
  allocation: { topic: string; count: number; reasons: string[] }[],
  total: number,
  minutes: number,
): string {
  const breakdown = allocation
    .map((a) => `- ${a.topic}: ${a.count} question${a.count === 1 ? "" : "s"} (${a.reasons[0] ?? "covered in the lessons"})`)
    .join("\n");

  return `Write a practice exam of exactly ${total} questions, meant to take about ${minutes} minutes.

Spend the questions on these topics, in exactly these amounts. This split is
derived from where the student actually struggled — do not rebalance it:

${breakdown}

Structure the paper in sections by question type, in this order, skipping any
section you have no questions for:
  Section A - multiple choice (1 mark each)
  Section B - short answer (2-3 marks each)
  Section C - worked problems, where the student shows their working (5-8 marks)

Reply with JSON and nothing else:

{"sections":[
  {"title":"Section A - Multiple choice","instructions":"Choose one answer.",
   "questions":[
     {"kind":"multiple_choice","topic":"Picking u and dv","prompt":"Which should be u?",
      "choices":["x","e^x"],"answer":"x","explanation":"Because du = dx is simpler.",
      "marks":1,"sourceLocator":"page 4"}]}]}

Rules:
- "kind" is one of: multiple_choice, short_answer, worked.
- "topic" must be copied verbatim from the list above, so the paper can be
  marked back against it.
- "answer" is required even for worked problems — give the final result, and
  put the method in "explanation".
- Multiple choice needs 3-4 plausible choices; wrong ones should be mistakes a
  student actually makes, not obvious throwaways.
- Draw on the material excerpts where they're given, and cite the locator.
- Raw LaTeX in prompts and answers where maths is needed, no $ delimiters.
- Do not write a question whose answer is quoted verbatim in its own prompt.`;
}

function normalizeQuestion(raw: RawQuestion, index: number): ExamQuestion | null {
  const prompt = String(raw.prompt ?? raw.question ?? "").trim();
  const answer = String(raw.answer ?? "").trim();
  if (!prompt || !answer) return null;

  const kindRaw = String(raw.kind ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const kind: ExamQuestionKind = KINDS.includes(kindRaw as ExamQuestionKind)
    ? (kindRaw as ExamQuestionKind)
    : "short_answer";

  const choices = Array.isArray(raw.choices)
    ? raw.choices.map((c) => String(c).trim()).filter(Boolean)
    : undefined;

  const marks = Number(raw.marks);

  return {
    id: `q${index + 1}`,
    kind,
    prompt,
    // A multiple-choice question with one option isn't one.
    choices: kind === "multiple_choice" && choices && choices.length >= 2 ? choices : undefined,
    answer,
    explanation: raw.explanation ? String(raw.explanation) : undefined,
    // Models are erratic about marks; fall back to the band for the kind.
    marks:
      Number.isFinite(marks) && marks > 0 && marks <= 20
        ? Math.round(marks)
        : kind === "multiple_choice"
          ? 1
          : kind === "short_answer"
            ? 3
            : 6,
    topic: raw.topic ? String(raw.topic) : undefined,
    sourceLocator: raw.sourceLocator
      ? String(raw.sourceLocator)
      : raw.source_locator
        ? String(raw.source_locator)
        : undefined,
  };
}

export async function generateExam(
  request: ExamRequest,
): Promise<{ exam: PracticeExam; usage: Usage }> {
  const weakPoints = findWeakPoints({
    sessions: request.sessions,
    cards: request.cards,
    attempts: request.attempts,
  });
  if (!weakPoints.length) {
    throw new Error(
      "Those lessons have nothing to build an exam from yet — teach a bit more first.",
    );
  }

  const allocation = allocateQuestions(weakPoints, request.questionCount);

  // Retrieve against the weak topics, not the whole corpus, so the excerpts in
  // the prompt are about the things the paper is meant to test.
  const query = allocation.map((a) => a.topic).join(" ");
  const retrieved = retrieve(request.chunks, query, 28_000);
  const nameOf = (id: string) =>
    request.materials.find((m) => m.id === id)?.name ?? "material";
  const context = formatContext(retrieved.chunks, nameOf);

  const provider = getProvider(request.providerId);
  let text = "";
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };

  await provider.stream({
    apiKey: request.apiKey,
    model: request.model,
    system:
      "You write practice exams for one student, drawn strictly from their own study material and aimed at what they personally find hard. You reply with JSON and nothing else.",
    messages: [
      {
        role: "user",
        content: context
          ? `<material>\n${context}\n</material>\n\n${buildPrompt(allocation, request.questionCount, request.minutes)}`
          : buildPrompt(allocation, request.questionCount, request.minutes),
      },
    ],
    maxTokens: 8000,
    effort: "low",
    signal: request.signal,
    onText: (delta) => {
      text += delta;
    },
    onUsage: (u) => {
      usage = u;
    },
  });

  const parsed = extractFirstJson<
    { sections?: RawSection[] } | RawSection[] | RawQuestion[]
  >(text);

  let rawSections: RawSection[];
  if (Array.isArray(parsed)) {
    // A bare array could be sections or questions; sniff for the difference.
    rawSections = (parsed as RawSection[])[0]?.questions
      ? (parsed as RawSection[])
      : [{ title: "Practice exam", questions: parsed as RawQuestion[] }];
  } else {
    rawSections = parsed?.sections ?? [];
  }

  let counter = 0;
  const sections: ExamSection[] = rawSections
    .map((rawSection, sectionIndex): ExamSection => {
      const questions = (rawSection.questions ?? [])
        .map((rawQuestion) => normalizeQuestion(rawQuestion, counter++))
        .filter((q): q is ExamQuestion => q !== null);
      return {
        id: `s${sectionIndex + 1}`,
        title: String(rawSection.title ?? `Section ${sectionIndex + 1}`),
        instructions: rawSection.instructions
          ? String(rawSection.instructions)
          : undefined,
        questions,
      };
    })
    .filter((section) => section.questions.length > 0);

  if (!sections.length) {
    throw new Error(
      "The model didn't return a usable paper. Try again, or pick a stronger model for exam generation.",
    );
  }

  const titles = request.sessions.map((s: Session) => s.title);
  const exam: PracticeExam = {
    // A UUID rather than a timestamp: exam ids are globally unique keys, and
    // two students generating in the same millisecond would otherwise collide —
    // where the insert's ON CONFLICT DO NOTHING would silently drop the second.
    id: `exam-${crypto.randomUUID()}`,
    title:
      titles.length === 1
        ? `Practice exam — ${titles[0]}`
        : `Practice exam — ${titles.length} lessons`,
    createdAt: Date.now(),
    sessionIds: request.sessions.map((s) => s.id),
    materialIds: [...new Set(request.sessions.flatMap((s) => s.materialIds))],
    sections,
    minutes: request.minutes,
    focus: allocation.map((a) => ({ topic: a.topic, reasons: a.reasons })),
  };

  return { exam, usage };
}
