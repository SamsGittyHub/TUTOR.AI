"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SettingsModal } from "@/components/app/SettingsModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useQuizLab } from "@/lib/useQuizLab";
import { findModel, formatCost } from "@/lib/providers";
import { loadKeys } from "@/lib/keys";
import { useVoice } from "@/lib/voice";

const COUNT_PRESETS = [4, 6, 10, 15];

export default function QuizPage() {
  const lab = useQuizLab();
  const voice = useVoice({ onTranscript: () => undefined });
  const [showSettings, setShowSettings] = useState(false);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);

  return (
    <div className="flex h-dvh flex-col bg-ink">
      <header className="flex shrink-0 items-center justify-between px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-sm font-black tracking-tight">Chalk</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-dim sm:block">
            {findModel(lab.settings.providerId, lab.settings.model)?.label ?? lab.settings.model}
          </span>
          <ThemeToggle />
          {voice.ttsSupported ? (
            <button
              type="button"
              onClick={voice.toggleTts}
              title={voice.ttsOn ? "Tutor voice: on" : "Tutor voice: off"}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                voice.ttsOn
                  ? "grad border-transparent text-white"
                  : "border-line text-muted hover:text-fg"
              }`}
            >
              <SpeakerIcon muted={false} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition hover:text-fg"
            aria-label="Settings"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-1.7-1L14.8 2H9.2L8.8 4.8a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 1.7 1l.4 2.8h5.6l.4-2.8a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <Link
            href="/app"
            className="rounded-full grad px-3.5 py-1.5 text-[11.5px] font-extrabold text-white"
          >
            Back to the board
          </Link>
        </div>
      </header>

      {lab.error ? (
        <div className="mx-4 mb-2 flex items-start justify-between gap-3 rounded-md border border-pink/40 bg-pink/10 px-3.5 py-2.5">
          <div>
            <p className="text-xs font-bold text-pink">{lab.error.message}</p>
            {lab.error.hint ? <p className="mt-0.5 text-[11px] text-muted">{lab.error.hint}</p> : null}
          </div>
          <button type="button" onClick={lab.dismissError} className="text-[11px] font-bold text-pink">
            ✕
          </button>
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6">
        {lab.run ? (
          <FlashcardRun
            lab={lab}
            voice={voice}
          />
        ) : (
          <Setup lab={lab} count={count} setCount={setCount} topic={topic} setTopic={setTopic} />
        )}
      </main>

      {showSettings ? (
        <SettingsModal
          settings={lab.settings}
          onChange={lab.changeSettings}
          onKeysChanged={() => undefined}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type Lab = ReturnType<typeof useQuizLab>;
type Voice = ReturnType<typeof useVoice>;

function Setup({
  lab,
  topic,
  setTopic,
  count,
  setCount,
}: {
  lab: Lab;
  topic: string;
  setTopic: (t: string) => void;
  count: number;
  setCount: (n: number) => void;
}) {
  const hasKey = Boolean(loadKeys()[lab.settings.providerId]);

  return (
    <div className="space-y-5 py-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Flashcards</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Unlimited quizzes, straight from your material. Every question you
          answer becomes a review card on the board&apos;s schedule.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-dim">
          Material
        </h2>
        {lab.materials.length ? (
          <div className="flex flex-wrap gap-1.5">
            {lab.materials.map((material) => {
              const selected = lab.selectedIds.includes(material.id);
              return (
                <button
                  key={material.id}
                  type="button"
                  onClick={() => lab.toggleMaterial(material.id)}
                  className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition ${
                    selected
                      ? "grad border-transparent text-white"
                      : "border-line text-muted hover:border-line-2 hover:text-fg"
                  }`}
                >
                  {material.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[11.5px] leading-relaxed text-dim">
            Nothing uploaded yet — quizzes will draw on the tutor&apos;s own
            knowledge.{" "}
            <Link href="/app" className="font-bold text-cyan hover:underline">
              Upload material on the board
            </Link>{" "}
            to be quizzed on your class.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-dim">
          Topic (optional)
        </h2>
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="chapter 4, the Calvin cycle, integration by parts…"
          className="w-full rounded-md border border-line bg-panel px-3 py-2 text-[13px] outline-none focus:border-cyan/60"
        />
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-dim">
          Questions
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {COUNT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setCount(preset)}
              className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition ${
                count === preset
                  ? "grad border-transparent text-white"
                  : "border-line text-muted hover:border-line-2 hover:text-fg"
              }`}
            >
              {preset}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={lab.maxQuestions}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="w-20 rounded-md border border-line bg-panel px-2.5 py-1.5 text-[12px] outline-none focus:border-cyan/60"
          />
        </div>
      </section>

      <button
        type="button"
        disabled={lab.busy}
        onClick={() => void lab.generate(topic, count)}
        className="w-full rounded-full grad py-3 text-sm font-extrabold text-white disabled:opacity-40"
      >
        {lab.busy ? "Writing questions…" : "Generate a quiz"}
      </button>
      {!hasKey ? (
        <p className="-mt-2 text-center text-[11.5px] text-pink">
          Add your API key first —{" "}
          <Link href="/app" className="font-bold hover:underline">
            on the board
          </Link>{" "}
          or in settings above.
        </p>
      ) : null}

      {lab.attempts.length ? (
        <section>
          <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-dim">
            Recent quizzes
          </h2>
          <ul className="space-y-1">
            {lab.attempts.slice(0, 8).map((attempt) => (
              <li
                key={attempt.id}
                className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-[12px]"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-muted">
                  {attempt.title}
                </span>
                <span className="shrink-0 font-mono text-dim">
                  {attempt.score}/{attempt.total}
                </span>
                <span className="shrink-0 text-dim">
                  {new Date(attempt.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function FlashcardRun({ lab, voice }: { lab: Lab; voice: Voice }) {
  const run = lab.run;
  const spokenRef = useRef<string | null>(null);

  const question = run ? run.questions[run.index] : undefined;
  const answered = question?.response !== undefined;

  // Voice mode reads each new card as it lands. Question ids repeat across
  // runs ("q1" everywhere), so the spoken marker includes the run id.
  useEffect(() => {
    if (!voice.ttsOn || !run || !question || answered) return;
    const marker = `${run.id}:${question.id}`;
    if (spokenRef.current === marker) return;
    spokenRef.current = marker;
    voice.speak(question.prompt);
    if (question.choices?.length) voice.speak(question.choices.join(". "));
  }, [run, question, answered, voice]);

  if (!run || !question) return null;
  const progress = run.questions.filter((q) => q.response !== undefined).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col py-5">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div>
          <p className="text-sm font-extrabold">{run.title}</p>
          <p className="text-[11px] text-dim">
            Question {progress + (answered ? 0 : 1)} of {run.questions.length}
            {run.costUsd > 0 ? ` · ${formatCost(run.costUsd)} of context used` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {voice.ttsSupported ? (
            <button
              type="button"
              onClick={() => {
                voice.speak(question.prompt);
                if (question.choices?.length) voice.speak(question.choices.join(". "));
              }}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-muted transition hover:text-fg"
            >
              ▶ read aloud
            </button>
          ) : null}
          <button
            type="button"
            onClick={lab.reset}
            className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-muted transition hover:text-fg"
          >
            new quiz
          </button>
        </div>
      </div>

      <div className="mb-4 h-1 shrink-0 overflow-hidden rounded-full bg-line">
        <div
          className="h-full grad transition-all"
          style={{ width: `${(progress / run.questions.length) * 100}%` }}
        />
      </div>

      {run.finished && answered ? (
        <ScoreCard lab={lab} run={run} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-panel p-5">
          <p className="text-[15px] font-bold leading-relaxed">{question.prompt}</p>

          {question.choices ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {question.choices.map((choice, i) => {
                const isAnswer = answered && choice === question.answer;
                const isPicked = answered && choice === question.response;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={answered}
                    onClick={() => lab.answer(question.id, choice)}
                    className={`rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition ${
                      isAnswer
                        ? "border-good/60 bg-good/15 text-good"
                        : isPicked
                          ? "border-pink/60 bg-pink/15 text-pink"
                          : "border-line text-muted hover:border-line-2 hover:text-fg disabled:opacity-50"
                    }`}
                  >
                    <span className="mr-1.5 opacity-50">{String.fromCharCode(65 + i)}</span>
                    {choice}
                  </button>
                );
              })}
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const input = event.currentTarget.elements.namedItem("a") as HTMLInputElement;
                if (input.value.trim() && !answered) lab.answer(question.id, input.value.trim());
              }}
              className="mt-4 flex gap-2"
            >
              <input
                name="a"
                autoFocus
                disabled={answered}
                placeholder="Type your answer"
                className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 text-[13px] outline-none focus:border-cyan/60"
              />
              <button
                type="submit"
                disabled={answered}
                className="rounded-md grad px-4 py-2 text-xs font-extrabold text-white disabled:opacity-40"
              >
                answer
              </button>
            </form>
          )}

          {answered ? (
            <div className="mt-4 border-t border-line pt-3.5">
              <p className="text-[13px] font-bold">
                {question.correct ? (
                  <span className="text-good">Right.</span>
                ) : (
                  <span className="text-pink">Not quite — {question.answer}</span>
                )}
              </p>
              {question.explanation ? (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  {question.explanation}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!question.correct ? (
                  <button
                    type="button"
                    onClick={() => lab.teach(question)}
                    className="rounded-full grad px-3.5 py-1.5 text-[11.5px] font-extrabold text-white"
                  >
                    Teach me this one
                  </button>
                ) : null}
                {question.sourceLocator ? (
                  <span className="text-[10.5px] font-semibold text-dim">
                    from {question.sourceLocator}
                  </span>
                ) : null}
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={lab.advance}
                  className="rounded-full border border-line px-4 py-1.5 text-[11px] font-bold text-muted transition hover:border-cyan/50 hover:text-fg"
                >
                  {run.finished ? "See results" : "Next card"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ScoreCard({ lab, run }: { lab: Lab; run: NonNullable<Lab["run"]> }) {
  const score = run.questions.filter((q) => q.correct).length;
  const missed = run.questions.filter((q) => !q.correct);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-line bg-panel p-8 text-center">
      <p className="text-4xl font-black grad-text">
        {score}/{run.questions.length}
      </p>
      <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-muted">
        {missed.length === 0
          ? "Perfect. All of these just moved further out in your review queue."
          : `${missed.length} card${missed.length === 1 ? "" : "s"} due tomorrow. Every answer here feeds the board's review queue.`}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={lab.reset}
          className="rounded-full grad px-5 py-2 text-[12.5px] font-extrabold text-white"
        >
          Generate another quiz
        </button>
        <Link
          href="/app"
          className="rounded-full border border-line px-5 py-2 text-[12.5px] font-bold text-muted transition hover:text-fg"
        >
          Back to the board
        </Link>
      </div>
      {missed.length ? (
        <div className="mt-6 w-full max-w-md space-y-1.5 text-left">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-dim">
            To review with the tutor
          </p>
          {missed.map((question) => (
            <button
              key={question.id}
              type="button"
              onClick={() => lab.teach(question)}
              className="block w-full truncate rounded-md border border-line bg-panel-2 px-3 py-2 text-left text-[11.5px] font-semibold text-muted transition hover:border-cyan/50 hover:text-fg"
            >
              {question.prompt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 5 6 9H3v6h3l5 4V5Zm4.5 3.5a5 5 0 0 1 0 9m2.5-12a8.5 8.5 0 0 1 0 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {muted ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" /> : null}
    </svg>
  );
}
