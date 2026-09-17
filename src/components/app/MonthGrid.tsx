"use client";

import { useMemo, useState } from "react";

import type { CalendarEvent, EventKind, StudyBlock } from "@/lib/calendar";

/**
 * A month, as a month.
 *
 * The calendar page was a form and a list — useful, but a list can't answer
 * "how much runway do I have before the 14th", which is the only question a
 * student actually opens a calendar to ask. Seeing the gap is the feature.
 *
 * Weeks start on Monday: the weekend belongs at the end, because for a student
 * that's when the revision happens.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_DOT: Record<EventKind, string> = {
  exam: "bg-pink",
  assignment: "bg-warn",
  class: "bg-cyan",
  reading: "bg-[var(--color-accent)]",
  other: "bg-dim",
};

const KIND_CHIP: Record<EventKind, string> = {
  exam: "bg-pink/12 text-pink",
  assignment: "bg-warn/15 text-warn",
  class: "bg-cyan/12 text-cyan",
  reading: "bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]",
  other: "bg-[var(--tint)] text-muted",
};

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Monday-first offset for a given month's first day. */
function leadingBlanks(year: number, month: number): number {
  const weekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  return (weekday + 6) % 7;
}

interface Props {
  events: CalendarEvent[];
  blocks: StudyBlock[];
  onSelectDay: (ms: number | null) => void;
  selectedDay: number | null;
}

export function MonthGrid({ events, blocks, onSelectDay, selectedDay }: Props) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const blanks = leadingBlanks(year, month);

  const byDay = useMemo(() => {
    const map = new Map<string, { events: CalendarEvent[]; blocks: StudyBlock[] }>();
    const slot = (ms: number) => {
      const key = dayKey(ms);
      if (!map.has(key)) map.set(key, { events: [], blocks: [] });
      return map.get(key)!;
    };
    for (const event of events) slot(event.startsAt).events.push(event);
    for (const block of blocks) slot(block.startsAt).blocks.push(block);
    return map;
  }, [events, blocks]);

  // A trailing row of blanks keeps the grid rectangular rather than ragged.
  const cells = blanks + daysInMonth;
  const trailing = (7 - (cells % 7)) % 7;

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function shift(by: number) {
    setCursor(new Date(year, month + by, 1));
    onSelectDay(null);
  }

  return (
    <div className="surface rounded-md p-3 sm:p-4">
      <header className="mb-3 flex items-center gap-2">
        <h2 className="mr-auto text-[15px] font-semibold text-fg">{monthLabel}</h2>
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="tx press flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-[var(--tint)] hover:text-fg"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => {
            setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
            onSelectDay(null);
          }}
          className="tx press rounded-full px-2.5 py-1 text-[12px] font-medium text-muted hover:bg-[var(--tint)] hover:text-fg"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="tx press flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-[var(--tint)] hover:text-fg"
        >
          ›
        </button>
      </header>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-dim"
          >
            {day}
          </div>
        ))}

        {Array.from({ length: blanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = new Date(year, month, i + 1);
          const ms = date.getTime();
          const key = dayKey(ms);
          const cell = byDay.get(key);
          const isToday = dayKey(today.getTime()) === key;
          const isSelected = selectedDay !== null && dayKey(selectedDay) === key;
          const past = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : ms)}
              aria-pressed={isSelected}
              aria-label={`${date.toDateString()}${
                cell ? `, ${cell.events.length} events, ${cell.blocks.length} study blocks` : ""
              }`}
              className={`tx relative flex min-h-[72px] flex-col items-start gap-1 rounded-sm p-1.5 text-left ${
                isSelected
                  ? "bg-[var(--tint-strong)] shadow-[inset_0_0_0_1px_var(--color-accent)]"
                  : "hover:bg-[var(--tint)]"
              } ${past && !isToday ? "opacity-55" : ""}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[12px] ${
                  isToday
                    ? "grad font-semibold text-white"
                    : "font-medium text-muted"
                }`}
              >
                {i + 1}
              </span>

              {cell?.events.slice(0, 2).map((event) => (
                <span
                  key={event.id}
                  className={`w-full truncate rounded-[4px] px-1 py-[1px] text-[10.5px] font-medium ${KIND_CHIP[event.kind]}`}
                >
                  {event.title}
                </span>
              ))}

              {cell && cell.events.length > 2 && (
                <span className="px-1 text-[10px] text-dim">
                  +{cell.events.length - 2} more
                </span>
              )}

              {/* Study sittings are dots, not chips: there can be several a day
                  and naming each one would bury the exam they're leading to. */}
              {cell?.blocks.length ? (
                <span className="mt-auto flex flex-wrap gap-[3px] px-1">
                  {cell.blocks.slice(0, 4).map((block) => (
                    <span
                      key={block.id}
                      title={block.title}
                      className={`h-1.5 w-1.5 rounded-full ${
                        block.status === "done"
                          ? "bg-good"
                          : "bg-[var(--color-line-2)]"
                      }`}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}

        {Array.from({ length: trailing }, (_, i) => (
          <div key={`trail-${i}`} />
        ))}
      </div>

      <footer className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-2.5">
        {(Object.keys(KIND_DOT) as EventKind[]).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5 text-[11.5px] text-dim">
            <span className={`h-2 w-2 rounded-full ${KIND_DOT[kind]}`} />
            {kind}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11.5px] text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-line-2)]" />
          study sitting
        </span>
      </footer>
    </div>
  );
}
