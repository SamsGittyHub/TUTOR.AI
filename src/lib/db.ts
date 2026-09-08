"use client";

import type { TutorAction } from "./actions";
import type { ProviderId } from "./providers/types";
import type { ReviewCard } from "./srs";

/**
 * Everything a student uploads or studies lives in their own browser.
 * IndexedDB, five stores, no sync, no server copy. Deleting a material
 * deletes its chunks — and every review card and quiz attempt that cites it —
 * in the same transaction: "user-deletable" from the PRD's open questions,
 * answered by making deletion the only way the data exists.
 */

const DB_NAME = "chalk";
const DB_VERSION = 2;
const MATERIALS = "materials";
const CHUNKS = "chunks";
const SESSIONS = "sessions";
const CARDS = "cards";
const ATTEMPTS = "attempts";

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

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MATERIALS)) {
        db.createObjectStore(MATERIALS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        const store = db.createObjectStore(CHUNKS, { keyPath: "id" });
        store.createIndex("materialId", "materialId", { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSIONS)) {
        const store = db.createObjectStore(SESSIONS, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      // v2: the study loop. Review cards are scheduled by src/lib/srs.ts,
      // attempts are finished quizzes kept for the progress panel.
      if (!db.objectStoreNames.contains(CARDS)) {
        db.createObjectStore(CARDS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(ATTEMPTS)) {
        db.createObjectStore(ATTEMPTS, { keyPath: "id" });
      }
    };
    // A version upgrade blocks while any older connection stays open. Fail
    // loudly instead of leaving boot pending forever, and drop the cached
    // promise so a reload after closing the other tab retries cleanly.
    request.onblocked = () => {
      dbPromise = null;
      reject(
        new Error(
          "Another open Chalk tab is holding the study database. Close it and reload.",
        ),
      );
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let this connection step aside when another tab upgrades the schema.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function tx<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(stores, mode);
        let result: T;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        Promise.resolve(run(transaction)).then(
          (value) => {
            result = value;
          },
          (error) => {
            reject(error);
            transaction.abort();
          },
        );
      }),
  );
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* --- materials ----------------------------------------------------------- */

export async function putMaterial(
  material: Material,
  chunks: MaterialChunk[],
): Promise<void> {
  await tx([MATERIALS, CHUNKS], "readwrite", async (t) => {
    t.objectStore(MATERIALS).put(material);
    const store = t.objectStore(CHUNKS);
    for (const chunk of chunks) store.put(chunk);
  });
}

export async function listMaterials(): Promise<Material[]> {
  const materials = await tx([MATERIALS], "readonly", (t) =>
    req(t.objectStore(MATERIALS).getAll() as IDBRequest<Material[]>),
  );
  return materials.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getChunks(materialId: string): Promise<MaterialChunk[]> {
  const chunks = await tx([CHUNKS], "readonly", (t) =>
    req(
      t.objectStore(CHUNKS).index("materialId").getAll(materialId) as IDBRequest<
        MaterialChunk[]
      >,
    ),
  );
  return chunks.sort((a, b) => a.order - b.order);
}

export async function getChunksFor(materialIds: string[]): Promise<MaterialChunk[]> {
  const all = await Promise.all(materialIds.map(getChunks));
  return all.flat();
}

export async function deleteMaterial(materialId: string): Promise<void> {
  await tx([MATERIALS, CHUNKS, CARDS, ATTEMPTS], "readwrite", async (t) => {
    t.objectStore(MATERIALS).delete(materialId);
    const index = t.objectStore(CHUNKS).index("materialId");
    const keys = await req(index.getAllKeys(materialId));
    const chunkStore = t.objectStore(CHUNKS);
    for (const key of keys) chunkStore.delete(key);

    // Review cards and quiz attempts that cite the material go with it.
    const cardStore = t.objectStore(CARDS);
    const cards = await req(cardStore.getAll() as IDBRequest<ReviewCard[]>);
    for (const card of cards) {
      if (card.materialIds.includes(materialId)) cardStore.delete(card.id);
    }
    const attemptStore = t.objectStore(ATTEMPTS);
    const attempts = await req(attemptStore.getAll() as IDBRequest<QuizAttempt[]>);
    for (const attempt of attempts) {
      if (attempt.materialIds.includes(materialId)) attemptStore.delete(attempt.id);
    }
  });
}

/* --- sessions ------------------------------------------------------------ */

export async function putSession(session: Session): Promise<void> {
  await tx([SESSIONS], "readwrite", (t) => {
    t.objectStore(SESSIONS).put(session);
  });
}

export async function getSession(id: string): Promise<Session | undefined> {
  return tx([SESSIONS], "readonly", (t) =>
    req(t.objectStore(SESSIONS).get(id) as IDBRequest<Session | undefined>),
  );
}

export async function listSessions(): Promise<Session[]> {
  const sessions = await tx([SESSIONS], "readonly", (t) =>
    req(t.objectStore(SESSIONS).getAll() as IDBRequest<Session[]>),
  );
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSession(id: string): Promise<void> {
  await tx([SESSIONS], "readwrite", (t) => {
    t.objectStore(SESSIONS).delete(id);
  });
}

/* --- review cards & attempts ---------------------------------------------- */

export async function putCard(card: ReviewCard): Promise<void> {
  await tx([CARDS], "readwrite", (t) => {
    t.objectStore(CARDS).put(card);
  });
}

export async function listCards(): Promise<ReviewCard[]> {
  return tx([CARDS], "readonly", (t) =>
    req(t.objectStore(CARDS).getAll() as IDBRequest<ReviewCard[]>),
  );
}

export async function putAttempt(attempt: QuizAttempt): Promise<void> {
  await tx([ATTEMPTS], "readwrite", (t) => {
    t.objectStore(ATTEMPTS).put(attempt);
  });
}

export async function listAttempts(): Promise<QuizAttempt[]> {
  const attempts = await tx([ATTEMPTS], "readonly", (t) =>
    req(t.objectStore(ATTEMPTS).getAll() as IDBRequest<QuizAttempt[]>),
  );
  return attempts.sort((a, b) => b.createdAt - a.createdAt);
}

export async function wipeEverything(): Promise<void> {
  await tx([MATERIALS, CHUNKS, SESSIONS, CARDS, ATTEMPTS], "readwrite", (t) => {
    t.objectStore(MATERIALS).clear();
    t.objectStore(CHUNKS).clear();
    t.objectStore(SESSIONS).clear();
    t.objectStore(CARDS).clear();
    t.objectStore(ATTEMPTS).clear();
  });
}
