"use client";

import { useState } from "react";

import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { createCourse, deleteCourse } from "@/lib/db";
import { masteryForMaterial, masteryLabel } from "@/lib/progress";
import { useLibrary } from "@/lib/useLibrary";

const COLORS = ["cyan", "pink", "amber", "green", "violet"] as const;

const SWATCH: Record<string, string> = {
  cyan: "bg-cyan",
  pink: "bg-pink",
  amber: "bg-warn",
  green: "bg-good",
  violet: "bg-[#8b5cf6]",
};

export default function CoursesPage() {
  const lib = useLibrary();
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [color, setColor] = useState<string>("cyan");
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createCourse(name.trim(), term.trim() || undefined, color);
      setName("");
      setTerm("");
      lib.reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Delete "${label}"? Its material stays, just ungrouped.`)) return;
    await deleteCourse(id);
    lib.reload();
  }

  return (
    <PageShell
      title="Courses"
      lede="Group material by class so finals week is one page per subject instead of thirty loose files."
    >
      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-2 surface rounded-md px-4 py-3.5"
      >
        <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
            Course
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organic Chemistry II"
            className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none transition placeholder:text-dim focus:border-line-2"
          />
        </label>
        <label className="flex w-32 flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
            Term
          </span>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Fall 2026"
            className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none transition placeholder:text-dim focus:border-line-2"
          />
        </label>
        <div className="flex items-center gap-1.5 pb-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-full ${SWATCH[c]} transition ${
                color === c ? "ring-2 ring-fg ring-offset-2 ring-offset-panel" : "opacity-60"
              }`}
            />
          ))}
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-full grad px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add course"}
        </button>
      </form>

      <div className="mt-6">
        {lib.loading ? (
          <Loading what="your courses" />
        ) : lib.error ? (
          <LoadError message={lib.error} />
        ) : !lib.courses.length ? (
          <Empty title="No courses yet">
            Add one above, then assign material to it. Mastery and the study
            plan both roll up per course.
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {lib.courses.map((course) => {
              const materials = lib.materials.filter((m) => m.courseId === course.id);
              const rollups = materials.map((m) =>
                masteryForMaterial(m.id, lib.attempts, lib.cards, now),
              );
              const avg = rollups.length
                ? Math.round(rollups.reduce((s, r) => s + r.mastery, 0) / rollups.length)
                : 0;
              return (
                <li
                  key={course.id}
                  className="surface rounded-md px-4 py-3.5"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 h-3 w-3 shrink-0 rounded-full ${SWATCH[course.color] ?? SWATCH.cyan}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-fg">
                        {course.name}
                      </p>
                      <p className="mt-0.5 text-[12px] text-dim">
                        {course.term ?? "no term"} · {materials.length} files ·{" "}
                        {masteryLabel(avg, rollups.length > 0)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(course.id, course.name)}
                      className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-dim transition hover:border-pink/50 hover:text-pink"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
