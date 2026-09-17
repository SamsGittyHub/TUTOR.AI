"use client";

import { useEffect, useRef, useState } from "react";

import type { TutorAction } from "@/lib/actions";
import { isBoardAction, type BoardAction } from "@/lib/actions";
import { exportBoard, FORMAT_LABEL, type BoardFormat } from "@/lib/board-export";
import { BoardCard } from "./BoardCard";

/**
 * Export a lesson's board as a picture, a PDF, or a Word document.
 *
 * The board being exported is rendered off-screen at a fixed width rather than
 * captured from whatever is on screen: the live board is a scrolling column
 * whose height is the viewport, so capturing it would produce a screenshot of
 * the visible part. This renders every card at full height, once, and throws
 * it away afterwards.
 *
 * Off-screen means positioned off-screen, not `display: none` — a hidden
 * element has no layout, and every card would rasterise at zero height.
 */

const FORMATS: BoardFormat[] = ["pdf", "docx", "png", "jpeg"];

interface Props {
  actions: TutorAction[];
  title: string;
  date?: number;
  materialName?: (id: string) => string;
  /** Rendered inside the trigger button. */
  label?: string;
  size?: "sm" | "md";
}

export function BoardExport({
  actions,
  title,
  date,
  materialName,
  label = "Export",
  size = "sm",
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<BoardFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Cards the tutor erased must not reach any format. boardToBlocks already
  // drops them for the Word path; without the same filter here the picture and
  // the PDF would ship a mistake the student watched get wiped off the board.
  const erased = new Set(
    actions.filter((a) => a.type === "erase").map((a) => a.targetId),
  );
  const cards = actions.filter(
    (a): a is BoardAction => isBoardAction(a) && !erased.has(a.id),
  );
  const empty = cards.length === 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(format: BoardFormat) {
    if (busy) return;
    setBusy(format);
    setError(null);
    setStaged(true);
    try {
      // Let the staged board lay out (and KaTeX typeset) before capturing.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 260)));
      const node = stageRef.current;
      if (!node) throw new Error("Nothing to export.");
      await exportBoard({ format, actions, node, title, date, materialName });
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Couldn't build that file.",
      );
    } finally {
      setBusy(null);
      setStaged(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      {/*
        Bordered and captioned on purpose. This used to be bare grey text at
        40% opacity between two icon buttons, which on a board with nothing on
        it yet read as no button at all — and a fresh board is exactly where a
        student first looks for it. It stays legible while there is nothing to
        export; the tooltip says why it won't do anything.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={empty}
        title={empty ? "Nothing on the board to export yet" : "Save this board as a PDF, Word file, image or notes"}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`tx press inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold disabled:pointer-events-none disabled:opacity-60 ${
          size === "sm" ? "h-8 px-3 text-[12px]" : "h-9 px-4 text-[13px]"
        } ${
          open
            ? "border-transparent bg-[var(--tint-strong)] text-fg"
            : "border-line text-muted hover:border-line-2 hover:bg-[var(--tint)] hover:text-fg"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="surface-2 raised pop-in absolute right-0 top-9 z-50 w-52 overflow-hidden rounded-md p-1"
          style={{ ["--origin" as string]: "top right" }}
        >
          {FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              disabled={busy !== null}
              onClick={() => run(format)}
              className="tx flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-[13px] font-medium text-muted hover:bg-[var(--tint)] hover:text-fg disabled:opacity-50"
            >
              {FORMAT_LABEL[format]}
              {busy === format && <span className="text-[11px] text-dim">working…</span>}
            </button>
          ))}
          {error && (
            <p role="alert" className="px-3 py-2 text-[11.5px] font-medium text-pink">
              {error}
            </p>
          )}
        </div>
      )}

      {/* The thing actually being captured. Off-screen, never display:none. */}
      {staged && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 -z-50 opacity-0"
          style={{ transform: "translateX(-200vw)" }}
        >
          <div
            ref={stageRef}
            data-theme="paper"
            className="board-surface flex w-[900px] flex-col gap-5 p-10"
          >
            {cards.map((action) => (
              <BoardCard
                key={action.id}
                action={action}
                theme="paper"
                onAnswer={() => {}}
                materialName={materialName ?? (() => "material")}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
