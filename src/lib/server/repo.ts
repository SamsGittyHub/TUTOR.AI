import "server-only";

import type {
  Material,
  MaterialChunk,
  MaterialImage,
  QuizAttempt,
  Session,
} from "@/lib/db";
import type { CalendarEvent, EventKind, StudyBlock } from "@/lib/calendar";
import { gradeExam, type ExamResponses, type ExamResult, type PracticeExam } from "@/lib/exam";
import type { ExamReview } from "@/lib/exam-review";
import { sanitizeDeep, sanitizeText } from "@/lib/sanitize";
import type { ReviewCard } from "@/lib/srs";

import { hintFor, open, seal } from "./crypto";
import { query, transaction } from "./db";
import { deleteMaterialFiles, deleteUserFiles } from "./storage";

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

/**
 * Every upsert below is guarded by `where <table>.user_id = $n`, so an id that
 * already belongs to a different account matches nothing and writes nothing.
 * Postgres reports that as a successful statement affecting zero rows, which
 * used to surface as {ok:true} while the student's work quietly vanished.
 * Anything that should have written exactly one row goes through here.
 */
function assertWrote(rows: unknown[], what: string): void {
  if (rows.length === 0) {
    throw new Error(
      `Couldn't save that ${what} — its id is already taken by another account. Try again.`,
    );
  }
}

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
  const wrote = await query(
    `insert into courses (id, user_id, name, term, color)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update
       set name = excluded.name, term = excluded.term, color = excluded.color
     where courses.user_id = $2
     returning id`,
    [course.id, userId, course.name, course.term ?? null, course.color],
  );
  assertWrote(wrote, "course");
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
    courseId: r.course_id ?? undefined,
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
    const wrote = await client.query(
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
       where materials.user_id = $2
       returning id`,
      [
        material.id,
        userId,
        courseId ?? material.courseId ?? null,
        sanitizeText(material.name),
        material.kind,
        material.sizeBytes,
        material.charCount,
        material.chunkCount,
        material.unitCount ?? null,
        sanitizeText(material.preview),
        material.note ? sanitizeText(material.note) : null,
        material.createdAt || Date.now(),
      ],
    );
    assertWrote(wrote.rows, "file");

    // Chunks are immutable once written; replace wholesale on re-upload.
    await client.query("delete from material_chunks where material_id = $1", [
      material.id,
    ]);
    for (const chunk of chunks) {
      await client.query(
        `insert into material_chunks (id, material_id, locator, text, order_index)
         values ($1, $2, $3, $4, $5)`,
        [
          chunk.id,
          material.id,
          sanitizeText(chunk.locator),
          sanitizeText(chunk.text),
          chunk.order,
        ],
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
    embedding: number[] | null;
  }>(
    `select c.id, c.material_id, c.locator, c.text, c.order_index, c.embedding
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
    embedding: r.embedding ?? undefined,
  }));
}

export async function deleteMaterial(userId: string, id: string): Promise<void> {
  // Chunks, images and cards cascade; attempts keep their history but lose the
  // reference, matching what deleteMaterial did against IndexedDB.
  await query("delete from materials where id = $1 and user_id = $2", [id, userId]);
  // The row is gone either way; a failed unlink must not resurrect it.
  await deleteMaterialFiles(userId, id).catch(() => {});
}

/* -------------------------------------------------------------------------- */
/* Lessons (the client calls them Sessions)                                    */
/* -------------------------------------------------------------------------- */

interface LessonRow {
  id: string;
  course_id: string | null;
  title: string;
  material_ids: string[];
  provider_id: string;
  model: string;
  actions: unknown;
  transcript: unknown;
  plan: unknown;
  usage: unknown;
  board_theme: "paper" | "chalk";
  mode: "typed" | "voice";
  created_at: Date;
  updated_at: Date;
}

const toSession = (r: LessonRow): Session =>
  ({
    id: r.id,
    courseId: r.course_id ?? undefined,
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
    mode: r.mode ?? "typed",
  }) as Session;

