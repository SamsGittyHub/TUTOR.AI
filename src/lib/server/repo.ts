import "server-only";

import type {
  Material,
  MaterialChunk,
  MaterialImage,
  QuizAttempt,
  Session,
} from "@/lib/db";
import type { ReviewCard } from "@/lib/srs";

import { query, transaction } from "./db";

/**
 * Row ↔ client-type mapping, in one place.
 *
 * The client speaks epoch milliseconds and camelCase; Postgres speaks
 * timestamptz and snake_case. Every translation lives here so the route
 * handlers stay thin and db.ts on the client can keep the exact signatures it
 * had when it was talking to IndexedDB.
 */

const ms = (d: Date | string | null): number =>
  d ? new Date(d).getTime() : 0;

/* -------------------------------------------------------------------------- */
/* Courses                                                                     */
/* -------------------------------------------------------------------------- */

export interface Course {
  id: string;
  name: string;
  term?: string;
  color: string;
  createdAt: number;
}

interface CourseRow {
  id: string;
  name: string;
  term: string | null;
  color: string;
  created_at: Date;
}

const toCourse = (r: CourseRow): Course => ({
  id: r.id,
  name: r.name,
  term: r.term ?? undefined,
  color: r.color,
  createdAt: ms(r.created_at),
});

export async function listCourses(userId: string): Promise<Course[]> {
  const rows = await query<CourseRow>(
    "select id, name, term, color, created_at from courses where user_id = $1 order by created_at desc",
    [userId],
  );
  return rows.map(toCourse);
}

export async function putCourse(userId: string, course: Course): Promise<void> {
  await query(
    `insert into courses (id, user_id, name, term, color)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update
       set name = excluded.name, term = excluded.term, color = excluded.color
     where courses.user_id = $2`,
    [course.id, userId, course.name, course.term ?? null, course.color],
  );
}

export async function deleteCourse(userId: string, id: string): Promise<void> {
  await query("delete from courses where id = $1 and user_id = $2", [id, userId]);
}

/* -------------------------------------------------------------------------- */
/* Materials                                                                   */
/* -------------------------------------------------------------------------- */

interface MaterialRow {
  id: string;
  course_id: string | null;
  name: string;
  kind: Material["kind"];
  size_bytes: string | number;
  char_count: number;
  chunk_count: number;
  unit_count: number | null;
  preview: string;
  note: string | null;
  created_at: Date;
}

function toMaterial(r: MaterialRow, images: MaterialImage[]): Material {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    createdAt: ms(r.created_at),
    sizeBytes: Number(r.size_bytes),
    charCount: r.char_count,
    chunkCount: r.chunk_count,
    preview: r.preview,
    unitCount: r.unit_count ?? undefined,
    note: r.note ?? undefined,
    images: images.length ? images : undefined,
  };
}

export async function listMaterials(userId: string): Promise<Material[]> {
  const rows = await query<MaterialRow>(
    `select id, course_id, name, kind, size_bytes, char_count, chunk_count,
            unit_count, preview, note, created_at
       from materials where user_id = $1 order by created_at desc`,
    [userId],
  );
  if (!rows.length) return [];

  // Images are stored on the volume; the client only needs them for vision
  // calls, so they are fetched with the material rather than listed inline.
  const images = await query<{
    material_id: string;
    locator: string;
    media_type: string;
    storage_path: string;
  }>(
    `select material_id, locator, media_type, storage_path
       from material_images where material_id = any($1)`,
    [rows.map((r) => r.id)],
  );

  const byMaterial = new Map<string, MaterialImage[]>();
  for (const image of images) {
    const list = byMaterial.get(image.material_id) ?? [];
    // storage_path is resolved to a URL the browser can fetch lazily.
    list.push({
      locator: image.locator,
      mediaType: image.media_type,
      base64: "",
    });
    byMaterial.set(image.material_id, list);
  }

  return rows.map((r) => toMaterial(r, byMaterial.get(r.id) ?? []));
}

