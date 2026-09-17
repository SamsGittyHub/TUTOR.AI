"use client";

import type { TutorAction } from "./actions";
import type { ProviderId } from "./providers/types";
import type { ReviewCard } from "./srs";

/**
 * The client's view of the student's data — now a thin wrapper over the API.
 *
 * This file used to own an IndexedDB with five stores. Postgres is the source
 * of truth now, so every function here is the same signature calling a route
 * instead. Signatures were already async when the backing store was IndexedDB,
 * which is the only reason this swap doesn't ripple through every caller.
 *
 * Reads are memoized per-load: useTutor and useQuizLab both list materials on
 * mount, and without this a single page open would fire the same query twice.
 */

export type MaterialKind =
  | "pdf"
  | "docx"
  | "pptx"
  | "image"
  | "text"
  | "audio"
  | "video";

export interface MaterialChunk {
  id: string;
  materialId: string;
  /** Human-readable position: "page 4", "slide 12", "12:30". */
  locator: string;
  text: string;
  order: number;
}

export interface MaterialImage {
  locator: string;
  mediaType: string;
  base64: string;
}

export interface Material {
  id: string;
  name: string;
  kind: MaterialKind;
  createdAt: number;
  sizeBytes: number;
  charCount: number;
  chunkCount: number;
  /** First few hundred characters, for the card in the sidebar. */
  preview: string;
  /** Page/slide count where the format has one. */
  unitCount?: number;
  /** Photos of notes travel as images so vision models can read them. */
  images?: MaterialImage[];
  note?: string;
}

export interface TranscriptEntry {
  role: "student" | "tutor";
  text: string;
  at: number;
}

export interface LessonPlanState {
  title: string;
  steps: string[];
  currentIndex: number;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices?: string[];
  answer: string;
  explanation?: string;
  sourceLocator?: string;
  /** File name the model says a question came from, for card attribution. */
  sourceMaterial?: string;
  response?: string;
  correct?: boolean;
}

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  turns: number;
}

/** A finished quiz, kept for the progress panel. */
export interface QuizAttempt {
  id: string;
  /** "flashcards" for quizzes taken on the flashcards page. */
  sessionId: string;
  title: string;
  materialIds: string[];
  createdAt: number;
  score: number;
  total: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  materialIds: string[];
  providerId: ProviderId;
  model: string;
  actions: TutorAction[];
  transcript: TranscriptEntry[];
  plan?: LessonPlanState;
  usage: SessionUsage;
  boardTheme: "paper" | "chalk";
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "NotSignedInError";
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (response.status === 401) throw new NotSignedInError();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body as T;
}

const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

/**
 * Short-lived read cache. Writes invalidate the keys they touch, so a put
 * followed by a list never serves a stale answer.
 */
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const promise = load().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  return promise;
}

function invalidate(...prefixes: string[]) {
  for (const key of [...cache.keys()]) {
    if (prefixes.some((p) => key.startsWith(p))) cache.delete(key);
  }
}

/** Called after sign-in or sign-out — the next read must not be another user's. */
export function resetCache(): void {
  cache.clear();
}

/* --- materials ----------------------------------------------------------- */

export async function putMaterial(
  material: Material,
  chunks: MaterialChunk[],
  courseId?: string | null,
): Promise<void> {
  await post("/materials", { material, chunks, courseId });
  invalidate("materials", `chunks:${material.id}`);
}

export async function listMaterials(): Promise<Material[]> {
  return cached("materials", async () =>
    (await api<{ materials: Material[] }>("/materials")).materials,
  );
}

export async function getChunks(materialId: string): Promise<MaterialChunk[]> {
  return cached(`chunks:${materialId}`, async () =>
    (await post<{ chunks: MaterialChunk[] }>("/chunks", {
      materialIds: [materialId],
    })).chunks,
  );
}

export async function getChunksFor(materialIds: string[]): Promise<MaterialChunk[]> {
  if (!materialIds.length) return [];
  // One round trip for the whole lesson rather than one per material.
  const key = `chunks:${[...materialIds].sort().join(",")}`;
  return cached(key, async () =>
    (await post<{ chunks: MaterialChunk[] }>("/chunks", { materialIds })).chunks,
  );
}

export async function deleteMaterial(materialId: string): Promise<void> {
  await api(`/materials/${encodeURIComponent(materialId)}`, { method: "DELETE" });
  // Cards and chunks cascade server-side, so their caches must go too.
  invalidate("materials", "chunks", "cards", "attempts");
}

/* --- courses ------------------------------------------------------------- */

export interface Course {
  id: string;
  name: string;
  term?: string;
  color: string;
  createdAt: number;
}

export async function listCourses(): Promise<Course[]> {
  return cached("courses", async () =>
    (await api<{ courses: Course[] }>("/courses")).courses,
  );
}

export async function createCourse(
  name: string,
  term?: string,
  color = "cyan",
): Promise<Course> {
  const { course } = await post<{ course: Course }>("/courses", { name, term, color });
  invalidate("courses");
  return course;
}

export async function deleteCourse(id: string): Promise<void> {
  await api(`/courses/${encodeURIComponent(id)}`, { method: "DELETE" });
  invalidate("courses", "materials");
}

/* --- sessions ------------------------------------------------------------ */

export async function putSession(session: Session): Promise<void> {
  await post("/lessons", { session });
  invalidate("sessions", `session:${session.id}`);
}

export async function getSession(id: string): Promise<Session | undefined> {
  const { session } = await api<{ session: Session | null }>(
    `/lessons/${encodeURIComponent(id)}`,
  );
  return session ?? undefined;
}

export async function listSessions(): Promise<Session[]> {
  return cached("sessions", async () =>
    (await api<{ sessions: Session[] }>("/lessons")).sessions,
  );
}

export async function deleteSession(id: string): Promise<void> {
  await api(`/lessons/${encodeURIComponent(id)}`, { method: "DELETE" });
  invalidate("sessions", `session:${id}`);
}

/* --- review cards & attempts --------------------------------------------- */

export async function putCard(card: ReviewCard): Promise<void> {
  await post("/cards", { card });
  invalidate("cards");
}

export async function listCards(): Promise<ReviewCard[]> {
  return cached("cards", async () =>
    (await api<{ cards: ReviewCard[] }>("/cards")).cards,
  );
}

export async function putAttempt(attempt: QuizAttempt): Promise<void> {
  await post("/attempts", { attempt });
  invalidate("attempts");
}

export async function listAttempts(): Promise<QuizAttempt[]> {
  return cached("attempts", async () =>
    (await api<{ attempts: QuizAttempt[] }>("/attempts")).attempts,
  );
}

export async function wipeEverything(): Promise<void> {
  await post("/account/wipe", {});
  resetCache();
}