const LESSON_COLUMNS = `id, course_id, title, material_ids, provider_id, model,
                        actions, transcript, plan, usage, board_theme, mode,
                        created_at, updated_at`;

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
  const wrote = await query(
    `insert into lessons
       (id, user_id, title, material_ids, provider_id, model, actions,
        transcript, plan, usage, board_theme, created_at, updated_at, course_id,
        mode)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
             to_timestamp($12 / 1000.0), to_timestamp($13 / 1000.0), $14, $15)
     on conflict (id) do update set
       title = excluded.title,
       course_id = excluded.course_id,
       material_ids = excluded.material_ids,
       provider_id = excluded.provider_id,
       model = excluded.model,
       actions = excluded.actions,
       transcript = excluded.transcript,
       plan = excluded.plan,
       usage = excluded.usage,
       board_theme = excluded.board_theme,
       mode = excluded.mode,
       updated_at = excluded.updated_at
     where lessons.user_id = $2
     returning id`,
    [
      s.id,
      userId,
      sanitizeText(s.title),
      s.materialIds,
      s.providerId,
      s.model,
      // jsonb refuses U+0000 exactly as text does, and board actions are built
      // from the same extracted material.
      JSON.stringify(sanitizeDeep(s.actions ?? [])),
      JSON.stringify(sanitizeDeep(s.transcript ?? [])),
      s.plan ? JSON.stringify(sanitizeDeep(s.plan)) : null,
      JSON.stringify(s.usage ?? {}),
      s.boardTheme,
      s.createdAt || Date.now(),
      s.updatedAt || Date.now(),
      s.courseId ?? null,
      s.mode === "voice" ? "voice" : "typed",
    ],
  );
  assertWrote(wrote, "lesson");
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
      sanitizeText(c.promptKey),
      c.materialIds,
      sanitizeText(c.prompt),
      c.choices ? c.choices.map(sanitizeText) : null,
      sanitizeText(c.answer),
      c.explanation ? sanitizeText(c.explanation) : null,
      c.sourceLocator ? sanitizeText(c.sourceLocator) : null,
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
  await deleteUserFiles(userId).catch(() => {});
}

/* -------------------------------------------------------------------------- */
/* Calendar & study planning                                                   */
/* -------------------------------------------------------------------------- */

export type { CalendarEvent, EventKind, StudyBlock };

interface EventRow {
  id: string;
  course_id: string | null;
  kind: EventKind;
  title: string;
  starts_at: Date;
  ends_at: Date | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  topics: string[];
  source: "manual" | "syllabus";
}

const toEvent = (r: EventRow): CalendarEvent => ({
  id: r.id,
  courseId: r.course_id ?? undefined,
  kind: r.kind,
  title: r.title,
  startsAt: ms(r.starts_at),
  endsAt: r.ends_at ? ms(r.ends_at) : undefined,
  allDay: r.all_day,
  location: r.location ?? undefined,
  notes: r.notes ?? undefined,
  topics: r.topics ?? [],
  source: r.source,
});

const EVENT_COLUMNS = `id, course_id, kind, title, starts_at, ends_at, all_day,
                       location, notes, topics, source`;

export async function listEvents(userId: string): Promise<CalendarEvent[]> {
  const rows = await query<EventRow>(
    `select ${EVENT_COLUMNS} from calendar_events where user_id = $1 order by starts_at asc`,
    [userId],
  );
  return rows.map(toEvent);
}

export async function putEvent(userId: string, e: CalendarEvent): Promise<void> {
  const wrote = await query(
    `insert into calendar_events
       (id, user_id, course_id, kind, title, starts_at, ends_at, all_day,
        location, notes, topics, source)
     values ($1,$2,$3,$4,$5, to_timestamp($6 / 1000.0),
             case when $7::bigint is null then null else to_timestamp($7 / 1000.0) end,
             $8,$9,$10,$11,$12)
     on conflict (id) do update set
       course_id = excluded.course_id,
       kind = excluded.kind,
       title = excluded.title,
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at,
       all_day = excluded.all_day,
       location = excluded.location,
       notes = excluded.notes,
       topics = excluded.topics
     where calendar_events.user_id = $2
     returning id`,
    [
      e.id,
      userId,
      e.courseId ?? null,
      e.kind,
      e.title,
      e.startsAt,
      e.endsAt ?? null,
      e.allDay,
      e.location ?? null,
      e.notes ?? null,
      e.topics ?? [],
      e.source,
    ],
  );
  assertWrote(wrote, "event");
}

