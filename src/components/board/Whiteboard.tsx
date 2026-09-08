"use client";

import { useEffect, useMemo, useRef } from "react";
import { isBoardAction, type TutorAction } from "@/lib/actions";
import type { LessonPlanState } from "@/lib/db";
import { BoardCard } from "./BoardCard";
import type { BoardTheme } from "./ink";

interface Props {
  actions: TutorAction[];
  theme: BoardTheme;
  plan?: LessonPlanState;
  status: "idle" | "thinking" | "teaching" | "error";
  onAnswer: (question: string, answer: string) => void;
  onToggleTheme: () => void;
  onClear: () => void;
  materialName: (id: string) => string;
  emptyState: React.ReactNode;
}

export function Whiteboard({
  actions,
  theme,
  plan,
  status,
  onAnswer,
  onToggleTheme,
  onClear,
  materialName,
  emptyState,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  const visible = useMemo(() => {
    const erased = new Set(
      actions.filter((a) => a.type === "erase").map((a) => a.targetId),
    );
    const highlights = new Map<string, string>();
    for (const action of actions) {
      if (action.type === "highlight") {
        highlights.set(action.targetId, action.note ?? "look here");
      }
    }
    return actions
      .filter(isBoardAction)
      .filter((a) => !erased.has(a.id))
      .map((action) => ({ action, highlight: highlights.get(action.id) }));
  }, [actions]);

  // Follow the tutor down the board, but stop fighting a student who scrolled
  // up to re-read something.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !pinnedToBottom.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [visible.length, status]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinnedToBottom.current = distance < 140;
  };

  const paper = theme === "paper";

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-panel">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {plan ? (
            <>
              <span className="truncate text-sm font-extrabold">{plan.title}</span>
              <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                {plan.steps.map((step, index) => (
                  <span
                    key={index}
                    title={step}
                    className={`h-1.5 rounded-full transition-all ${
                      index < plan.currentIndex
                        ? "w-6 grad"
                        : index === plan.currentIndex
                          ? "w-9 grad"
                          : "w-6 bg-line-2"
                    }`}
                  />
                ))}
              </span>
              <span className="shrink-0 text-xs font-semibold text-dim">
                step {Math.min(plan.currentIndex + 1, plan.steps.length)}/{plan.steps.length}
              </span>
            </>
          ) : (
            <span className="text-sm font-bold text-dim">Whiteboard</span>
          )}
        </div>

        <StatusPill status={status} />

        <button
          type="button"
          onClick={onToggleTheme}
          title={paper ? "Switch to chalkboard" : "Switch to whiteboard"}
          className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted transition hover:border-line-2 hover:text-fg"
        >
          {paper ? "◑ chalk" : "◐ paper"}
        </button>
        {visible.length ? (
          <button
            type="button"
            onClick={onClear}
            title="Wipe the board (the lesson keeps going)"
            className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted transition hover:border-pink/50 hover:text-pink"
          >
            wipe
          </button>
        ) : null}
      </header>

      <div
        ref={scroller}
        onScroll={onScroll}
        data-theme={theme === "chalk" ? "chalk" : undefined}
        className="board-surface min-h-0 flex-1 overflow-y-auto"
      >
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">{emptyState}</div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 px-3 py-6 sm:px-6 sm:py-10">
            {visible.map(({ action, highlight }) => (
              <BoardCard
                key={action.id}
                action={action}
                theme={theme}
                highlighted={highlight}
                onAnswer={onAnswer}
                materialName={materialName}
              />
            ))}
            {status === "teaching" || status === "thinking" ? (
              <div className="flex items-center gap-2 px-5 pb-6">
                <span
                  className={`hand text-[19px] ${paper ? "text-black/35" : "text-white/35"}`}
                >
                  writing
                </span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="thinking-dot h-1.5 w-1.5 rounded-full bg-pink"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Props["status"] }) {
  if (status === "idle") return null;
  const map = {
    thinking: { text: "thinking", tone: "text-cyan" },
    teaching: { text: "teaching", tone: "text-pink" },
    error: { text: "stopped", tone: "text-warn" },
  } as const;
  const info = map[status as keyof typeof map];
  if (!info) return null;
  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-xs font-bold ${info.tone}`}>
      <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-current" />
      {info.text}
    </span>
  );
}
