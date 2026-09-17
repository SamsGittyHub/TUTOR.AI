"use client";

import { useRouter } from "next/navigation";
import { keyFor } from "@/lib/beta";
import { useEffect, useMemo, useState } from "react";

import { ExamPaper } from "@/components/exam/ExamPaper";
import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { getChunksFor } from "@/lib/db";
import type { ExamResponses, ExamResult, PracticeExam } from "@/lib/exam";
import { loadKeys } from "@/lib/keys";
import { loadSettings } from "@/lib/settings";
import { generateExam } from "@/lib/tutor/exam-gen";
import { useLibrary } from "@/lib/useLibrary";
import { findWeakPoints } from "@/lib/weakpoints";

const SIZES = [10, 20, 30, 40];

export default function PracticeExamPage() {
  const lib = useLibrary();
  const router = useRouter();

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(20);
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exam, setExam] = useState<PracticeExam | null>(null);
  const [responses, setResponses] = useState<ExamResponses>({});
  const [result, setResult] = useState<ExamResult | null>(null);

  const chosen = useMemo(
    () => lib.sessions.filter((s) => picked.has(s.id)),
    [lib.sessions, picked],
  );

  // Previewed live, so the student can see what the paper will target before
  // spending a model call on it.
  const preview = useMemo(
    () =>
      chosen.length
        ? findWeakPoints({
            sessions: chosen,
            cards: lib.cards,
            attempts: lib.attempts,
          }).slice(0, 6)
        : [],
    [chosen, lib.cards, lib.attempts],
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    if (!chosen.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const settings = loadSettings();
      const apiKey = keyFor(loadKeys()[settings.providerId]);
      if (!apiKey) throw new Error("Add an API key in Settings first.");

      const materialIds = [...new Set(chosen.flatMap((s) => s.materialIds))];
      const chunks = await getChunksFor(materialIds);

      const { exam: generated } = await generateExam({
        providerId: settings.providerId,
        model: settings.model,
        apiKey,
        sessions: chosen,
        cards: lib.cards,
        attempts: lib.attempts,
        materials: lib.materials.filter((m) => materialIds.includes(m.id)),
        chunks,
        questionCount: count,
        minutes,
      });

      // Persist before showing it: an hour of answers should not hang off a
      // paper that only exists in this tab.
      await fetch("/api/exams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exam: generated }),
      });

      setExam(generated);
      setResponses({});
      setResult(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openExam(id: string) {
    const response = await fetch(`/api/exams/${encodeURIComponent(id)}`);
    if (!response.ok) return;
    const stored = await response.json();
    setExam(stored.exam);
    setResponses(stored.responses ?? {});
    setResult(stored.result ?? null);
  }

  if (exam) {
    return (
      <PageShell
        title="Practice exam"
        lede={
          result
            ? "Marked. Everything you missed can go straight to the board."
            : "Answers save as you go — you can close this and come back."
        }
        actions={
          <button
            type="button"
            onClick={() => {
              setExam(null);
              setResult(null);
              lib.reload();
            }}
            className="rounded-full border border-line px-4 py-2.5 text-[13px] font-bold text-muted transition hover:text-fg"
          >
            Back to exams
          </button>
        }
        wide
      >
        {exam.focus.length > 0 && !result && (
          <details className="mb-4 surface rounded-md px-4 py-3">
            <summary className="cursor-pointer text-[12.5px] font-bold text-fg">
              Why these questions?
            </summary>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {exam.focus.map((f) => (
                <li key={f.topic} className="text-[12.5px] text-muted">
                  <span className="font-bold text-fg">{f.topic}</span> —{" "}
                  {f.reasons.join("; ")}
                </li>
              ))}
            </ul>
          </details>
        )}

        {result && result.weakestTopics.length > 0 && (
          <div className="mb-4 surface rounded-md px-4 py-3">
            <p className="text-[12.5px] font-bold text-fg">What to revise next</p>
            <p className="mt-1 text-[12.5px] text-muted">
              {result.weakestTopics.join(" · ")}
            </p>
          </div>
        )}

        <ExamPaper
          exam={exam}
          initialResponses={responses}
          result={result}
          onAutosave={(next) => {
            void fetch(`/api/exams/${encodeURIComponent(exam.id)}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ responses: next }),
            });
          }}
          onSubmit={async (next) => {
            const response = await fetch(
              `/api/exams/${encodeURIComponent(exam.id)}`,
              {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ responses: next, submit: true }),
              },
            );
            if (response.ok) {
              const stored = await response.json();
              setResponses(stored.responses ?? next);
              setResult(stored.result ?? null);
            }
          }}
          onTeach={(prompt) =>
            router.push(`/app?ask=${encodeURIComponent(prompt)}`)
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Practice exam"
      lede="Pick the lessons you want examined. The paper is weighted toward the things you actually got stuck on — the questions you asked mid-lesson, the cards you keep forgetting, the quizzes you failed."
      wide
    >
      {lib.loading ? (
        <Loading what="your lessons" />
      ) : lib.error ? (
        <LoadError message={lib.error} />
      ) : !lib.sessions.length ? (
        <Empty title="No lessons yet" action={{ href: "/app", label: "Start a lesson" }}>
          A practice exam is built out of lessons you&rsquo;ve already been
          taught, so there needs to be at least one.
        </Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
              Lessons to examine
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {lib.sessions.map((session) => {
                const on = picked.has(session.id);
                return (
                  <li key={session.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-sm border px-4 py-3 transition ${
                        on ? "border-cyan/50 bg-cyan/[.06]" : "border-line bg-panel hover:border-line-2"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(session.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-cyan)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-fg">
                          {session.title}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-dim">
                          {session.transcript.filter((t) => t.role === "student").length}{" "}
                          questions asked ·{" "}
                          {session.plan
                            ? `${session.plan.steps.length} topics`
                            : `${session.actions.length} board cards`}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="surface rounded-md px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                Paper
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition ${
                      count === n
                        ? "grad text-white"
                        : "border border-line text-muted hover:text-fg"
                    }`}
                  >
                    {n} Qs
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-[12px] text-muted">
                <span className="font-bold">Minutes</span>
                <input
                  type="range"
                  min={20}
                  max={180}
                  step={10}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="flex-1 accent-[var(--color-cyan)]"
                />
                <span className="w-8 font-mono text-[12px] text-fg">{minutes}</span>
              </label>
            </div>

            {preview.length > 0 && (
              <div className="surface rounded-md px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                  It will focus on
                </p>
                <ul className="mt-2.5 flex flex-col gap-2">
                  {preview.map((w) => (
                    <li key={w.topic}>
                      <p className="text-[12.5px] font-bold text-fg">{w.topic}</p>
                      <p className="text-[11.5px] leading-relaxed text-dim">
                        {w.reasons[0]}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && <LoadError message={error} />}

            <button
              type="button"
              onClick={generate}
              disabled={!chosen.length || busy}
              className="rounded-full grad px-5 py-3 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {busy
                ? "Writing your exam…"
                : chosen.length
                  ? `Generate from ${chosen.length} lesson${chosen.length === 1 ? "" : "s"}`
                  : "Pick a lesson first"}
            </button>
          </aside>
        </div>
      )}

      <PastExams onOpen={openExam} />
    </PageShell>
  );
}

/** Previously generated papers, so a half-finished one can be picked back up. */
function PastExams({ onOpen }: { onOpen: (id: string) => void }) {
  const [exams, setExams] = useState<
    { exam: PracticeExam; result: ExamResult | null; submittedAt: number | null }[]
  >([]);

  useEffect(() => {
    let live = true;
    fetch("/api/exams")
      .then((r) => r.json())
      .then((body) => live && setExams(body.exams ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!exams.length) return null;

  return (
    <section className="mt-10">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
        Past papers
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {exams.map((row) => (
          <li
            key={row.exam.id}
            className="flex items-center gap-4 surface rounded-md px-4 py-3"
          >
            <button
              type="button"
              onClick={() => onOpen(row.exam.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-[13.5px] font-semibold text-fg">
                {row.exam.title}
              </span>
              <span className="mt-0.5 block text-[12px] text-dim">
                {new Date(row.exam.createdAt).toLocaleDateString()} ·{" "}
                {row.submittedAt
                  ? `submitted · ${row.result?.percent ?? 0}%`
                  : "in progress"}
              </span>
            </button>
            <span className="shrink-0 text-[11.5px] font-bold text-dim">
              {row.exam.sections.reduce((n, s) => n + s.questions.length, 0)} Qs
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