export async function deleteEvent(userId: string, id: string): Promise<void> {
  await query("delete from calendar_events where id = $1 and user_id = $2", [id, userId]);
}

interface BlockRow {
  id: string;
  event_id: string | null;
  course_id: string | null;
  title: string;
  topic: string | null;
  starts_at: Date;
  minutes: number;
  material_ids: string[];
  status: StudyBlock["status"];
}

const toBlock = (r: BlockRow): StudyBlock => ({
  id: r.id,
  eventId: r.event_id ?? undefined,
  courseId: r.course_id ?? undefined,
  title: r.title,
  topic: r.topic ?? undefined,
  startsAt: ms(r.starts_at),
  minutes: r.minutes,
  materialIds: r.material_ids ?? [],
  status: r.status,
});

export async function listBlocks(userId: string): Promise<StudyBlock[]> {
  const rows = await query<BlockRow>(
    `select id, event_id, course_id, title, topic, starts_at, minutes,
            material_ids, status
       from study_blocks where user_id = $1 order by starts_at asc`,
    [userId],
  );
  return rows.map(toBlock);
}

/** Replaces the plan for one exam — regenerating must not double it up. */
export async function replaceBlocksForEvent(
  userId: string,
  eventId: string,
  blocks: StudyBlock[],
): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      "delete from study_blocks where user_id = $1 and event_id = $2",
      [userId, eventId],
    );
    for (const b of blocks) {
      await client.query(
        `insert into study_blocks
           (id, user_id, event_id, course_id, title, topic, starts_at, minutes,
            material_ids, status)
         values ($1,$2,$3,$4,$5,$6, to_timestamp($7 / 1000.0),$8,$9,$10)`,
        [
          b.id,
          userId,
          eventId,
          b.courseId ?? null,
          b.title,
          b.topic ?? null,
          b.startsAt,
          b.minutes,
          b.materialIds ?? [],
          b.status,
        ],
      );
    }
  });
}

export async function setBlockStatus(
  userId: string,
  id: string,
  status: StudyBlock["status"],
): Promise<void> {
  await query(
    "update study_blocks set status = $3 where id = $1 and user_id = $2",
    [id, userId, status],
  );
}

/** Writes vectors for chunks the student's provider has embedded. */
export async function saveEmbeddings(
  userId: string,
  model: string,
  vectors: { chunkId: string; embedding: number[] }[],
): Promise<number> {
  if (!vectors.length) return 0;
  let written = 0;
  await transaction(async (client) => {
    for (const { chunkId, embedding } of vectors) {
      // The join guards ownership: a chunk id alone must not be writable.
      const result = await client.query(
        `update material_chunks c
            set embedding = $3, embedding_model = $4
           from materials m
          where c.id = $1 and c.material_id = m.id and m.user_id = $2`,
        [chunkId, userId, embedding, model],
      );
      written += result.rowCount ?? 0;
    }
  });
  return written;
}

/* -------------------------------------------------------------------------- */
/* The key vault                                                               */
/* -------------------------------------------------------------------------- */


export interface StoredKey {
  providerId: string;
  key: string;
  hint: string;
}

/** Whether this account wants its keys kept server-side at all. */
export async function keySyncEnabled(userId: string): Promise<boolean> {
  const row = await query<{ sync_keys: boolean }>(
    "select sync_keys from users where id = $1",
    [userId],
  );
  return row[0]?.sync_keys ?? true;
}

export async function setKeySync(userId: string, enabled: boolean): Promise<void> {
  await query("update users set sync_keys = $2, updated_at = now() where id = $1", [
    userId,
    enabled,
  ]);
  // Turning sync off has to remove what's already stored, or "don't keep my
  // keys" would leave the existing ones sitting there.
  if (!enabled) {
    await query("delete from user_api_keys where user_id = $1", [userId]);
  }
}

