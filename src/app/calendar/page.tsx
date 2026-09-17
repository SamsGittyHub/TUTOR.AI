"use client";

import { useMemo, useState } from "react";

import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { SyllabusImport } from "@/components/app/SyllabusImport";
import { EVENT_KINDS, type EventKind } from "@/lib/calendar";
import { useCalendar } from "@/lib/useCalendar";
import { useLibrary } from "@/lib/useLibrary";

const KIND_STYLE: Record<EventKind, string> = {
  exam: "border-pink/50 text-pink",
  assignment: "border-warn/50 text-warn",
  class: "border-cyan/50 text-cyan",
  reading: "border-line-2 text-muted",
  other: "border-line-2 text-muted",
};

function dayLabel(ms: number): string {
  const days = Math.ceil((ms - Date.now()) / 864e5);
  if (days < 0) return "past";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export default function CalendarPage() {
  const cal = useCalendar();
  const lib = useLibrary();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<EventKind>("exam");
  const [courseId, setCourseId] = useState("");
  const [topics, setTopics] = useState("");
  const [busy, setBusy] = useState(false);
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [minutesPerDay, setMinutesPerDay] = useState(90);

  const upcoming = useMemo(
    () => cal.events.filter((e) => e.startsAt >= Date.now() - 864e5),
    [cal.events],
  );

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !date || busy) return;
    setBusy(true);
    try {
      await cal.addEvent({
        title: title.trim(),
        kind,
        // A date input has no time; 9am local reads better than midnight UTC.
        startsAt: new Date(`${date}T09:00`).getTime(),
        allDay: true,
        courseId: courseId || undefined,
        topics: topics
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setTitle("");
      setDate("");
      setTopics("");
    } finally {
      setBusy(false);
    }
  }

  async function plan(eventId: string) {
    setPlanFor(eventId);
    try {
      await cal.generatePlan(eventId, minutesPerDay);
    } finally {
      setPlanFor(null);
    }
  }

  return (
    <PageShell
      title="Calendar"
      lede="Put your exams and deadlines in, and Chalk works backwards into a study plan — every topic twice, then a full review the day before."
      wide
    >
      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-2 rounded-sm border border-line bg-panel px-4 py-3.5"
      >
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-dim">
            What
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Orgo midterm 2"
            className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none placeholder:text-dim focus:border-line-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-dim">
            When
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none focus:border-line-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-dim">
            Kind
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EventKind)}
            className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none focus:border-line-2"
          >
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {lib.courses.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-dim">
              Course
            </span>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none focus:border-line-2"
            >
              <option value="">none</option>
              {lib.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-dim">
            Topics it covers
          </span>
          <input
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder="alkenes, alkynes, aromatics"
            className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none placeholder:text-dim focus:border-line-2"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !title.trim() || !date}
          className="rounded-full grad px-4 py-2 text-[13px] font-extrabold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </form>

      <div className="mt-3">
        <SyllabusImport
          materials={lib.materials}
          courses={lib.courses}
          onImport={async (events, importCourseId) => {
            for (const event of events) {
              await cal.addEvent({
                title: event.title,
                kind: event.kind,
                startsAt: new Date(`${event.date}T09:00`).getTime(),
                allDay: true,
                courseId: importCourseId ?? undefined,
                topics: event.topics,
                source: "syllabus",
              });
            }
          }}
        />
      </div>

      <div className="mt-6">
        {cal.loading ? (
          <Loading what="your calendar" />
        ) : cal.error ? (
          <LoadError message={cal.error} />
        ) : !upcoming.length ? (
          <Empty title="Nothing on the calendar">
            Add an exam above — with the topics it covers — and Chalk will build
            the study plan around it.
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((event) => {
              const blocks = cal.blocks
                .filter((b) => b.eventId === event.id)
                .sort((a, b) => a.startsAt - b.startsAt);
              const done = blocks.filter((b) => b.status === "done").length;
              const course = lib.courses.find((c) => c.id === event.courseId);
              return (
                <li key={event.id} className="rounded-sm border border-line bg-panel">
                  <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider ${KIND_STYLE[event.kind]}`}
                    >
                      {event.kind}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-extrabold text-fg">
                        {event.title}
                      </p>
                      <p className="mt-0.5 text-[11.5px] font-bold uppercase tracking-wider text-dim">
                        {fmt(event.startsAt)} · {dayLabel(event.startsAt)}
                        {course ? ` · ${course.name}` : ""}
                        {blocks.length ? ` · ${done}/${blocks.length} sittings done` : ""}
                      </p>
                      {event.topics.length > 0 && (
                        <p className="mt-1.5 text-[12.5px] text-muted">
                          {event.topics.join(" · ")}
                        </p>
                      )}
                    </div>
                    {event.kind === "exam" && (
                      <button
                        type="button"
                        onClick={() => plan(event.id)}
                        disabled={planFor === event.id}
                        className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-muted transition hover:text-fg disabled:opacity-50"
                      >
                        {planFor === event.id
                          ? "Planning…"
                          : blocks.length
                            ? "Re-plan"
                            : "Build study plan"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => cal.removeEvent(event.id)}
                      className="shrink-0 rounded-full border border-line px-2.5 py-1.5 text-[11.5px] font-bold text-dim transition hover:border-pink/50 hover:text-pink"
                    >
                      Delete
                    </button>
                  </div>

                  {blocks.length > 0 && (
                    <ol className="border-t border-line px-4 py-3">
                      {blocks.map((block) => (
                        <li
                          key={block.id}
                          className="flex items-center gap-3 py-1.5"
                        >
                          <input
                            type="checkbox"
                            checked={block.status === "done"}
                            onChange={(e) =>
                              cal.setStatus(
                                block.id,
                                e.target.checked ? "done" : "planned",
                              )
                            }
                            aria-label={`Mark "${block.title}" done`}
                            className="h-4 w-4 shrink-0 accent-[var(--color-cyan)]"
                          />
                          <span
                            className={`flex-1 truncate text-[13px] ${
                              block.status === "done"
                                ? "text-dim line-through"
                                : "text-fg"
                            }`}
                          >
                            {block.title}
                          </span>
                          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-dim">
                            {fmt(block.startsAt)} · {block.minutes}m
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <label className="mt-6 flex items-center gap-3 text-[12.5px] text-muted">
          <span className="font-bold">Minutes a day for studying</span>
          <input
            type="range"
            min={30}
            max={240}
            step={15}
            value={minutesPerDay}
            onChange={(e) => setMinutesPerDay(Number(e.target.value))}
            className="w-48 accent-[var(--color-cyan)]"
          />
          <span className="font-mono text-[12px] text-fg">{minutesPerDay}m</span>
        </label>
      </div>
    </PageShell>
  );
}
