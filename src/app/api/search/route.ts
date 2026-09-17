import { authed } from "@/lib/server/handler";
import { query } from "@/lib/server/db";
import { excerpt } from "@/lib/search";

/**
 * Searching the student's own library.
 *
 * Postgres does the matching: material_chunks has carried a full-text index
 * since the first migration for the tutor's own retrieval, and the same index
 * answers this. Lessons are matched on their title and their board text, which
 * is how "where did we do titration" finds the lesson as well as the notes.
 *
 * Scoped by user_id on every branch, and chunks are reached only through a
 * join on materials — a chunk id alone must never be enough to read one.
 */

const LIMIT = 24;

interface ChunkRow {
  locator: string;
  text: string;
  material_id: string;
  name: string;
  rank: number;
}

interface LessonRow {
  id: string;
  title: string;
  mode: string;
  updated_at: Date;
  cards: number;
}

export const GET = authed(async (user, request) => {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return { query: q, material: [], lessons: [] };

  const [chunks, lessons] = await Promise.all([
    query<ChunkRow>(
      `select c.locator, c.text, m.id as material_id, m.name,
              ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', $2)) as rank
         from material_chunks c
         join materials m on m.id = c.material_id
        where m.user_id = $1
          and to_tsvector('english', c.text) @@ plainto_tsquery('english', $2)
        order by rank desc
        limit $3`,
      [user.id, q, LIMIT],
    ),
    query<LessonRow>(
      `select id, title, mode, updated_at,
              coalesce(jsonb_array_length(actions), 0) as cards
         from lessons
        where user_id = $1
          and (title ilike $2 or actions::text ilike $2)
        order by updated_at desc
        limit $3`,
      [user.id, `%${q.replace(/[%_]/g, "\\$&")}%`, 12],
    ),
  ]);

  return {
    query: q,
    material: chunks.map((row) => ({
      materialId: row.material_id,
      name: row.name,
      locator: row.locator,
      // Trimmed here rather than in the browser: a lecture transcript chunk is
      // kilobytes, and all anyone needs is the sentence around the match.
      excerpt: excerpt(row.text, q),
    })),
    lessons: lessons.map((row) => ({
      id: row.id,
      title: row.title,
      mode: row.mode === "voice" ? "voice" : "typed",
      updatedAt: row.updated_at.getTime(),
      cards: Number(row.cards) || 0,
    })),
  };
});
