"use client";

import Link from "next/link";
import { useState } from "react";

import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { deleteSession } from "@/lib/db";
import { exportFilename, lessonToMarkdown } from "@/lib/export";
import { useLibrary } from "@/lib/useLibrary";

function when(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SessionsPage() {
  const lib = useLibrary();
  const [busy, setBusy] = useState<string | null>(null);

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
      title="Lessons"
      lede="Every lesson you've taught yourself, board and all. Open one to pick it up exactly where it stopped."
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
        <ul className="flex flex-col gap-2">
          {lib.sessions.map((s) => {
            const names = s.materialIds
              .map((id) => lib.materials.find((m) => m.id === id)?.name)
              .filter(Boolean);
            const boardCards = s.actions.length;
            return (
              <li
                key={s.id}
                className="flex items-start gap-4 surface rounded-md px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app?session=${encodeURIComponent(s.id)}`}
                    className="truncate text-[14px] font-semibold text-fg transition hover:text-cyan"
                  >
                    {s.title}
                  </Link>
                  <p className="mt-0.5 text-[12px] text-dim">
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
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportLesson(s.id)}
                    disabled={!s.actions.length}
                    title="Download as Markdown notes"
                    className="rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-dim transition hover:text-fg disabled:opacity-40"
                  >
                    Export
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
      )}
    </PageShell>
  );
}
