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

export interface Library {
  materials: Material[];
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
    ])
      .then(([m, c, k, a, s]) => {
        if (!live) return;
        setMaterials(m);
        setCourses(c);
        setCards(k);
        setAttempts(a);
        setSessions(s);
        setError(null);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Load failed."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [nonce]);

  return { materials, courses, cards, attempts, sessions, loading, error, reload };
}

/** Shared empty/loading/error rendering so each page doesn't reinvent it. */
export function libraryState(lib: Library): "loading" | "error" | "ready" {
  if (lib.loading) return "loading";
  if (lib.error) return "error";
  return "ready";
}
