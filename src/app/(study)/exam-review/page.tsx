"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { keyFor } from "@/lib/beta";
import { useEffect, useRef, useState } from "react";

import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { Button } from "@/components/ui/Button";
import {
  scoreOf,
  teachPrompt,
  weakTopics,
  type ExamReview,
  type ReviewedQuestion,
  type Verdict,
} from "@/lib/exam-review";
import { loadKeys } from "@/lib/keys";
import type { ImagePart } from "@/lib/providers";
import { loadSettings } from "@/lib/settings";
import { MAX_PAGES, reviewExam } from "@/lib/tutor/exam-review-gen";
import { useLibrary } from "@/lib/useLibrary";

/**
 * Upload a marked paper, have the tutor go through it.
 *
 * Pages are read by the model straight from the browser — the same BYOK path
 * as everything else — and only then uploaded for keeping. A student whose
 * storage upload fails still gets their review.
 */

const VERDICT_STYLE: Record<Verdict, { label: string; className: string }> = {
  correct: { label: "Correct", className: "text-good" },
  partial: { label: "Partial", className: "text-warn" },
  wrong: { label: "Lost marks", className: "text-pink" },
  unclear: { label: "Couldn't read", className: "text-dim" },
};

interface Page {
  file: File;
  url: string;
  base64: string;
  mediaType: string;
}

async function readPage(file: File): Promise<Page> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error(`Couldn't read ${file.name}.`));
    reader.readAsDataURL(file);
  });
  return {
    file,
    url: URL.createObjectURL(file),
    base64,
    mediaType: file.type || "image/jpeg",
  };
}