export async function listKeys(userId: string): Promise<StoredKey[]> {
  const rows = await query<{
    provider_id: string;
    ciphertext: Buffer;
    nonce: Buffer;
    auth_tag: Buffer;
    hint: string;
  }>(
    `select provider_id, ciphertext, nonce, auth_tag, hint
       from user_api_keys where user_id = $1`,
    [userId],
  );

  const out: StoredKey[] = [];
  for (const row of rows) {
    const key = open({
      ciphertext: row.ciphertext,
      nonce: row.nonce,
      authTag: row.auth_tag,
    });
    // A row that won't decrypt means the secret was rotated; skip it rather
    // than handing a provider garbage and blaming the student's key.
    if (key) out.push({ providerId: row.provider_id, key, hint: row.hint });
  }
  return out;
}

export async function putKey(
  userId: string,
  providerId: string,
  key: string,
): Promise<void> {
  const sealed = seal(key);
  await query(
    `insert into user_api_keys
       (user_id, provider_id, ciphertext, nonce, auth_tag, hint)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (user_id, provider_id) do update set
       ciphertext = excluded.ciphertext,
       nonce = excluded.nonce,
       auth_tag = excluded.auth_tag,
       hint = excluded.hint,
       updated_at = now()`,
    [userId, providerId, sealed.ciphertext, sealed.nonce, sealed.authTag, hintFor(key)],
  );
}

export async function deleteKey(userId: string, providerId: string): Promise<void> {
  await query("delete from user_api_keys where user_id = $1 and provider_id = $2", [
    userId,
    providerId,
  ]);
}

export async function deleteAllKeys(userId: string): Promise<void> {
  await query("delete from user_api_keys where user_id = $1", [userId]);
}

/* -------------------------------------------------------------------------- */
/* Practice exams                                                              */
/* -------------------------------------------------------------------------- */

export interface StoredExam {
  exam: PracticeExam;
  responses: ExamResponses;
  result: ExamResult | null;
  submittedAt: number | null;
}

interface ExamRow {
  id: string;
  title: string;
  session_ids: string[];
  material_ids: string[];
  minutes: number;
  paper: unknown;
  focus: unknown;
  responses: unknown;
  result: unknown;
  submitted_at: Date | null;
  created_at: Date;
}

const toStoredExam = (r: ExamRow): StoredExam => ({
  exam: {
    id: r.id,
    title: r.title,
    createdAt: ms(r.created_at),
    sessionIds: r.session_ids,
    materialIds: r.material_ids,
    minutes: r.minutes,
    sections: (r.paper ?? []) as PracticeExam["sections"],
    focus: (r.focus ?? []) as PracticeExam["focus"],
  },
  responses: (r.responses ?? {}) as ExamResponses,
  result: (r.result ?? null) as ExamResult | null,
  submittedAt: r.submitted_at ? ms(r.submitted_at) : null,
});

const EXAM_COLUMNS = `id, title, session_ids, material_ids, minutes, paper, focus,
                      responses, result, submitted_at, created_at`;

export async function listExams(userId: string): Promise<StoredExam[]> {
  const rows = await query<ExamRow>(
    `select ${EXAM_COLUMNS} from practice_exams where user_id = $1 order by created_at desc`,
    [userId],
  );
  return rows.map(toStoredExam);
}

export async function getExam(
  userId: string,
  id: string,
): Promise<StoredExam | null> {
  const rows = await query<ExamRow>(
    `select ${EXAM_COLUMNS} from practice_exams where id = $1 and user_id = $2`,
    [id, userId],
  );
  return rows[0] ? toStoredExam(rows[0]) : null;
}

export async function putExam(userId: string, exam: PracticeExam): Promise<void> {
  const wrote = await query(
    `insert into practice_exams
       (id, user_id, title, session_ids, material_ids, minutes, paper, focus,
        created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, to_timestamp($9 / 1000.0))
     -- Re-saving your own paper is a no-op; it can never overwrite someone
     -- else's row, and a collision fails loudly rather than vanishing.
     on conflict (id) do update set updated_at = now()
       where practice_exams.user_id = $2
     returning id`,
    [
      exam.id,
      userId,
      sanitizeText(exam.title),
      exam.sessionIds,
      exam.materialIds,
      exam.minutes,
      JSON.stringify(sanitizeDeep(exam.sections)),
      JSON.stringify(sanitizeDeep(exam.focus)),
      exam.createdAt || Date.now(),
    ],
  );
  assertWrote(wrote, "exam");
}

