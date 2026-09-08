"use client";

import { useState } from "react";
import type { QuizQuestion, QuizState } from "@/lib/db";

interface Props {
  quiz?: QuizState;
  busy: boolean;
  hasMaterial: boolean;
  onGenerate: (topic: string, count: number) => void;
  onAnswer: (questionId: string, response: string) => void;
  onReview: (question: QuizQuestion) => void;
  onClose: () => void;
}

export function QuizPanel({
  quiz,
  busy,
  hasMaterial,
  onGenerate,
  onAnswer,
  onReview,
  onClose,
}: Props) {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(6);

  const answered = quiz?.questions.filter((q) => q.response !== undefined) ?? [];
  const correct = answered.filter((q) => q.correct).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="my-8 w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-panel"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-base font-extrabold">
              {quiz ? quiz.title : "Practice from your own material"}
            </h2>
            <p className="text-xs text-dim">
              {quiz
                ? `${answered.length} of ${quiz.questions.length} answered · ${correct} right`
                : "Questions come from what you uploaded, not a generic question bank."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted hover:text-white"
          >
            close
          </button>
        </header>

        {!quiz ? (
          <div className="space-y-4 p-5">
            {!hasMaterial ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/[.07] p-3 text-xs leading-relaxed text-amber-200">
                Nothing is selected in the sidebar, so questions will come from the
                model's general knowledge instead of your notes.
              </p>
            ) : null}
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-dim">
                Topic (optional)
              </label>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="oxidation states, chapter 6, everything I got wrong last time"
                className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-cyan/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-dim">
                How many questions
              </label>
              <div className="flex gap-2">
                {[4, 6, 10, 15].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCount(value)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${
                      count === value
                        ? "border-transparent grad text-white"
                        : "border-line text-muted hover:text-white"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onGenerate(topic, count)}
              className="w-full rounded-full grad py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {busy ? "Writing questions…" : "Make my quiz"}
            </button>
          </div>
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
            {quiz.questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                index={index}
                question={question}
                onAnswer={onAnswer}
                onReview={onReview}
              />
            ))}

            {quiz.finished ? (
              <div className="rounded-md border border-line bg-panel-2 p-4 text-center">
                <p className="text-2xl font-black grad-text">
                  {correct}/{quiz.questions.length}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {correct === quiz.questions.length
                    ? "Every one. Go do something else with your evening."
                    : "Hit “teach me this one” on anything you missed — the tutor will walk it on the board."}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  index,
  onAnswer,
  onReview,
}: {
  question: QuizQuestion;
  index: number;
  onAnswer: (id: string, response: string) => void;
  onReview: (question: QuizQuestion) => void;
}) {
  const [draft, setDraft] = useState("");
  const done = question.response !== undefined;

  return (
    <div
      className={`rounded-md border p-4 transition ${
        !done
          ? "border-line bg-panel-2"
          : question.correct
            ? "border-green-500/40 bg-green-500/[.06]"
            : "border-pink/40 bg-pink/[.06]"
      }`}
    >
      <p className="text-sm font-bold leading-relaxed">
        <span className="mr-2 text-dim">{index + 1}.</span>
        {question.prompt}
      </p>

      {question.choices ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {question.choices.map((choice, choiceIndex) => {
            const picked = question.response === choice;
            const isAnswer = done && choice === question.answer;
            return (
              <button
                key={choiceIndex}
                type="button"
                disabled={done}
                onClick={() => onAnswer(question.id, choice)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  isAnswer
                    ? "border-green-500/60 bg-green-500/15 text-green-300"
                    : picked
                      ? "border-pink/60 bg-pink/15 text-pink"
                      : "border-line text-muted hover:border-line-2 hover:text-white disabled:opacity-50"
                }`}
              >
                <span className="mr-1.5 opacity-50">{String.fromCharCode(65 + choiceIndex)}</span>
                {choice}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) onAnswer(question.id, draft.trim());
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={done ? (question.response ?? "") : draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={done}
            placeholder="Your answer"
            className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-1.5 text-xs outline-none focus:border-cyan/60"
          />
          <button
            type="submit"
            disabled={done || !draft.trim()}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-bold text-muted hover:text-white disabled:opacity-40"
          >
            answer
          </button>
        </form>
      )}

      {done ? (
        <div className="mt-3 border-t border-line pt-2.5">
          <p className="text-xs font-bold">
            {question.correct ? (
              <span className="text-green-400">Right.</span>
            ) : (
              <span className="text-pink">Not quite — {question.answer}</span>
            )}
          </p>
          {question.explanation ? (
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              {question.explanation}
            </p>
          ) : null}
          <div className="mt-2 flex items-center gap-3">
            {!question.correct ? (
              <button
                type="button"
                onClick={() => onReview(question)}
                className="rounded-full grad px-3 py-1 text-[11px] font-extrabold text-white"
              >
                Teach me this one
              </button>
            ) : null}
            {question.sourceLocator ? (
              <span className="text-[10.5px] font-semibold text-dim">
                from {question.sourceLocator}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
