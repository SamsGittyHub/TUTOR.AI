"use client";

import { useState } from "react";
import type { ReviewCard } from "@/lib/srs";

interface Props {
  /** Cards due now, oldest due first. */
  queue: ReviewCard[];
  /** Grade a card and schedule it; returns whether the answer was right. */
  onAnswer: (card: ReviewCard, response: string) => boolean;
  /** Drop a missed card on the whiteboard for a proper walkthrough. */
  onTeach: (card: ReviewCard, response: string) => void;
  onClose: () => void;
}

/**
 * The review session: due cards, one at a time, graded with the same lenient
 * checker as quizzes. Misses are scheduled for tomorrow and can be taught on
 * the board on the spot.
 */
export function ReviewModal({ queue, onAnswer, onTeach, onClose }: Props) {
  // Snapshot: answering reschedules cards, which shrinks the live due queue —
  // stepping through the live list would skip and misalign.
  const [items] = useState(queue);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [tally, setTally] = useState({ right: 0, missed: 0 });

  const card = items[index];
  const finished = !card;

  const submit = (response: string) => {
    if (!card || correct !== null) return;
    setPicked(response);
    const right = onAnswer(card, response);
    setCorrect(right);
    setTally((t) => ({ right: t.right + (right ? 1 : 0), missed: t.missed + (right ? 0 : 1) }));
  };

  const advance = () => {
    setIndex((i) => i + 1);
    setCorrect(null);
    setPicked(null);
    setDraft("");
  };

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
            <h2 className="text-base font-extrabold">Review</h2>
            <p className="text-xs text-dim">
              {finished
                ? `${tally.right} right · ${tally.missed} missed`
                : `${index + 1} of ${items.length} · misses come back tomorrow`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted hover:text-fg"
          >
            close
          </button>
        </header>

        {finished ? (
          <div className="p-8 text-center">
            <p className="text-2xl font-black grad-text">
              {items.length === 0 ? "Nothing due." : `${tally.right}/${items.length}`}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
              {items.length === 0
                ? "The queue is empty. Answer a quiz to seed it — every question becomes a card."
                : tally.missed === 0
                  ? "Clean sweep. The next cards are already scheduled further out."
                  : "Missed cards come back tomorrow; the ones you knew just moved further away."}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 rounded-full grad px-6 py-2 text-sm font-extrabold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-5">
            <p className="text-sm font-bold leading-relaxed">{card.prompt}</p>

            {card.choices ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {card.choices.map((choice, choiceIndex) => {
                  const isAnswer = correct !== null && choice === card.answer;
                  return (
                    <button
                      key={choiceIndex}
                      type="button"
                      disabled={correct !== null}
                      onClick={() => submit(choice)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                        isAnswer
                          ? "border-good/60 bg-good/15 text-good"
                          : correct === false && choice === picked
                            ? "border-pink/60 bg-pink/15 text-pink"
                            : "border-line text-muted hover:border-line-2 hover:text-fg disabled:opacity-50"
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
                  if (draft.trim()) submit(draft.trim());
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  value={correct !== null ? (picked ?? "") : draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={correct !== null}
                  placeholder="Your answer"
                  autoFocus
                  className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-1.5 text-xs outline-none focus:border-cyan/60"
                />
                <button
                  type="submit"
                  disabled={correct !== null || !draft.trim()}
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-bold text-muted hover:text-fg disabled:opacity-40"
                >
                  answer
                </button>
              </form>
            )}

            {correct !== null ? (
              <div className="mt-3 border-t border-line pt-2.5">
                <p className="text-xs font-bold">
                  {correct ? (
                    <span className="text-good">Right.</span>
                  ) : (
                    <span className="text-pink">Not quite — {card.answer}</span>
                  )}
                </p>
                {card.explanation ? (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{card.explanation}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {!correct ? (
                    <button
                      type="button"
                      onClick={() => onTeach(card, (picked ?? draft).trim())}
                      className="rounded-full grad px-3 py-1 text-[11px] font-extrabold text-white"
                    >
                      Teach me this one
                    </button>
                  ) : null}
                  {card.sourceLocator ? (
                    <span className="text-[10.5px] font-semibold text-dim">
                      from {card.sourceLocator}
                    </span>
                  ) : null}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={advance}
                    className="rounded-full border border-line px-4 py-1 text-[11px] font-bold text-muted transition hover:border-cyan/50 hover:text-fg"
                  >
                    {index + 1 === items.length ? "See results" : "Next card"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
