"use client";

import type { EventKind } from "../calendar";
import type { Material, MaterialChunk } from "../db";
import { formatContext } from "../materials/retrieve";
import { getProvider, type ProviderId, type Usage } from "../providers";
import { extractFirstJson } from "../stream-json";

/**
 * Pulling exam dates out of an uploaded syllabus.
 *
 * A syllabus is the one document where the dates matter more than the prose,
 * and typing twelve of them into a calendar by hand is exactly the chore that
 * stops people from planning at all. The model gets the whole document (they
 * are short) and returns dates; everything it returns is treated as a
 * suggestion the student confirms, never written straight through.
 */

export interface SyllabusRequest {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  material: Material;
  chunks: MaterialChunk[];
  /** Today, so the model can resolve a bare "Oct 14" to the right year. */
  today?: Date;
  signal?: AbortSignal;
}

export interface ParsedEvent {
  kind: EventKind;
  title: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  topics: string[];
}

interface RawEvent {
  kind?: string;
  title?: string;
  date?: string;
  topics?: unknown;
}

const KINDS: EventKind[] = ["exam", "assignment", "class", "reading", "other"];

function buildPrompt(today: Date): string {
  const iso = today.toISOString().slice(0, 10);
  return `Today is ${iso}.

Read the syllabus above and list every dated item: exams, midterms, finals,
quizzes, assignment deadlines, project due dates.

Reply with a JSON array and nothing else. One object per item:

[{"kind":"exam","title":"Midterm 2","date":"2026-10-14","topics":["alkenes","aromatics"]}]

Rules:
- "kind" is one of: exam, assignment, class, reading, other. A quiz is an exam.
- "date" must be YYYY-MM-DD. Resolve bare dates like "Oct 14" against today's
  date above — a syllabus runs forward from the start of term, so pick the year
  that puts the item in the future when it is ambiguous.
- "topics" is what that item covers, taken from the syllabus wording. Use an
  empty array when the syllabus doesn't say.
- Skip anything without a specific date. Do not invent items.
- Weekly recurring lectures: emit nothing. They are not deadlines.`;
}

/** Keeps only dates the model actually got right. */
function normalizeEvent(raw: RawEvent): ParsedEvent | null {
  const title = String(raw.title ?? "").trim();
  const date = String(raw.date ?? "").trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  // A parseable shape isn't a real date — 2026-02-31 passes the regex.
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return null;
  }

  const kind = KINDS.includes(raw.kind as EventKind)
    ? (raw.kind as EventKind)
    : "other";

  return {
    kind,
    title: title.slice(0, 200),
    date,
    topics: Array.isArray(raw.topics)
      ? raw.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
      : [],
  };
}

export async function parseSyllabus(
  request: SyllabusRequest,
): Promise<{ events: ParsedEvent[]; usage: Usage }> {
  const provider = getProvider(request.providerId);
  const context = formatContext(request.chunks, () => request.material.name);
  if (!context.trim()) {
    throw new Error("That file has no readable text to pull dates out of.");
  }

  let text = "";
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };

  await provider.stream({
    apiKey: request.apiKey,
    model: request.model,
    system:
      "You extract dated items from a course syllabus. You reply with JSON and nothing else.",
    messages: [
      {
        role: "user",
        content: `<syllabus>\n${context}\n</syllabus>\n\n${buildPrompt(request.today ?? new Date())}`,
      },
    ],
    maxTokens: 3000,
    effort: "low",
    signal: request.signal,
    onText: (delta) => {
      text += delta;
    },
    onUsage: (u) => {
      usage = u;
    },
  });

  const parsed = extractFirstJson<RawEvent[] | { events?: RawEvent[] }>(text);
  const rawList = Array.isArray(parsed) ? parsed : (parsed?.events ?? []);

  const events = rawList
    .map(normalizeEvent)
    .filter((e): e is ParsedEvent => e !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!events.length) {
    throw new Error(
      "No dated items came back. If the syllabus is a scan, the text may not have come through — check it on the Material page.",
    );
  }

  return { events, usage };
}