export default function ExamReviewPage() {
  const router = useRouter();
  const lib = useLibrary();
  const language = useLanguage();

  const [pages, setPages] = useState<Page[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState<ExamReview | null>(null);
  const [history, setHistory] = useState<ExamReview[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/exam-reviews")
      .then((r) => r.json())
      .then((body) => live && setHistory(body.reviews ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Object URLs outlive the component otherwise.
  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);

  async function addFiles(list: FileList | null) {
    // Copy out of the FileList before the first await: the input is reset
    // synchronously after this is called, which empties the live list and
    // leaves the awaited half reading from nothing.
    const chosen = list ? [...list] : [];
    if (!chosen.length) return;

    setError(null);
    const room = MAX_PAGES - pages.length;
    if (room <= 0) {
      setError(`That's the limit — ${MAX_PAGES} pages per review.`);
      return;
    }
    const firstName = chosen[0].name;
    try {
      const added = await Promise.all(chosen.slice(0, room).map(readPage));
      setPages((prev) => [...prev, ...added]);
      setTitle((prev) => prev || firstName.replace(/\.[^.]+$/, ""));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function run() {
    if (!pages.length || busy) return;
    setBusy("reading");
    setError(null);
    try {
      const settings = loadSettings();
      const apiKey = keyFor(loadKeys()[settings.providerId]);
      if (!apiKey) throw new Error("Add an API key in Settings first.");

      const images: ImagePart[] = pages.map((p) => ({
        mediaType: p.mediaType,
        base64: p.base64,
      }));

      const { review } = await reviewExam({
        providerId: settings.providerId,
        model: settings.model,
        apiKey,
        images,
        title: title.trim() || "Exam",
        note: note.trim() || undefined,
      });

      const id = `xr-${crypto.randomUUID()}`;
      const record: ExamReview = {
        id,
        courseId: courseId || undefined,
        title: title.trim() || "Exam",
        pages: pages.map((p, i) => ({
          locator: `page ${i + 1}`,
          mediaType: p.mediaType,
        })),
        review,
        createdAt: Date.now(),
      };

      await fetch("/api/exam-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ review: record }),
      });

      // Keep the photographs, but never at the cost of the review itself.
      setBusy("saving");
      await Promise.allSettled(
        pages.map((p, i) => {
          const form = new FormData();
          form.append("reviewId", id);
          form.append("locator", `page ${i + 1}`);
          form.append("file", p.file);
          return fetch("/api/exam-reviews/pages", { method: "POST", body: form });
        }),
      );

      setOpen(record);
      setHistory((prev) => [record, ...prev]);
      setPages([]);
      setTitle("");
      setNote("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function openReview(id: string) {
    const response = await fetch(`/api/exam-reviews/${encodeURIComponent(id)}`);
    if (!response.ok) return;
    const body = await response.json();
    setOpen(body.review);
  }

  async function remove(id: string) {
    if (!confirm("Delete this review and its photos?")) return;
    await fetch(`/api/exam-reviews/${encodeURIComponent(id)}`, { method: "DELETE" });
    setHistory((prev) => prev.filter((r) => r.id !== id));
    if (open?.id === id) setOpen(null);
  }

  if (open?.review) {
    const score = scoreOf(open.review);
    const topics = weakTopics(open.review);
    return (
      <PageShell
        title={open.title}
        lede={open.review.summary || "Question by question, and what to do about it."}
        actions={
          <Button onClick={() => setOpen(null)}>Back to reviews</Button>
        }
        wide
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="surface rounded-md px-4 py-3.5">
            <p className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg">
              {score.total ? `${score.percent}%` : "—"}
            </p>
            <p className="mt-1.5 text-[12px] text-dim">
              {score.total ? `${score.awarded}/${score.total} marks read off the paper` : "No marks written on the paper"}
            </p>
          </div>
          <div className="surface rounded-md px-4 py-3.5">
            <p className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg">
              {open.review.questions.filter((q) => q.verdict !== "correct" && q.verdict !== "unclear").length}
            </p>
            <p className="mt-1.5 text-[12px] text-dim">questions to go over</p>
          </div>
          <div className="surface rounded-md px-4 py-3.5">
            <p className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg">
              {score.unclear}
            </p>
            <p className="mt-1.5 text-[12px] text-dim">
              {score.unclear ? "couldn't be read — retake those" : "pages all readable"}
            </p>
          </div>
        </div>

        {topics.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
              What to revise
            </h2>
            <ul className="stagger mt-3 flex flex-col gap-2">
              {topics.map((t, i) => (
                <li
                  key={t.topic}
                  className="surface rounded-md px-4 py-3"
                  style={{ ["--i" as string]: i }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13.5px] font-semibold text-fg">{t.topic}</p>
                    <p className="shrink-0 text-[12px] text-dim">
                      {t.lost} mark{t.lost === 1 ? "" : "s"} · {t.count} question
                      {t.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  {t.reasons.length > 0 && (
                    <p className="mt-1 text-[12.5px] leading-[1.55] text-muted">
                      {t.reasons.join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
            Question by question
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {open.review.questions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onTeach={() =>
                  router.push(`/app?ask=${encodeURIComponent(teachPrompt(q))}`)
                }
              />
            ))}
          </ul>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={language.t("examReview.title")}
      lede={language.t("examReview.lede")}
      wide
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }}
            className="rounded-md px-6 py-10 text-center shadow-[inset_0_0_0_1px_var(--hairline)]"
          >
            <p className="text-[15px] font-semibold text-fg">
              Drop photos of the paper
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-[1.6] text-muted">
              One per page, up to {MAX_PAGES}. Straight on and in good light reads
              far better than at an angle — a page it can&rsquo;t read, it says so
              rather than guessing.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              tone="secondary"
              className="mt-5"
              onClick={() => fileRef.current?.click()}
            >
              Choose photos
            </Button>
          </div>

          {pages.length > 0 && (
            <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {pages.map((page, i) => (
                <li key={page.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.url}
                    alt={`Page ${i + 1}`}
                    className="aspect-[3/4] w-full rounded-sm object-cover shadow-[var(--elev-1)]"
                  />
                  <button
                    type="button"
                    aria-label={`Remove page ${i + 1}`}
                    onClick={() =>
                      setPages((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="tx absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[13px] font-semibold text-white hover:bg-black/80"
                  >
                    ×
                  </button>
                  <p className="mt-1 text-center text-[11px] text-dim">
                    page {i + 1}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
              What was it
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Orgo midterm 2"
              className="tx rounded-xs bg-[var(--tint)] px-3 py-2 text-[13px] text-fg shadow-[inset_0_0_0_0.5px_var(--hairline)] outline-none placeholder:text-dim"
            />
          </label>

          {lib.courses.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                Subject
              </span>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="tx rounded-xs bg-[var(--tint)] px-3 py-2 text-[13px] text-fg shadow-[inset_0_0_0_0.5px_var(--hairline)] outline-none"
              >
                <option value="">None</option>
                {lib.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
              Anything it should know
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="the last page is the mark scheme"
              className="tx rounded-xs bg-[var(--tint)] px-3 py-2 text-[13px] text-fg shadow-[inset_0_0_0_0.5px_var(--hairline)] outline-none placeholder:text-dim"
            />
          </label>

          {error && <LoadError message={error} />}

          <Button
            tone="primary"
            size="lg"
            full
            disabled={!pages.length || busy !== null}
            onClick={run}
          >
            {busy === "reading"
              ? "Reading your paper…"
              : busy === "saving"
                ? "Saving…"
                : pages.length
                  ? `Review ${pages.length} page${pages.length === 1 ? "" : "s"}`
                  : "Add a photo first"}
          </Button>
        </aside>
      </div>

      <section className="mt-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
          Past reviews
        </h2>
        {lib.loading ? (
          <Loading what="your reviews" />
        ) : !history.length ? (
          <div className="mt-3">
            <Empty title="No reviews yet">
              Once you&rsquo;ve had a paper back, photograph it here and the
              tutor will tell you where the marks actually went.
            </Empty>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {history.map((row) => {
              const score = row.review ? scoreOf(row.review) : null;
              return (
                <li
                  key={row.id}
                  className="surface flex items-center gap-4 rounded-md px-4 py-3"
                >
                  <button
                    type="button"
                    onClick={() => openReview(row.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[13.5px] font-semibold text-fg">
                      {row.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-dim">
                      {new Date(row.createdAt).toLocaleDateString()} ·{" "}
                      {row.pages.length} page{row.pages.length === 1 ? "" : "s"}
                      {score?.total ? ` · ${score.percent}%` : ""}
                    </span>
                  </button>
                  <Button tone="danger" size="sm" onClick={() => remove(row.id)}>
                    Delete
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

function QuestionCard({
  question,
  onTeach,
}: {
  question: ReviewedQuestion;
  onTeach: () => void;
}) {
  const verdict = VERDICT_STYLE[question.verdict];
  const wrong = question.verdict === "wrong" || question.verdict === "partial";

  return (
    <li className="surface rounded-md px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[14px] font-semibold text-fg">{question.number}</p>
        <p className={`text-[12px] font-medium ${verdict.className}`}>
          {verdict.label}
        </p>
        {question.marksAvailable !== undefined && (
          <p className="text-[12px] text-dim">
            {question.verdict === "unclear"
              ? `${question.marksAvailable} marks, not scored`
              : `${question.marksAwarded ?? 0}/${question.marksAvailable} marks`}
          </p>
        )}
        {question.topic && (
          <p className="ml-auto text-[12px] text-dim">{question.topic}</p>
        )}
      </div>

      {question.prompt && (
        <p className="mt-2 text-[13px] leading-[1.55] text-muted">{question.prompt}</p>
      )}

      {(question.given || question.expected) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {question.given && (
            <div className="rounded-sm bg-[var(--tint)] px-3 py-2">
              <p className="text-[11px] text-dim">You wrote</p>
              <p className="mt-0.5 text-[13px] text-fg">{question.given}</p>
            </div>
          )}
          {question.expected && (
            <div className="rounded-sm bg-[var(--tint)] px-3 py-2">
              <p className="text-[11px] text-dim">Should be</p>
              <p className="mt-0.5 text-[13px] text-fg">{question.expected}</p>
            </div>
          )}
        </div>
      )}

      {question.wentWrong && (
        <p className="mt-3 text-[13px] leading-[1.55] text-fg">{question.wentWrong}</p>
      )}
      {question.fix && (
        <p className="mt-1.5 text-[12.5px] leading-[1.55] text-muted">
          Next time: {question.fix}
        </p>
      )}

      {wrong && (
        <Button tone="secondary" size="sm" className="mt-3" onClick={onTeach}>
          Teach me this one
        </Button>
      )}
    </li>
  );
}
