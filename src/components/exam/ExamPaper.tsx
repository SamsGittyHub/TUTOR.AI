"use client";

import { useEffect, useMemo, useState } from "react";

import type { ExamResponses, ExamResult, PracticeExam } from "@/lib/exam";
import { totalMarks } from "@/lib/exam";

/**
 * The paper itself: one section per page.
 *
 * Paging is the point — a real exam is not an endless scroll, and seeing
 * "Section B of C" is part of rehearsing the thing. Answers autosave on every
 * change so closing the tab mid-paper doesn't lose an hour's work.
 */

interface Props {
  exam: PracticeExam;
  initialResponses: ExamResponses;
  result: ExamResult | null;
  onAutosave: (responses: ExamResponses) => void;
  onSubmit: (responses: ExamResponses) => Promise<void>;
  onTeach: (prompt: string) => void;
}

export function ExamPaper({
  exam,
  initialResponses,
  result,
  onAutosave,
  onSubmit,
  onTeach,
}: Props) {
  const [responses, setResponses] = useState<ExamResponses>(initialResponses);
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const section = exam.sections[page];
  const marks = useMemo(() => totalMarks(exam), [exam]);
  const answered = Object.values(responses).filter((v) => v.trim()).length;
  const questionCount = exam.sections.reduce((n, s) => n + s.questions.length, 0);
  const submitted = result !== null;

  // Debounced so typing an essay isn't one request per keystroke.
  useEffect(() => {
    if (submitted) return;
    const timer = setTimeout(() => onAutosave(responses), 800);
    return () => clearTimeout(timer);
  }, [responses, submitted, onAutosave]);

  function set(id: string, value: string) {
    if (submitted) return;
    setResponses((prev) => ({ ...prev, [id]: value }));
  }

  async function submit() {
    if (submitting) return;
    const missing = questionCount - answered;
    if (
      missing > 0 &&
      !confirm(`${missing} question${missing === 1 ? "" : "s"} left blank. Submit anyway?`)
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(responses);
      setPage(0);
    } finally {
      setSubmitting(false);
    }
  }

  const verdictFor = (questionId: string) =>
    result?.perQuestion.find((p) => p.questionId === questionId);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 surface rounded-md px-4 py-3">
        <div className="mr-auto">
          <p className="text-[14px] font-semibold text-fg">{exam.title}</p>
          <p className="mt-0.5 text-[12px] text-dim">
            {questionCount} questions · {marks} marks · {exam.minutes} min
            {submitted ? " · submitted" : ` · ${answered}/${questionCount} answered`}
          </p>
        </div>
        {submitted && result && (
          <div className="text-right">
            <p className="text-[22px] font-bold leading-none text-fg">
              {result.percent}%
            </p>
            <p className="text-[11.5px] text-dim">
              {result.awarded}/{result.total} marks
            </p>
          </div>
        )}
      </div>

      {/* section tabs double as the page indicator */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {exam.sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPage(i)}
            aria-current={i === page ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition ${
              i === page
                ? "bg-panel-3 text-fg"
                : "border border-line text-muted hover:text-fg"
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      {section && (
        <section className="mt-4 surface rounded-md px-5 py-5">
          <h2 className="text-[16px] font-bold text-fg">{section.title}</h2>
          {section.instructions && (
            <p className="mt-1 text-[12.5px] text-muted">{section.instructions}</p>
          )}

          <ol className="mt-5 flex flex-col gap-6">
            {section.questions.map((question, i) => {
              const verdict = verdictFor(question.id);
              const unmarked = submitted && verdict?.marks === 0;
              return (
                <li key={question.id}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-6 shrink-0 text-[13px] font-bold text-dim">
                      {i + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] leading-relaxed text-fg">
                        {question.prompt}
                      </p>
                      <p className="mt-1 text-[11.5px] text-dim">
                        {question.marks} mark{question.marks === 1 ? "" : "s"}
                        {question.topic ? ` · ${question.topic}` : ""}
                        {question.sourceLocator ? ` · ${question.sourceLocator}` : ""}
                      </p>

                      {question.choices?.length ? (
                        <div className="mt-3 flex flex-col gap-1.5">
                          {question.choices.map((choice) => {
                            const picked = responses[question.id] === choice;
                            return (
                              <button
                                key={choice}
                                type="button"
                                disabled={submitted}
                                onClick={() => set(question.id, choice)}
                                className={`rounded-sm border px-3.5 py-2.5 text-left text-[13.5px] transition ${
                                  picked
                                    ? "border-cyan/60 bg-cyan/[.07] font-bold text-fg"
                                    : "border-line text-muted hover:border-line-2 hover:text-fg"
                                } ${submitted ? "cursor-default" : ""}`}
                              >
                                {choice}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea
                          value={responses[question.id] ?? ""}
                          onChange={(e) => set(question.id, e.target.value)}
                          disabled={submitted}
                          rows={question.kind === "worked" ? 6 : 2}
                          placeholder={
                            question.kind === "worked"
                              ? "Show your working…"
                              : "Your answer"
                          }
                          className="mt-3 w-full rounded-xs border border-line bg-panel-2 px-3 py-2.5 text-[13.5px] text-fg outline-none transition placeholder:text-dim focus:border-line-2 disabled:opacity-70"
                        />
                      )}

                      {submitted && (
                        <div
                          className={`mt-3 rounded-sm border px-3.5 py-3 ${
                            unmarked
                              ? "border-line bg-panel-2"
                              : verdict?.correct
                                ? "border-good/40 bg-good/[.07]"
                                : "border-pink/40 bg-pink/[.07]"
                          }`}
                        >
                          <p
                            className={`text-[12.5px] font-semibold ${
                              unmarked
                                ? "text-muted"
                                : verdict?.correct
                                  ? "text-good"
                                  : "text-pink"
                            }`}
                          >
                            {unmarked
                              ? "Not auto-marked — check it against the answer."
                              : verdict?.correct
                                ? `Correct — ${verdict.awarded}/${question.marks}`
                                : `Not quite — 0/${question.marks}`}
                          </p>
                          <p className="mt-1.5 text-[13px] text-fg">
                            <span className="font-bold">Answer:</span> {question.answer}
                          </p>
                          {question.explanation && (
                            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                              {question.explanation}
                            </p>
                          )}
                          {!verdict?.correct && (
                            <button
                              type="button"
                              onClick={() =>
                                onTeach(
                                  `Teach me this — I got it wrong on a practice exam.\n\n${question.prompt}\n\nThe answer is: ${question.answer}`,
                                )
                              }
                              className="mt-2.5 rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-muted transition hover:text-fg"
                            >
                              Teach me this one
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-full border border-line px-4 py-2 text-[12.5px] font-bold text-muted transition hover:text-fg disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-[12px] text-dim">
              Page {page + 1} of {exam.sections.length}
            </span>
            {page < exam.sections.length - 1 ? (
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="ml-auto rounded-full grad px-5 py-2 text-[12.5px] font-semibold text-white transition hover:opacity-90"
              >
                Next section
              </button>
            ) : !submitted ? (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="ml-auto rounded-full grad px-5 py-2 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Marking…" : "Submit paper"}
              </button>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
