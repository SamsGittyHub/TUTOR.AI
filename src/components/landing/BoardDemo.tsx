"use client";

import { useEffect, useState } from "react";
import type { BoardAction, TutorAction } from "@/lib/actions";
import { BoardCard } from "@/components/board/BoardCard";

/**
 * The landing page runs the real board renderer against a scripted lesson —
 * same components, same handwriting, same stroke animations the app uses. If
 * the demo drifts from the product, the product broke.
 */
const SCRIPT: { say?: string; action?: TutorAction; delay: number }[] = [
  { say: "Okay — integration by parts. It's just the product rule, run backwards.", delay: 900 },
  {
    action: {
      id: "d1",
      type: "write_text",
      text: "Integration by parts",
      style: "title",
      color: "ink",
    },
    delay: 1100,
  },
  {
    action: {
      id: "d2",
      type: "write_equation",
      latex: "\\int u\\,dv = uv - \\int v\\,du",
      label: "the whole thing, in one line",
      color: "cyan",
    },
    delay: 1500,
  },
  { say: "Watch what happens when we pick u and dv for ∫x·eˣ dx.", delay: 1200 },
  {
    action: {
      id: "d3",
      type: "write_steps",
      title: "∫ x·eˣ dx",
      color: "ink",
      steps: [
        { text: "Choose u and dv", latex: "u = x, \\quad dv = e^x dx", note: "pick u so that du gets simpler" },
        { text: "Differentiate and integrate", latex: "du = dx, \\quad v = e^x" },
        { text: "Substitute into the formula", latex: "x e^x - \\int e^x dx" },
        { text: "Finish", latex: "x e^x - e^x + C" },
      ],
      sourceRefs: [{ materialId: "m1", locator: "page 214" }],
    },
    delay: 2600,
  },
  {
    action: {
      id: "d4",
      type: "highlight",
      targetId: "d3",
      note: "this is the swap that makes the integral easier",
    },
    delay: 1400,
  },
  {
    action: {
      id: "d5",
      type: "ask_question",
      question: "For ∫x·ln(x) dx, what should u be?",
      choices: ["x", "ln(x)"],
      answer: "ln(x)",
    },
    delay: 2000,
  },
];

export function BoardDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setTimeout(
      () => setStep((current) => (current + 1) % (SCRIPT.length + 3)),
      SCRIPT[step]?.delay ?? 1800,
    );
    return () => clearTimeout(timer);
  }, [step]);

  const shown = SCRIPT.slice(0, step + 1);
  const highlights = new Map<string, string>();
  for (const item of shown) {
    if (item.action?.type === "highlight") {
      highlights.set(item.action.targetId, item.action.note ?? "");
    }
  }
  const cards = shown
    .map((item) => item.action)
    .filter((action): action is BoardAction =>
      Boolean(action && action.type !== "highlight"),
    );
  const says = shown.map((item) => item.say).filter(Boolean) as string[];

  return (
    <div className="grid overflow-hidden rounded-xl border border-line bg-panel shadow-[0_30px_80px_-40px_rgba(6,178,252,.4)] lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="min-w-0">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="flex gap-1.5">
            {["#f653a2", "#ffc861", "#06b2fc"].map((color) => (
              <span key={color} className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            ))}
          </span>
          <span className="ml-2 text-[11.5px] font-bold text-dim">
            Calculus II — lecture 9.pdf
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-pink">
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-current" />
            teaching
          </span>
        </div>

        <div className="board-surface relative h-[430px] overflow-hidden px-4 py-5 sm:px-8">
          {/* The lesson keeps going past the fold — fade it out rather than
              slicing a card in half. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-b from-transparent to-board"
          />
          <div className="space-y-3">
            {cards.map((action) => (
              <BoardCard
                key={action.id}
                action={action}
                theme="paper"
                highlighted={highlights.get(action.id)}
                onAnswer={() => undefined}
                materialName={() => "Calculus II — lecture 9.pdf"}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="hidden flex-col border-l border-line lg:flex">
        <div className="border-b border-line px-4 py-2.5 text-[11.5px] font-extrabold text-dim">
          Ask anything
        </div>
        <div className="flex-1 space-y-3 overflow-hidden p-4">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-lg rounded-br-xs grad px-3 py-2 text-[12.5px] font-semibold text-white">
              teach me integration by parts
            </p>
          </div>
          {says.map((text, index) => (
            <div key={index} className="flex gap-2">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full grad" />
              <p className="text-[12.5px] leading-relaxed text-fg/85">{text}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-3">
          <div className="grad-border flex items-center gap-2 rounded-md bg-panel-2 px-3 py-2">
            <span className="caret text-[12.5px] text-dim">wait, where did that 2 come from</span>
          </div>
        </div>
      </div>
    </div>
  );
}
