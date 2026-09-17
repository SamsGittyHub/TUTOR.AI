"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readStored } from "@/lib/storage-keys";

/**
 * The drag handle between the board and the chat rail.
 *
 * How much room each deserves depends entirely on what the student is doing —
 * a long derivation wants the board, a back-and-forth about it wants the rail —
 * so it's their call, not a fixed 330px.
 *
 * Pointer events rather than mouse, so a stylus or a trackpad on a tablet
 * works. The pointer is captured for the duration of the drag, which is what
 * keeps it tracking when the cursor outruns the handle, and the whole document
 * gets a resize cursor so it doesn't flicker over whatever it passes.
 *
 * It's a real separator, not a decorative div: arrow keys move it, Home and End
 * jump to the limits, and double-click resets. Keyboard users resize windows
 * too.
 */

interface Props {
  /** Current width of the panel to the right, in px. */
  width: number;
  onChange: (width: number) => void;
  min: number;
  max: number;
  /** Width to snap back to on double-click. */
  defaultWidth: number;
  label: string;
}

export function Resizer({
  width,
  onChange,
  min,
  max,
  defaultWidth,
  label,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const frame = useRef<number | null>(null);

  const clamp = useCallback(
    (value: number) => Math.round(Math.min(max, Math.max(min, value))),
    [min, max],
  );

  // While dragging, the cursor and a no-select guard belong on the document:
  // without them the pointer flickers and text selects across the whole page.
  useEffect(() => {
    if (!dragging) return;
    const { style } = document.body;
    const prevCursor = style.cursor;
    const prevSelect = style.userSelect;
    style.cursor = "col-resize";
    style.userSelect = "none";
    return () => {
      style.cursor = prevCursor;
      style.userSelect = prevSelect;
    };
  }, [dragging]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    // The rail is right-anchored, so its width is the distance from the
    // pointer to the right edge of the window.
    const next = clamp(window.innerWidth - event.clientX - 8);
    // Coalesce to one update per frame: pointermove fires far faster than
    // React can usefully re-render a board full of KaTeX.
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => onChange(next));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 48 : 16;
    const moves: Record<string, number> = {
      ArrowLeft: width + step,
      ArrowRight: width - step,
      Home: max,
      End: min,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(clamp(next));
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onChange(defaultWidth)}
      onKeyDown={onKeyDown}
      title="Drag to resize — double-click to reset"
      className="group relative hidden cursor-col-resize touch-none items-stretch justify-center lg:flex"
    >
      {/* The grab target is wider than the line it draws, or this is a
          pixel-hunt every time. */}
      <span className="absolute inset-y-0 -left-2 -right-2" aria-hidden />
      <span
        aria-hidden
        className={`tx my-4 w-[3px] rounded-full ${
          dragging
            ? "bg-[var(--color-accent)]"
            : "bg-[var(--hairline)] group-hover:bg-[var(--color-line-2)] group-focus-visible:bg-[var(--color-accent)]"
        }`}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Remembers the width across reloads.
 *
 * Read in an effect rather than during render: the server has no idea what the
 * student picked, and using it on the first client render would mismatch the
 * markup it just sent.
 */
export function useStoredWidth(
  key: string,
  defaultWidth: number,
  min: number,
  max: number,
) {
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    const raw = readStored(localStorage, key);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      setWidth(parsed);
    }
  }, [key, min, max]);

  const update = useCallback(
    (next: number) => {
      setWidth(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Private mode: the width just won't persist.
      }
    },
    [key],
  );

  return [width, update] as const;
}