export async function putMaterial(
  userId: string,
  material: Material,
  chunks: MaterialChunk[],
  courseId?: string | null,
): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `insert into materials
         (id, user_id, course_id, name, kind, size_bytes, char_count,
          chunk_count, unit_count, preview, note, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, to_timestamp($12 / 1000.0))
       on conflict (id) do update set
         course_id = excluded.course_id,
         name = excluded.name,
         preview = excluded.preview,
         note = excluded.note,
         chunk_count = excluded.chunk_count
       where materials.user_id = $2`,
      [
        material.id,
        userId,
        courseId ?? null,
        material.name,
        material.kind,
        material.sizeBytes,
        material.charCount,
        material.chunkCount,
        material.unitCount ?? null,
        material.preview,
        material.note ?? null,
        material.createdAt || Date.now(),
      ],
    );

    // Chunks are immutable once written; replace wholesale on re-upload.
    await client.query("delete from material_chunks where material_id = $1", [
      material.id,
    ]);
    for (const chunk of chunks) {
      await client.query(
        `insert into material_chunks (id, material_id, locator, text, order_index)
         values ($1, $2, $3, $4, $5)`,
        [chunk.id, material.id, chunk.locator, chunk.text, chunk.order],
      );
    }
  });
}

export async function getChunks(
  userId: string,
  materialIds: string[],
): Promise<MaterialChunk[]> {
  if (!materialIds.length) return [];
  const rows = await query<{
    id: string;
    material_id: string;
    locator: string;
    text: string;
    order_index: number;
  }>(
    `select c.id, c.material_id, c.locator, c.text, c.order_index
       from material_chunks c
       join materials m on m.id = c.material_id
      where c.material_id = any($1) and m.user_id = $2
      order by c.material_id, c.order_index`,
    [materialIds, userId],
  );
  return rows.map((r) => ({
    id: r.id,
    materialId: r.material_id,
    locator: r.locator,
    text: r.text,
    order: r.order_index,
  }));
}

export async function deleteMaterial(userId: string, id: string): Promise<void> {
  // Chunks, images and cards cascade; attempts keep their history but lose the
  // reference, matching what deleteMaterial did against IndexedDB.
  await query("delete from materials where id = $1 and user_id = $2", [id, userId]);
}

/* -------------------------------------------------------------------------- */
/* Lessons (the client calls them Sessions)                                    */
/* -------------------------------------------------------------------------- */

interface LessonRow {
  id: string;
  title: string;
  material_ids: string[];
  provider_id: string;
  model: string;
  actions: unknown;
  transcript: unknown;
  plan: unknown;
  usage: unknown;
  board_theme: "paper" | "chalk";
  created_at: Date;
  updated_at: Date;
}

const toSession = (r: LessonRow): Session =>
  ({
    id: r.id,
    title: r.title,
    createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at),
    materialIds: r.material_ids,
    providerId: r.provider_id,
    model: r.model,
    actions: (r.actions ?? []) as Session["actions"],
    transcript: (r.transcript ?? []) as Session["transcript"],
    plan: (r.plan ?? undefined) as Session["plan"],
    usage: (r.usage ?? {}) as Session["usage"],
    boardTheme: r.board_theme,
  }) as Session;

const LESSON_COLUMNS = `id, title, material_ids, provider_id, model, actions,
                        transcript, plan, usage, board_theme, created_at, updated_at`;

export async function listSessions(userId: string): Promise<Session[]> {
  const rows = await query<LessonRow>(
    `select ${LESSON_COLUMNS} from lessons where user_id = $1 order by updated_at desc`,
    [userId],
  );
  return rows.map(toSession);
}

export async function getSession(
  userId: string,
  id: string,
): Promise<Session | undefined> {
  const rows = await query<LessonRow>(
    `select ${LESSON_COLUMNS} from lessons where id = $1 and user_id = $2`,
    [id, userId],
  );
  return rows[0] ? toSession(rows[0]) : undefined;
}

export async function putSession(userId: string, s: Session): Promise<void> {
  await query(
    `insert into lessons
       (id, user_id, title, material_ids, provider_id, model, actions,
        transcript, plan, usage, board_theme, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
             to_timestamp($12 / 1000.0), to_timestamp($13 / 1000.0))
     on conflict (id) do update set
       title = excluded.title,
       material_ids = excluded.material_ids,
       provider_id = excluded.provider_id,
       model = excluded.model,
       actions = excluded.actions,
       transcript = excluded.transcript,
       plan = excluded.plan,
       usage = excluded.usage,
       board_theme = excluded.board_theme,
       updated_at = excluded.updated_at
     where lessons.user_id = $2`,
    [
      s.id,
      userId,
      s.title,
      s.materialIds,
      s.providerId,
      s.model,
      JSON.stringify(s.actions ?? []),
      JSON.stringify(s.transcript ?? []),
      s.plan ? JSON.stringify(s.plan) : null,
      JSON.stringify(s.usage ?? {}),
      s.boardTheme,
      s.createdAt || Date.now(),
      s.updatedAt || Date.now(),
    ],
  );
}

