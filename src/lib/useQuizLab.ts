"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getChunksFor,
  listAttempts,
  listCards,
  listMaterials,
  putAttempt,
  putCard,
  type Material,
  type QuizAttempt,
  type QuizQuestion,
} from "./db";
import { loadKeys } from "./keys";
import { estimateCost, ProviderError } from "./providers";
import { loadSettings, saveSettings } from "./settings";
import { upsertCard, type ReviewCard } from "./srs";
import { checkAnswer, generateQuiz } from "./tutor/engine";
import { resolveCardMaterials } from "./useTutor";

/** Handoff to the board: "teach me this one" is answered there, live. */
export const TEACH_REQUEST_KEY = "chalk.teach.v1";

const SELECTION_KEY = "chalk.quiz.materials.v1";
const MAX_QUESTIONS = 30;

export interface QuizRun {
  id: string;
  title: string;
  questions: QuizQuestion[];
  /** Index of the question on the table. */
  index: number;
  finished: boolean;
  costUsd: number;
}

/**
 * The flashcards page: pick material, generate as many quizzes as you like,
 * and every answered question feeds the same review queue the board uses.
 */
export function useQuizLab() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [run, setRun] = useState<QuizRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [settings, setSettings] = useState(loadSettings());
  const cardsRef = useRef<ReviewCard[]>([]);
  const graded = useRef<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      try {
        const [allMaterials, allAttempts, allCards] = await Promise.all([
          listMaterials(),
          listAttempts(),
          listCards(),
        ]);
        setMaterials(allMaterials);
        setAttempts(allAttempts);
        cardsRef.current = allCards;
        const stored = localStorage.getItem(SELECTION_KEY);
        if (stored) {
          setSelectedIds((JSON.parse(stored) as string[]).filter((id) =>
            allMaterials.some((m) => m.id === id),
          ));
        } else {
          setSelectedIds(allMaterials.map((m) => m.id));
        }
      } catch (caught) {
        setError({
          message: "Couldn't open the local study database.",
          hint: caught instanceof Error ? caught.message : undefined,
        });
      }
    })();
  }, []);

  const toggleMaterial = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id];
      localStorage.setItem(SELECTION_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const changeSettings = useCallback((next: typeof settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const generate = useCallback(
    async (topic: string, count: number) => {
      const apiKey = loadKeys()[settings.providerId];
      if (!apiKey) {
        setError({
          message: "No API key for this provider yet.",
          hint: "Add one from the board — it stays in your browser.",
        });
        return;
      }
      const bounded = Math.max(1, Math.min(Math.round(count) || 10, MAX_QUESTIONS));
      setBusy(true);
      setError(null);
      try {
        const chunks = await getChunksFor(selectedIds);
        const selected = materials.filter((m) => selectedIds.includes(m.id));
        const { questions, usage } = await generateQuiz({
          providerId: settings.providerId,
          model: settings.model,
          apiKey,
          materials: selected,
          chunks,
          topic,
          count: bounded,
        });
        setRun({
          id: `quiz_${Date.now().toString(36)}`,
          title: topic || "Practice quiz",
          questions,
          index: 0,
          finished: false,
          costUsd:
            estimateCost(
              settings.providerId,
              settings.model,
              usage.inputTokens,
              usage.outputTokens,
            ) ?? 0,
        });
      } catch (caught) {
        if (caught instanceof ProviderError) {
          setError({ message: caught.message, hint: caught.hint });
        } else if (caught instanceof Error) {
          setError({ message: caught.message });
        } else {
          setError({ message: "Something went wrong generating the quiz." });
        }
      } finally {
        setBusy(false);
      }
    },
    [materials, selectedIds, settings.providerId, settings.model],
  );

  const answer = useCallback(
    (questionId: string, response: string) => {
      const current = run;
      if (!current) return false;
      const question = current.questions.find((q) => q.id === questionId);
      if (!question || question.response !== undefined) return false;
      const gradeKey = `${current.id}:${questionId}`;
      if (graded.current.has(gradeKey)) return false;
      graded.current.add(gradeKey);

      const correct = checkAnswer(question, response);

      // Same seeding contract as the board: every answered question becomes a
      // review card, attributed to the material the question actually came from.
      const { cards: seeded, card } = upsertCard(
        cardsRef.current,
        question,
        resolveCardMaterials(question.sourceMaterial, selectedIds, materials),
        correct,
        Date.now(),
        `card_${crypto.randomUUID().slice(0, 8)}`,
      );
      cardsRef.current = seeded;
      void putCard(card);

      const questions = current.questions.map((q) =>
        q.id === questionId ? { ...q, response, correct } : q,
      );
      const count = questions.filter((q) => q.response !== undefined).length;
      const finished = count === questions.length;

      setRun({
        ...current,
        questions,
        index: Math.min(count, questions.length - 1),
        finished,
      });

      if (finished) {
        const attempt: QuizAttempt = {
          id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          sessionId: "flashcards",
          title: current.title,
          materialIds: [...selectedIds],
          createdAt: Date.now(),
          score: questions.filter((q) => q.correct).length,
          total: questions.length,
        };
        void putAttempt(attempt);
        setAttempts((prev) => [attempt, ...prev]);
      }
      return correct;
    },
    [run, selectedIds, materials],
  );

  /** Move to the next flashcard, or set the run down as finished. */
  const advance = useCallback(() => {
    setRun((prev) => {
      if (!prev) return prev;
      return { ...prev, index: Math.min(prev.index + 1, prev.questions.length - 1), finished: true };
    });
  }, []);

  const reset = useCallback(() => setRun(null), []);

  /** Hand a missed question to the tutor on the board. */
  const teach = useCallback(
    (question: QuizQuestion) => {
      sessionStorage.setItem(
        TEACH_REQUEST_KEY,
        JSON.stringify({
          prompt: question.prompt,
          response: question.response ?? "",
          answer: question.answer,
        }),
      );
      router.push("/app");
    },
    [router],
  );

  return {
    materials,
    selectedIds,
    toggleMaterial,
    attempts,
    run,
    busy,
    error,
    dismissError: () => setError(null),
    settings,
    changeSettings,
    generate,
    answer,
    advance,
    reset,
    teach,
    maxQuestions: MAX_QUESTIONS,
  };
}
