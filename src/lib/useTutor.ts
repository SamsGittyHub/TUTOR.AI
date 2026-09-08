"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TutorAction } from "./actions";
import {
  deleteMaterial as dbDeleteMaterial,
  deleteSession as dbDeleteSession,
  getChunksFor,
  getSession,
  listAttempts,
  listCards,
  listMaterials,
  listSessions,
  putCard,
  putMaterial,
  putSession,
  type Material,
  type MaterialChunk,
  type QuizAttempt,
  type Session,
} from "./db";
import { extractMaterial, materialFromText, ExtractionError } from "./materials/extract";
import { estimateCost, ProviderError, type ProviderId } from "./providers";
import { loadKeys, type KeyMap } from "./keys";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings";
import { isDue, schedule, upsertCard, type ReviewCard } from "./srs";
import { boardSummary, checkAnswer, runTutorTurn, summarizeTurn } from "./tutor/engine";
import { buildQuizReviewMessage } from "./tutor/prompts";

export type TutorStatus = "idle" | "thinking" | "teaching" | "error";

function newSession(settings: Settings): Session {
  return {
    id: `s_${crypto.randomUUID().slice(0, 8)}`,
    title: "New lesson",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    materialIds: [],
    providerId: settings.providerId,
    model: settings.model,
    actions: [],
    transcript: [],
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, turns: 0 },
    boardTheme: "paper",
  };
}

/**
 * Attribute a question to one material when the model named its source file,
 * otherwise the card spans everything selected for the quiz.
 */
export function resolveCardMaterials(
  sourceMaterial: string | undefined,
  selectedIds: string[],
  materials: Material[],
): string[] {
  if (sourceMaterial) {
    const needle = sourceMaterial.trim().toLowerCase();
    const match = needle
      ? materials.find((m) => {
          if (!selectedIds.includes(m.id)) return false;
          const name = m.name.toLowerCase();
          return name === needle || name.includes(needle) || needle.includes(name);
        })
      : undefined;
    if (match) return [match.id];
  }
  return [...selectedIds];
}

export interface UploadState {
  name: string;
  stage: string;
  ratio?: number;
}

