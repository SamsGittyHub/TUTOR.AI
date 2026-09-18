"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { useMemo, useState } from "react";

import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { deleteSession, setSessionCourse } from "@/lib/db";
import { exportFilename, lessonToMarkdown } from "@/lib/export";
import { BoardExport } from "@/components/board/BoardExport";
import { ShareLesson } from "@/components/board/ShareLesson";
import { useLibrary } from "@/lib/useLibrary";

function when(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SWATCH: Record<string, string> = {
  cyan: "bg-cyan",
  pink: "bg-pink",
  amber: "bg-warn",
  green: "bg-good",
  violet: "bg-[#8b5cf6]",
};

export default function SessionsPage() {
  const lib = useLibrary();
  const language = useLanguage();
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Lessons under their subject, unfiled ones last.
   *
   * A flat list of thirty lessons across five classes is unusable by week six,
   * which is the whole reason subjects exist.
   */
  const groups = useMemo(() => {
    const out = lib.courses
      .map((course) => ({
        id: course.id as string | null,
        name: course.name,
        color: course.color as string | undefined,
        sessions: lib.sessions.filter((s) => s.courseId === course.id),
      }))
      .filter((g) => g.sessions.length > 0);

    const loose = lib.sessions.filter(
      (s) => !s.courseId || !lib.courses.some((c) => c.id === s.courseId),
    );
    if (loose.length) {
      out.push({ id: null, name: "Not filed", color: undefined, sessions: loose });
    }
    return out;
  }, [lib.courses, lib.sessions]);

  /** Notes the student keeps — the board is otherwise gone when the tab closes. */
  function exportLesson(sessionId: string) {
    const session = lib.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const markdown = lessonToMarkdown(session.actions, {
      title: session.title,
      date: session.createdAt,
      materialName: (id) =>
        lib.materials.find((m) => m.id === id)?.name ?? "material",
    });
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFilename(session.title);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete the lesson "${title}"? The board goes with it.`)) return;
    setBusy(id);
    try {
      await deleteSession(id);
      lib.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell
      title={language.t("lessons.title")}
      lede={language.t("lessons.lede")}
    >
      {lib.loading ? (
        <Loading what="your lessons" />
      ) : lib.error ? (
        <LoadError message={lib.error} />
      ) : !lib.sessions.length ? (
        <Empty title="No lessons yet" action={{ href: "/app", label: "Start a lesson" }}>
          Ask the tutor to teach you something and it'll show up here, resumable
          from any device you sign in on.
        </Empty>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.id ?? "none"}>
              <h2 className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wider text-dim">
                {group.color && (
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${SWATCH[group.color] ?? SWATCH.cyan}`}
                  />
                )}
                {group.name}
                <span className="font-normal normal-case tracking-normal">
                  {group.sessions.length} lesson
                  {group.sessions.length === 1 ? "" : "s"}
                </span>
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {group.sessions.map((s) => {
            const names = s.materialIds
              .map((id) => lib.materials.find((m) => m.id === id)?.name)
              .filter(Boolean);
            const boardCards = s.actions.length;
            return (
              <li
                key={s.id}
                // Stacks on a phone. Five controls and a title never fit on one
                // 390px row, and when they tried, the actions landed on top of
                // the title and the lesson became untappable.
                className="flex flex-col items-stretch gap-3 surface rounded-md px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  {/* A spoken lesson reopens where it was taught. Dropping
                      someone onto the typed board hands them a lesson they
                      don't recognise as the one they had. */}
                  <Link
                    href={`${s.mode === "voice" ? "/voice" : "/app"}?session=${encodeURIComponent(s.id)}`}
                    // block, or `truncate` does nothing: an inline anchor
                    // reports its full text width and overflows the min-w-0
                    // parent that's supposed to be containing it.
                    className="block truncate text-[14px] font-semibold text-fg transition hover:text-cyan"
                  >
                    {s.title}
                  </Link>
                  <p className="mt-0.5 text-[12px] text-dim">
                    {s.mode === "voice" ? "spoken · " : ""}
                    {when(s.updatedAt)}
                    {boardCards ? ` · ${boardCards} board cards` : ""}
                    {s.plan ? ` · step ${s.plan.currentIndex + 1}/${s.plan.steps.length}` : ""}
                    {s.usage?.costUsd ? ` · $${s.usage.costUsd.toFixed(3)}` : ""}
                  </p>
                  {names.length > 0 && (
                    <p className="mt-1.5 truncate text-[12.5px] text-muted">
                      {names.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {lib.courses.length > 0 && (
                    <select
                      value={s.courseId ?? ""}
                      aria-label={`Subject for ${s.title}`}
                      onChange={async (e) => {
                        await setSessionCourse(s.id, e.target.value || null);
                        lib.reload();
                      }}
                      className="tx h-7 rounded-full bg-[var(--tint)] px-2.5 text-[11.5px] font-medium text-muted shadow-[inset_0_0_0_0.5px_var(--hairline)] outline-none hover:text-fg"
                    >
                      <option value="">No subject</option>
                      {lib.courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <ShareLesson lessonId={s.id} />
                  <BoardExport
                    actions={s.actions}
                    title={s.title}
                    date={s.createdAt}
                    materialName={(id) =>
                      lib.materials.find((m) => m.id === id)?.name ?? "material"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => exportLesson(s.id)}
                    disabled={!s.actions.length}
                    title="Download as Markdown notes"
                    className="tx press inline-flex h-7 items-center rounded-full px-3 text-[11.5px] font-medium text-muted hover:bg-[var(--tint)] hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.id, s.title)}
                    disabled={busy === s.id}
                    className="rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-dim transition hover:border-pink/50 hover:text-pink disabled:opacity-50"
                  >
                    {busy === s.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
