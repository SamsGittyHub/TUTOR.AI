"use client";

import { useCallback, useEffect, useState } from "react";

import {
  listAttempts,
  listExamRows,
  listCards,
  listCourses,
  listMaterials,
  listSessions,
  type Course,
  type Material,
  type QuizAttempt,
  type Session,
} from "./db";
import type { ReviewCard } from "./srs";

/**
 * One loader for the pages that just read the student's library.
 *
 * Every page below /app needs some subset of these five lists, and db.ts
 * already memoizes the fetches — so asking for all of them costs one round
 * trip each per page load, and nothing on a revisit.
 *
 * The last successful result is also kept here, module-side, and used as the
 * starting state for the next page. Without it every navigation flashed a
 * "Loading your material…" skeleton before the cache resolved a microtask
 * later, which made a site that already had the data feel like one that
 * didn't. The fetch still runs; it just replaces data that's already on
 * screen instead of replacing a spinner.
 */

interface Snapshot {
  materials: Material[];
  courses: Course[];
  cards: ReviewCard[];
  attempts: QuizAttempt[];
  sessions: Session[];
  papers: GradedPaperRow[];
}

let snapshot: Snapshot | null = null;

/** Called on sign-out, with db.ts's cache — the next user must not see this. */
export function clearLibrarySnapshot(): void {
  snapshot = null;
}

/** A submitted practice exam, reduced to what the ranking needs. */
export interface GradedPaperRow {
  materialIds: string[];
  awarded: number;
  total: number;
  createdAt: number;
}

export interface Library {
  materials: Material[];
  papers: GradedPaperRow[];
  courses: Course[];
  cards: ReviewCard[];
  attempts: QuizAttempt[];
  sessions: Session[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useLibrary(): Library {
  const [materials, setMaterials] = useState<Material[]>(() => snapshot?.materials ?? []);
  const [courses, setCourses] = useState<Course[]>(() => snapshot?.courses ?? []);
  const [cards, setCards] = useState<ReviewCard[]>(() => snapshot?.cards ?? []);
  const [attempts, setAttempts] = useState<QuizAttempt[]>(() => snapshot?.attempts ?? []);
  const [sessions, setSessions] = useState<Session[]>(() => snapshot?.sessions ?? []);
  const [papers, setPapers] = useState<GradedPaperRow[]>(() => snapshot?.papers ?? []);
  // Only the very first load is a loading state. After that the page renders
  // what it already knows and quietly catches up.
  const [loading, setLoading] = useState(() => snapshot === null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    if (snapshot === null) setLoading(true);
    Promise.all([
      listMaterials(),
      listCourses(),
      listCards(),
      listAttempts(),
      listSessions(),
      // Submitted practice exams count toward mastery too — they're the
      // longest papers a student sits, so they carry the most weight.
      listExamRows().catch(() => []),
    ])
      .then(([m, c, k, a, s, rawExams]) => {
        const nextPapers = (rawExams as {
          exam: { materialIds: string[]; createdAt: number };
          result: { awarded: number; total: number } | null;
        }[])
          .filter((row) => row.result && row.result.total > 0)
          .map((row) => ({
            materialIds: row.exam.materialIds,
            awarded: row.result!.awarded,
            total: row.result!.total,
            createdAt: row.exam.createdAt,
          }));

        // Kept even if this hook has since unmounted: the next page wants it.
        snapshot = { materials: m, courses: c, cards: k, attempts: a, sessions: s, papers: nextPapers };
        if (!live) return;
        setMaterials(m);
        setCourses(c);
        setCards(k);
        setAttempts(a);
        setSessions(s);
        setPapers(nextPapers);
        setError(null);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Load failed."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [nonce]);

  return { materials, courses, cards, attempts, sessions, papers, loading, error, reload };
}

/** Shared empty/loading/error rendering so each page doesn't reinvent it. */
export function libraryState(lib: Library): "loading" | "error" | "ready" {
  if (lib.loading) return "loading";
  if (lib.error) return "error";
  return "ready";
}