export function useTutor() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [keys, setKeys] = useState<KeyMap>({});
  const [session, setSession] = useState<Session>(() => newSession(DEFAULT_SETTINGS));
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [chunks, setChunks] = useState<MaterialChunk[]>([]);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [status, setStatus] = useState<TutorStatus>("idle");
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [ready, setReady] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  /** Mirror of the cards store — the source for read-modify-write upserts. */
  const cardsRef = useRef<ReviewCard[]>([]);
  /** Card mutations queue here so rapid answers can't read a stale mirror. */
  const cardOps = useRef<Promise<void>>(Promise.resolve());

  /* --- boot ------------------------------------------------------------- */

  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
    setKeys(loadKeys());
    void (async () => {
      try {
        const [allMaterials, allSessions, allCards, allAttempts] = await Promise.all([
          listMaterials(),
          listSessions(),
          listCards(),
          listAttempts(),
        ]);
        setMaterials(allMaterials);
        setSessions(allSessions);
        cardsRef.current = allCards;
        setCards(allCards);
        setAttempts(allAttempts);
        const last = allSessions[0];
        if (last && last.actions.length) {
          setSession(last);
          setChunks(await getChunksFor(last.materialIds));
        } else {
          setSession(newSession(stored));
        }
      } catch (caught) {
        // A failed upgrade or blocked store must not look like an empty
        // account — say so instead of rendering a blank slate.
        setSession(newSession(stored));
        setError({
          message: "Couldn't open the local study database.",
          hint:
            caught instanceof Error
              ? caught.message
              : "IndexedDB access failed; try closing other tabs and reloading.",
        });
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  /** Persist on a trailing edge — a streaming lesson writes constantly. */
  useEffect(() => {
    if (!ready || (!session.actions.length && !session.materialIds.length)) return;
    const handle = setTimeout(() => {
      void putSession(session).then(() => listSessions().then(setSessions));
    }, 700);
    return () => clearTimeout(handle);
  }, [session, ready]);

  const apiKey = keys[settings.providerId];
  const hasKey = Boolean(apiKey);

  const materialName = useCallback(
    (id: string) => materials.find((m) => m.id === id)?.name ?? "your notes",
    [materials],
  );

  /* --- review queue ------------------------------------------------------- */

  // `today` flips at local midnight so the due set can't go stale in a tab
  // left open overnight.
  const [today, setToday] = useState(() => new Date().toDateString());
  useEffect(() => {
    const handle = setInterval(() => {
      const now = new Date().toDateString();
      setToday((prev) => (prev === now ? prev : now));
    }, 60_000);
    return () => clearInterval(handle);
  }, []);

  /** The single writer for cards state and its ref mirror. */
  const applyCards = useCallback((next: ReviewCard[]) => {
    cardsRef.current = next;
    setCards(next);
  }, []);

  const dueCount = useMemo(
    () => cards.filter((card) => isDue(card)).length,
    [cards, today],
  );

  const dueQueue = useMemo(
    () => cards.filter((card) => isDue(card)).sort((a, b) => a.dueAt - b.dueAt),
    [cards, today],
  );

  /** Grade a review card: schedule it, persist, refresh the count. */
  const answerCard = useCallback(
    (card: ReviewCard, response: string): boolean => {
      const correct = checkAnswer(card, response);
      const scheduled = schedule(card, correct, Date.now());
      applyCards(cardsRef.current.map((c) => (c.id === card.id ? scheduled : c)));
      void putCard(scheduled);
      return correct;
    },
    [applyCards],
  );

  /* --- turns ------------------------------------------------------------ */

  const runTurn = useCallback(
    async (studentMessage: string, options: { titleFrom?: string } = {}) => {
      const current = sessionRef.current;
      const key = loadKeys()[current.providerId] ?? loadKeys()[settings.providerId];
      if (!key) {
        setError({
          message: "No API key for this provider yet.",
          hint: "Open Settings and paste a key — the tutor runs entirely on yours.",
        });
        return;
      }

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setError(null);
      setStatus("thinking");

      const at = Date.now();
      setSession((prev) => ({
        ...prev,
        title:
          prev.title === "New lesson" && (options.titleFrom ?? studentMessage)
            ? (options.titleFrom ?? studentMessage).slice(0, 60)
            : prev.title,
        transcript: [...prev.transcript, { role: "student", text: studentMessage, at }],
        updatedAt: at,
      }));

      const collected: TutorAction[] = [];

      try {
        const result = await runTutorTurn({
          providerId: current.providerId,
          model: current.model,
          apiKey: key,
          studentMessage,
          transcript: current.transcript,
          materials: materials.filter((m) => current.materialIds.includes(m.id)),
          chunks,
          boardSummary: boardSummary(current.actions),
          signal: controller.signal,
          onAction: (action) => {
            collected.push(action);
            setStatus("teaching");
            setSession((prev) => {
              const next: Session = { ...prev, actions: [...prev.actions, action] };
              if (action.type === "lesson_plan") {
                next.plan = { title: action.title, steps: action.steps, currentIndex: 0 };
                if (prev.title === "New lesson") next.title = action.title;
              }
              if (action.type === "done" && action.stepIndex !== undefined && prev.plan) {
                next.plan = {
                  ...prev.plan,
                  currentIndex: Math.min(action.stepIndex + 1, prev.plan.steps.length),
                };
              }
              return next;
            });
          },
        });

        const cost =
          estimateCost(
            current.providerId,
            current.model,
            result.usage.inputTokens,
            result.usage.outputTokens,
          ) ?? 0;

        setSession((prev) => ({
          ...prev,
          transcript: [
            ...prev.transcript,
            { role: "tutor", text: summarizeTurn(result.actions), at: Date.now() },
          ],
          usage: {
            inputTokens: prev.usage.inputTokens + result.usage.inputTokens,
            outputTokens: prev.usage.outputTokens + result.usage.outputTokens,
            costUsd: prev.usage.costUsd + cost,
            turns: prev.usage.turns + 1,
          },
          updatedAt: Date.now(),
        }));

        if (result.degraded === "plain-text") {
          setNotice(
            "That model couldn't hold the whiteboard format, so the lesson came through as plain text. A stronger model will draw properly.",
          );
        } else if (result.degraded === "repaired") {
          setNotice("That model needed a nudge to format its answer — the lesson may be shorter than usual.");
        }
        setStatus("idle");
      } catch (caught) {
        if (controller.signal.aborted) {
          setStatus("idle");
          return;
        }
        const message =
          caught instanceof ProviderError
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : "Something went wrong talking to the model.";
        setError({
          message,
          hint: caught instanceof ProviderError ? caught.hint : undefined,
        });
        setStatus("error");
      }
    },
    [chunks, materials, settings.providerId],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
    setStatus("idle");
  }, []);

  const send = useCallback(
    (message: string) => {
      if (!message.trim() || status === "thinking" || status === "teaching") return;
      void runTurn(message.trim());
    },
    [runTurn, status],
  );

  const answerBoardQuestion = useCallback(
    (question: string, answer: string) => {
      void runTurn(`(answering "${question}") ${answer}`);
    },
    [runTurn],
  );

  const startLesson = useCallback(
    async (materialIds: string[], goal: string) => {
      const loaded = await getChunksFor(materialIds);
      setChunks(loaded);
      const names = materials
        .filter((m) => materialIds.includes(m.id))
        .map((m) => m.name);

      setSession((prev) => ({ ...prev, materialIds, updatedAt: Date.now() }));

      const opening = materialIds.length
        ? `Teach me ${goal || "this material"}. I've uploaded: ${names.join(", ")}. Start with a lesson plan, then teach the first step.`
        : `Teach me ${goal}. Start with a lesson plan, then teach the first step.`;

      // The state update above hasn't landed in sessionRef yet.
      sessionRef.current = { ...sessionRef.current, materialIds };
      setTimeout(() => {
        void runTurn(opening, { titleFrom: goal || names[0] });
      }, 0);
    },
    [materials, runTurn],
  );

  /* --- materials -------------------------------------------------------- */

  const addFile = useCallback(
    async (file: File) => {
      setUpload({ name: file.name, stage: "Opening file" });
      setError(null);
      try {
        const { material, chunks: fresh } = await extractMaterial({
          file,
          openaiKey: loadKeys().openai,
          onProgress: (stage, ratio) => setUpload({ name: file.name, stage, ratio }),
        });
        await putMaterial(material, fresh);
        setMaterials(await listMaterials());
        setSession((prev) =>
          prev.materialIds.includes(material.id)
            ? prev
            : { ...prev, materialIds: [...prev.materialIds, material.id], updatedAt: Date.now() },
        );
        setChunks((prev) => [...prev, ...fresh]);
        setNotice(
          `Read ${material.name} — ${material.chunkCount} chunk${material.chunkCount === 1 ? "" : "s"}${
            material.unitCount ? ` across ${material.unitCount} ${material.kind === "pptx" ? "slides" : "pages"}` : ""
          }.`,
        );
      } catch (caught) {
        setError({
          message:
            caught instanceof ExtractionError
              ? caught.message
              : `Couldn't read ${file.name}: ${(caught as Error).message}`,
        });
      } finally {
        setUpload(null);
      }
    },
    [],
  );

  const addPastedText = useCallback(async (name: string, text: string) => {
    const { material, chunks: fresh } = materialFromText(name, text);
    await putMaterial(material, fresh);
    setMaterials(await listMaterials());
    setSession((prev) => ({
      ...prev,
      materialIds: [...prev.materialIds, material.id],
      updatedAt: Date.now(),
    }));
    setChunks((prev) => [...prev, ...fresh]);
  }, []);

  const removeMaterial = useCallback(
    async (id: string) => {
      await dbDeleteMaterial(id);
      setMaterials(await listMaterials());
      setChunks((prev) => prev.filter((c) => c.materialId !== id));
      // The db cascade removes overlapping cards and attempts; mirror it here.
      applyCards(cardsRef.current.filter((c) => !c.materialIds.includes(id)));
      setAttempts((prev) => prev.filter((a) => !a.materialIds.includes(id)));
      setSession((prev) => ({
        ...prev,
        materialIds: prev.materialIds.filter((m) => m !== id),
      }));
    },
    [applyCards],
  );

  const toggleMaterial = useCallback(
    async (id: string) => {
      const next = sessionRef.current.materialIds.includes(id)
        ? sessionRef.current.materialIds.filter((m) => m !== id)
        : [...sessionRef.current.materialIds, id];
      setSession((prev) => ({ ...prev, materialIds: next, updatedAt: Date.now() }));
      setChunks(await getChunksFor(next));
    },
    [],
  );

  /* --- sessions --------------------------------------------------------- */

  const openSession = useCallback(async (id: string) => {
    const found = await getSession(id);
    if (!found) return;
    abort.current?.abort();
    setSession(found);
    setChunks(await getChunksFor(found.materialIds));
    setStatus("idle");
    setError(null);
  }, []);

  const startFresh = useCallback(() => {
    abort.current?.abort();
    setSession(newSession(settings));
    setChunks([]);
    setStatus("idle");
    setError(null);
  }, [settings]);

  const removeSession = useCallback(
    async (id: string) => {
      await dbDeleteSession(id);
      setSessions(await listSessions());
      if (sessionRef.current.id === id) startFresh();
    },
    [startFresh],
  );

  /* --- review-card teaching ---------------------------------------------- */

  /** Same walkthrough as the quiz flow, for a review card missed in the queue. */
  const teachCard = useCallback(
    (card: ReviewCard, response: string) => {
      void runTurn(buildQuizReviewMessage(card.prompt, response, card.answer));
    },
    [runTurn],
  );

  /* --- board ------------------------------------------------------------ */

  const toggleBoardTheme = useCallback(() => {
    setSession((prev) => ({
      ...prev,
      boardTheme: prev.boardTheme === "paper" ? "chalk" : "paper",
    }));
  }, []);

  const wipeBoard = useCallback(() => {
    setSession((prev) => ({
      ...prev,
      actions: [
        ...prev.actions,
        ...prev.actions
          .filter((a) => a.type !== "erase" && a.type !== "say" && a.type !== "done")
          .map(
            (a): TutorAction => ({
              id: `wipe_${a.id}`,
              type: "erase",
              targetId: a.id,
            }),
          ),
      ],
      updatedAt: Date.now(),
    }));
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    setSession((prev) => ({
      ...prev,
      providerId: next.providerId,
      model: next.model,
      updatedAt: Date.now(),
    }));
  }, []);

  const refreshKeys = useCallback(() => setKeys(loadKeys()), []);

  return {
    ready,
    settings,
    updateSettings,
    keys,
    refreshKeys,
    hasKey,
    session,
    sessions,
    materials,
    materialName,
    cards,
    attempts,
    dueCount,
    dueQueue,
    answerCard,
    teachCard,
    status,
    error,
    dismissError: () => setError(null),
    notice,
    dismissNotice: () => setNotice(null),
    upload,
    send,
    stop,
    startLesson,
    answerBoardQuestion,
    addFile,
    addPastedText,
    removeMaterial,
    toggleMaterial,
    openSession,
    startFresh,
    removeSession,
    toggleBoardTheme,
    wipeBoard,
  };
}