/** Autosaves in-progress answers. Refuses to touch a submitted paper. */
export async function saveExamResponses(
  userId: string,
  id: string,
  responses: ExamResponses,
): Promise<void> {
  await query(
    `update practice_exams
        set responses = $3, updated_at = now()
      where id = $1 and user_id = $2 and submitted_at is null`,
    [id, userId, JSON.stringify(responses)],
  );
}

/**
 * Records the grade. Grading happens server-side so the answer key never has
 * to be trusted from the client, and the first submission is the one that
 * counts — resubmitting can't improve a score.
 */
export async function submitExam(
  userId: string,
  id: string,
  responses: ExamResponses,
): Promise<StoredExam | null> {
  const stored = await getExam(userId, id);
  if (!stored) return null;
  if (stored.submittedAt) return stored;

  const result = gradeExam(stored.exam, responses);
  await query(
    `update practice_exams
        set responses = $3, result = $4, submitted_at = now(), updated_at = now()
      where id = $1 and user_id = $2 and submitted_at is null`,
    [id, userId, JSON.stringify(responses), JSON.stringify(result)],
  );
  return { ...stored, responses, result, submittedAt: Date.now() };
}

export async function deleteExam(userId: string, id: string): Promise<void> {
  await query("delete from practice_exams where id = $1 and user_id = $2", [id, userId]);
}

/* -------------------------------------------------------------------------- */
/* Exam reviews                                                                */
/* -------------------------------------------------------------------------- */

interface ExamReviewRow {
  id: string;
  course_id: string | null;
  title: string;
  pages: unknown;
  review: unknown;
  created_at: Date;
}

const toExamReview = (r: ExamReviewRow): ExamReview => ({
  id: r.id,
  courseId: r.course_id ?? undefined,
  title: r.title,
  pages: (r.pages ?? []) as ExamReview["pages"],
  review: (r.review ?? null) as ExamReview["review"],
  createdAt: ms(r.created_at),
});

const REVIEW_COLUMNS = `id, course_id, title, pages, review, created_at`;

export async function listExamReviews(userId: string): Promise<ExamReview[]> {
  const rows = await query<ExamReviewRow>(
    `select ${REVIEW_COLUMNS} from exam_reviews where user_id = $1 order by created_at desc`,
    [userId],
  );
  return rows.map(toExamReview);
}

export async function getExamReview(
  userId: string,
  id: string,
): Promise<ExamReview | null> {
  const rows = await query<ExamReviewRow>(
    `select ${REVIEW_COLUMNS} from exam_reviews where id = $1 and user_id = $2`,
    [id, userId],
  );
  return rows[0] ? toExamReview(rows[0]) : null;
}

export async function putExamReview(
  userId: string,
  review: ExamReview,
): Promise<void> {
  const wrote = await query(
    `insert into exam_reviews (id, user_id, course_id, title, pages, review, created_at)
     values ($1,$2,$3,$4,$5,$6, to_timestamp($7 / 1000.0))
     on conflict (id) do update set
       course_id = excluded.course_id,
       title = excluded.title,
       pages = excluded.pages,
       review = excluded.review,
       updated_at = now()
     where exam_reviews.user_id = $2
     returning id`,
    [
      review.id,
      userId,
      review.courseId ?? null,
      sanitizeText(review.title),
      JSON.stringify(sanitizeDeep(review.pages ?? [])),
      review.review ? JSON.stringify(sanitizeDeep(review.review)) : null,
      review.createdAt || Date.now(),
    ],
  );
  assertWrote(wrote, "exam review");
}

export async function deleteExamReview(userId: string, id: string): Promise<void> {
  await query("delete from exam_reviews where id = $1 and user_id = $2", [id, userId]);
  // Page images live under the review's own directory on the volume.
  await deleteMaterialFiles(userId, id).catch(() => {});
}
