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
  /**
   * Which side the panel is pinned to. A left panel's width grows as the
   * pointer moves right; a right panel's grows as it moves left.
   */
  anchor?: "left" | "right";
  /**
   * Turns the divider into a collapse control as well as a drag handle. The
   * chevron lives here because this is already the boundary the panel owns —
   * a button anywhere else is a thing to hunt for.
   */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Named for the button's tooltip, e.g. "material panel". */
  collapseLabel?: string;
  /** Overrides the tooltip entirely, when "Hide the X" isn't what happens. */
  collapseTitle?: string;
}

export function Resizer({
  width,
  onChange,
  min,
  max,
  defaultWidth,
  label,
  anchor = "right",
  collapsed = false,
  onToggleCollapse,
  collapseLabel,
  collapseTitle,
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
    const next = clamp(
      anchor === "right"
        ? window.innerWidth - event.clientX - 8
        : event.clientX - 8,
    );
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
    // Arrow keys move the divider, so which arrow grows the panel depends on
    // which side it's pinned to.
    const grow = anchor === "right" ? "ArrowLeft" : "ArrowRight";
    const shrink = anchor === "right" ? "ArrowRight" : "ArrowLeft";
    const moves: Record<string, number> = {
      [grow]: width + step,
      [shrink]: width - step,
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
      title={collapsed ? undefined : "Drag to resize — double-click to reset"}
      className={`group relative hidden touch-none items-stretch justify-center lg:flex ${
        collapsed ? "cursor-default" : "cursor-col-resize"
      }`}
    >
      {/* The grab target is wider than the line it draws, or this is a
          pixel-hunt every time. A collapsed panel has nothing to drag, so the
          wide target would just be dead space that swallows clicks. */}
      {collapsed ? null : (
        <span className="absolute inset-y-0 -left-2 -right-2 z-0" aria-hidden />
      )}
      <span
        aria-hidden
        className={`tx my-4 w-[3px] rounded-full ${
          collapsed
            ? "bg-transparent"
            : dragging
              ? "bg-[var(--color-accent)]"
              : "bg-[var(--hairline)] group-hover:bg-[var(--color-line-2)] group-focus-visible:bg-[var(--color-accent)]"
        }`}
      />

      {onToggleCollapse ? (
        <button
          type="button"
          // The divider is a separator for assistive tech; the button inside
          // it is the actual control, so the press must not also start a drag.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse();
          }}
          title={collapseTitle ?? `${collapsed ? "Show" : "Hide"} the ${collapseLabel ?? "panel"}`}
          aria-label={
            collapseTitle ?? `${collapsed ? "Show" : "Hide"} the ${collapseLabel ?? "panel"}`
          }
          aria-expanded={!collapsed}
          className="tx press absolute left-1/2 top-1/2 z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel text-muted opacity-0 shadow-sm transition hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 data-[shown=true]:opacity-100"
          data-shown={collapsed}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d={
                (anchor === "left") === !collapsed
                  ? "M15 6l-6 6 6 6"
                  : "M9 6l6 6-6 6"
              }
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
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

/**
 * Remembers a panel's open/closed state across reloads.
 *
 * Same shape and same reasoning as useStoredWidth: read in an effect, because
 * the server can't know what this browser last chose and rendering it during
 * the first pass would mean a hydration mismatch.
 */
export function useStoredFlag(
  key: string,
  fallback: boolean,
): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    const raw = readStored(localStorage, key);
    if (raw === "1" || raw === "0") setValue(raw === "1");
  }, [key]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Private mode: the choice just won't persist.
      }
    },
    [key],
  );

  return [value, update];
}
