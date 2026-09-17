"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { DueReminder } from "@/components/shell/DueReminder";
import { PageShell } from "@/components/shell/PageShell";
import { putCard } from "@/lib/db";
import { checkAnswer } from "@/lib/tutor/engine";
import { isDue, schedule, type ReviewCard } from "@/lib/srs";
import { useLibrary } from "@/lib/useLibrary";

/**
 * The review queue as a page rather than a modal.
 *
 * The queue is snapshotted on first render: answering reschedules a card,
 * which removes it from the live due list, and stepping through a shrinking
 * array skips cards.
 */
export default function ReviewPage() {
  const lib = useLibrary();
  const language = useLanguage();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<ReviewCard[] | null>(null);

  const due = useMemo(
    () =>
      lib.cards.filter((c) => isDue(c, now)).sort((a, b) => a.dueAt - b.dueAt),
    [lib.cards, now],
  );
  const queue = snapshot ?? (due.length ? due : null);

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [tally, setTally] = useState({ right: 0, missed: 0 });

  const card = queue?.[index];

  async function answer(response: string) {
    if (!card || verdict !== null) return;
    if (!snapshot) setSnapshot(due);
    const correct = checkAnswer(
      { id: card.id, prompt: card.prompt, choices: card.choices, answer: card.answer },
      response,
    );
    setVerdict(correct);
    setTally((t) => ({
      right: t.right + (correct ? 1 : 0),
      missed: t.missed + (correct ? 0 : 1),
    }));
    await putCard(schedule(card, correct, Date.now()));
  }

  function next() {
    setVerdict(null);
    setDraft("");
    setIndex((i) => i + 1);
  }

  function teach() {
    if (!card) return;
    // Hand the missed card to the board; /app reads this on mount.
    const prompt = `Teach me this — I got it wrong.\n\n${card.prompt}\n\nThe answer is: ${card.answer}`;
    router.push(`/app?ask=${encodeURIComponent(prompt)}`);
  }

  const finished = queue && index >= queue.length;

  return (
    <PageShell
      title={language.t("review.title")}
      lede={language.t("review.lede")}
      actions={
        queue && !finished ? (
          <span className="rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-dim">
            {index + 1} of {queue.length}
          </span>
        ) : undefined
      }
    >
      {lib.loading ? (
        <Loading what="your review queue" />
      ) : lib.error ? (
        <LoadError message={lib.error} />
      ) : !queue ? (
        <Empty
          title={lib.cards.length ? "Nothing due today" : "No review cards yet"}
          action={{ href: "/quiz", label: "Take a quiz" }}
        >
          {lib.cards.length
            ? `You have ${lib.cards.length} cards on the schedule — none of them are ripe yet. Come back tomorrow, or make more.`
            : "Every quiz question you answer becomes a card here, scheduled so it comes back just as you're about to forget it."}
          {/* The scheduler has always known what's ripe and never told anyone,
              which made spaced repetition work only for people who were going
              to open the app anyway. */}
          <DueReminder dueCount={due.length} />
        </Empty>
      ) : finished ? (
        <div className="surface rounded-md px-6 py-12 text-center">
          <p className="text-[19px] font-bold text-fg">Queue cleared</p>
          <p className="mt-2 text-[13.5px] text-muted">
            {tally.right} right · {tally.missed} to see again tomorrow.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/progress"
              className="rounded-full grad px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
            >
              See progress
            </Link>
            <Link
              href="/quiz"
              className="rounded-full border border-line px-5 py-2.5 text-[13px] font-bold text-muted transition hover:text-fg"
            >
              More flashcards
            </Link>
          </div>
        </div>
      ) : card ? (
        <div className="surface rounded-md px-5 py-6 sm:px-7 sm:py-8">
          <p className="text-[17px] font-semibold leading-snug text-fg">{card.prompt}</p>
          {card.sourceLocator && (
            <p className="mt-2 text-[12px] text-dim">
              {card.sourceLocator}
            </p>
          )}

          {card.choices?.length ? (
            <div className="mt-5 flex flex-col gap-2">
              {card.choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  disabled={verdict !== null}
                  onClick={() => answer(choice)}
                  className="surface-2 rounded-md px-4 py-3 text-left text-[13.5px] font-bold text-fg transition hover:border-line-2 disabled:opacity-60"
                >
                  {choice}
                </button>
              ))}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                answer(draft);
              }}
              className="mt-5 flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={verdict !== null}
                placeholder="your answer"
                autoFocus
                className="flex-1 rounded-xs border border-line bg-panel-2 px-3.5 py-2.5 text-[13.5px] text-fg outline-none transition placeholder:text-dim focus:border-line-2"
              />
              <button
                type="submit"
                disabled={verdict !== null || !draft.trim()}
                className="rounded-full grad px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                Check
              </button>
            </form>
          )}

          {verdict !== null && (
            <div className="mt-6 border-t border-line pt-5">
              <p
                className={`text-[13.5px] font-semibold ${verdict ? "text-good" : "text-pink"}`}
              >
                {verdict ? "Right." : `Not quite — it's ${card.answer}.`}
              </p>
              {card.explanation && (
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  {card.explanation}
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={next}
                  className="rounded-full grad px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
                >
                  Next card
                </button>
                {!verdict && (
                  <button
                    type="button"
                    onClick={teach}
                    className="rounded-full border border-line px-5 py-2.5 text-[13px] font-bold text-muted transition hover:text-fg"
                  >
                    Teach me this one
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </PageShell>
  );
}