export async function deleteSession(userId: string, id: string): Promise<void> {
  await query("delete from lessons where id = $1 and user_id = $2", [id, userId]);
}

/* -------------------------------------------------------------------------- */
/* Review cards & attempts                                                     */
/* -------------------------------------------------------------------------- */

interface CardRow {
  id: string;
  prompt_key: string;
  material_ids: string[];
  prompt: string;
  choices: string[] | null;
  answer: string;
  explanation: string | null;
  source_locator: string | null;
  due_at: Date;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  created_at: Date;
}

const toCard = (r: CardRow): ReviewCard => ({
  id: r.id,
  promptKey: r.prompt_key,
  materialIds: r.material_ids,
  prompt: r.prompt,
  choices: r.choices ?? undefined,
  answer: r.answer,
  explanation: r.explanation ?? undefined,
  sourceLocator: r.source_locator ?? undefined,
  createdAt: ms(r.created_at),
  dueAt: ms(r.due_at),
  intervalDays: r.interval_days,
  ease: r.ease,
  reps: r.reps,
  lapses: r.lapses,
});

export async function listCards(userId: string): Promise<ReviewCard[]> {
  const rows = await query<CardRow>(
    `select id, prompt_key, material_ids, prompt, choices, answer, explanation,
            source_locator, due_at, interval_days, ease, reps, lapses, created_at
       from review_cards where user_id = $1 order by due_at asc`,
    [userId],
  );
  return rows.map(toCard);
}

export async function putCard(userId: string, c: ReviewCard): Promise<void> {
  // The unique index on (user_id, prompt_key) is what makes a regenerated quiz
  // reschedule the existing card instead of duplicating it.
  await query(
    `insert into review_cards
       (id, user_id, prompt_key, material_ids, prompt, choices, answer,
        explanation, source_locator, due_at, interval_days, ease, reps, lapses,
        created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, to_timestamp($10 / 1000.0),
             $11,$12,$13,$14, to_timestamp($15 / 1000.0), now())
     on conflict (user_id, prompt_key) do update set
       material_ids = excluded.material_ids,
       prompt = excluded.prompt,
       choices = excluded.choices,
       answer = excluded.answer,
       explanation = excluded.explanation,
       source_locator = excluded.source_locator,
       due_at = excluded.due_at,
       interval_days = excluded.interval_days,
       ease = excluded.ease,
       reps = excluded.reps,
       lapses = excluded.lapses,
       updated_at = now()`,
    [
      c.id,
      userId,
      c.promptKey,
      c.materialIds,
      c.prompt,
      c.choices ?? null,
      c.answer,
      c.explanation ?? null,
      c.sourceLocator ?? null,
      c.dueAt,
      c.intervalDays,
      c.ease,
      c.reps,
      c.lapses,
      c.createdAt || Date.now(),
    ],
  );
}

interface AttemptRow {
  id: string;
  lesson_id: string | null;
  title: string;
  material_ids: string[];
  score: number;
  total: number;
  created_at: Date;
}

export async function listAttempts(userId: string): Promise<QuizAttempt[]> {
  const rows = await query<AttemptRow>(
    `select id, lesson_id, title, material_ids, score, total, created_at
       from quiz_attempts where user_id = $1 order by created_at desc`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.lesson_id ?? "flashcards",
    title: r.title,
    materialIds: r.material_ids,
    createdAt: ms(r.created_at),
    score: r.score,
    total: r.total,
  }));
}

export async function putAttempt(userId: string, a: QuizAttempt): Promise<void> {
  // "flashcards" is a sentinel, not a lesson id — it must not hit the FK.
  const lessonId = a.sessionId && a.sessionId !== "flashcards" ? a.sessionId : null;
  await query(
    `insert into quiz_attempts
       (id, user_id, lesson_id, title, material_ids, score, total, created_at)
     values ($1,$2,$3,$4,$5,$6,$7, to_timestamp($8 / 1000.0))
     on conflict (id) do nothing`,
    [
      a.id,
      userId,
      lessonId,
      a.title,
      a.materialIds,
      a.score,
      a.total,
      a.createdAt || Date.now(),
    ],
  );
}

/** "Delete all my data" — everything cascades from the user row's children. */
export async function wipeEverything(userId: string): Promise<void> {
  await transaction(async (client) => {
    for (const table of [
      "study_blocks",
      "calendar_events",
      "syllabi",
      "quiz_attempts",
      "review_cards",
      "lessons",
      "materials",
      "courses",
    ]) {
      await client.query(`delete from ${table} where user_id = $1`, [userId]);
    }
  });
}
