"use client";

import { useCallback, useEffect, useState } from "react";

import {
  listAttempts,
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
 */

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
  const [materials, setMaterials] = useState<Material[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [papers, setPapers] = useState<GradedPaperRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      listMaterials(),
      listCourses(),
      listCards(),
      listAttempts(),
      listSessions(),
      // Submitted practice exams count toward mastery too — they're the
      // longest papers a student sits, so they carry the most weight.
      fetch("/api/exams")
        .then((r) => (r.ok ? r.json() : { exams: [] }))
        .then((body) => body.exams ?? [])
        .catch(() => []),
    ])
      .then(([m, c, k, a, s, rawExams]) => {
        if (!live) return;
        setMaterials(m);
        setCourses(c);
        setCards(k);
        setAttempts(a);
        setSessions(s);
        setPapers(
          (rawExams as { exam: { materialIds: string[]; createdAt: number };
                         result: { awarded: number; total: number } | null }[])
            .filter((row) => row.result && row.result.total > 0)
            .map((row) => ({
              materialIds: row.exam.materialIds,
              awarded: row.result!.awarded,
              total: row.result!.total,
              createdAt: row.exam.createdAt,
            })),
        );
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
