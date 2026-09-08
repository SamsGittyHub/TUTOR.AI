"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TutorAction } from "./actions";
import {
  deleteMaterial as dbDeleteMaterial,
  deleteSession as dbDeleteSession,
  getChunksFor,
  getSession,
  listMaterials,
  listSessions,
  putMaterial,
  putSession,
  type Material,
  type MaterialChunk,
  type QuizQuestion,
  type Session,
} from "./db";
import { extractMaterial, materialFromText, ExtractionError } from "./materials/extract";
import { estimateCost, ProviderError, type ProviderId } from "./providers";
import { loadKeys, type KeyMap } from "./keys";
import {
  boardSummary,
  checkAnswer,
  generateQuiz,
  runTutorTurn,
  summarizeTurn,
} from "./tutor/engine";
import { buildQuizReviewMessage } from "./tutor/prompts";

const SETTINGS_KEY = "chalk.settings.v1";

export type TutorStatus = "idle" | "thinking" | "teaching" | "error";

export interface Settings {
  providerId: ProviderId;
  model: string;
}

const DEFAULT_SETTINGS: Settings = {
  providerId: "anthropic",
  model: "claude-sonnet-5",
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

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
  const [status, setStatus] = useState<TutorStatus>("idle");
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  /* --- boot ------------------------------------------------------------- */

  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
    setKeys(loadKeys());
    void (async () => {
      const [allMaterials, allSessions] = await Promise.all([
        listMaterials(),
        listSessions(),
      ]);
      setMaterials(allMaterials);
      setSessions(allSessions);
      const last = allSessions[0];
      if (last && last.actions.length) {
        setSession(last);
        setChunks(await getChunksFor(last.materialIds));
      } else {
        setSession(newSession(stored));
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
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

  const selectedMaterials = useMemo(
    () => materials.filter((m) => session.materialIds.includes(m.id)),
    [materials, session.materialIds],
  );

  const materialName = useCallback(
    (id: string) => materials.find((m) => m.id === id)?.name ?? "your notes",
    [materials],
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

  const removeMaterial = useCallback(async (id: string) => {
    await dbDeleteMaterial(id);
    setMaterials(await listMaterials());
    setChunks((prev) => prev.filter((c) => c.materialId !== id));
    setSession((prev) => ({
      ...prev,
      materialIds: prev.materialIds.filter((m) => m !== id),
    }));
  }, []);

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

  /* --- quiz ------------------------------------------------------------- */

  const makeQuiz = useCallback(
    async (topic: string, count: number) => {
      const key = loadKeys()[sessionRef.current.providerId];
      if (!key) {
        setError({ message: "Add an API key before generating a quiz." });
        return;
      }
      setQuizBusy(true);
      setError(null);
      try {
        const { questions, usage } = await generateQuiz({
          providerId: sessionRef.current.providerId,
          model: sessionRef.current.model,
          apiKey: key,
          materials: selectedMaterials,
          chunks,
          topic,
          count,
        });
        const cost =
          estimateCost(
            sessionRef.current.providerId,
            sessionRef.current.model,
            usage.inputTokens,
            usage.outputTokens,
          ) ?? 0;
        setSession((prev) => ({
          ...prev,
          quiz: {
            id: `quiz_${Date.now().toString(36)}`,
            title: topic || "Practice",
            createdAt: Date.now(),
            questions,
            activeIndex: 0,
            finished: false,
          },
          usage: {
            inputTokens: prev.usage.inputTokens + usage.inputTokens,
            outputTokens: prev.usage.outputTokens + usage.outputTokens,
            costUsd: prev.usage.costUsd + cost,
            turns: prev.usage.turns,
          },
          updatedAt: Date.now(),
        }));
      } catch (caught) {
        setError({ message: (caught as Error).message });
      } finally {
        setQuizBusy(false);
      }
    },
    [chunks, selectedMaterials],
  );

  const answerQuiz = useCallback((questionId: string, response: string) => {
    setSession((prev) => {
      if (!prev.quiz) return prev;
      const questions = prev.quiz.questions.map((q) =>
        q.id === questionId ? { ...q, response, correct: checkAnswer(q, response) } : q,
      );
      const answered = questions.filter((q) => q.response !== undefined).length;
      return {
        ...prev,
        quiz: {
          ...prev.quiz,
          questions,
          activeIndex: Math.min(answered, questions.length - 1),
          finished: answered === questions.length,
        },
        updatedAt: Date.now(),
      };
    });
  }, []);

  const reviewQuestion = useCallback(
    (question: QuizQuestion) => {
      void runTurn(
        buildQuizReviewMessage(question.prompt, question.response ?? "", question.answer),
      );
    },
    [runTurn],
  );

  const closeQuiz = useCallback(() => {
    setSession((prev) => ({ ...prev, quiz: undefined }));
  }, []);

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
    selectedMaterials,
    materialName,
    status,
    error,
    dismissError: () => setError(null),
    notice,
    dismissNotice: () => setNotice(null),
    upload,
    quizBusy,
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
    makeQuiz,
    answerQuiz,
    reviewQuestion,
    closeQuiz,
    toggleBoardTheme,
    wipeBoard,
  };
}
