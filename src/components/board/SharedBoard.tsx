"use client";

import { useState } from "react";

import { Whiteboard } from "./Whiteboard";
import type { TutorAction } from "@/lib/actions";

/**
 * A shared board, with everything interactive taken out.
 *
 * The same renderer the student saw, so a shared lesson looks like the lesson
 * rather than like a transcript of it. Answering a question on someone else's
 * board goes nowhere, so those inputs simply do nothing.
 */
export function SharedBoard({ actions }: { actions: TutorAction[] }) {
  const [theme, setTheme] = useState<"paper" | "chalk">("paper");

  return (
    <div className="h-[calc(100dvh-64px)]">
      <Whiteboard
        actions={actions}
        theme={theme}
        status="idle"
        onAnswer={() => {}}
        onToggleTheme={() => setTheme((t) => (t === "paper" ? "chalk" : "paper"))}
        onClear={() => {}}
        materialName={() => "material"}
        emptyState={
          <p className="hand text-[28px] text-[var(--board-ink)]">
            Nothing was left on this board.
          </p>
        }
      />
    </div>
  );
}
