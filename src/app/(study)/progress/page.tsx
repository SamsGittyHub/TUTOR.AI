"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { bucketForecast, masteryForMaterial, rankSubjects } from "@/lib/progress";
import { useLanguage } from "@/lib/language";
import { isDue } from "@/lib/srs";
import { useLibrary } from "@/lib/useLibrary";
import { useLearning } from "@/lib/useLearning";
import { MIN_MODE_SHOWN, modeName, modeRanking } from "@/lib/learning";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SWATCH: Record<string, string> = {
  cyan: "bg-cyan",
  pink: "bg-pink",
  amber: "bg-warn",
  green: "bg-good",
  violet: "bg-[#8b5cf6]",
};

export default function ProgressPage() {
  const lib = useLibrary();
  const learning = useLearning();
  const language = useLanguage();
  // Frozen per mount: a live Date.now() would recompute every memo on render.
  const [now] = useState(() => Date.now());

  const dueToday = lib.cards.filter((card) => isDue(card, now)).length;
  const forecast = useMemo(() => bucketForecast(lib.cards, now, 7), [lib.cards, now]);
  const peak = Math.max(1, ...forecast);

  const rollup = useMemo(
    () =>
      lib.materials
        .map((m) => ({
          material: m,
          ...masteryForMaterial(m.id, lib.attempts, lib.cards, now),
        }))
        .sort((a, b) => b.mastery - a.mastery || a.dueNow - b.dueNow),
    [lib.materials, lib.attempts, lib.cards, now],
  );

  const subjects = useMemo(
    () =>
      rankSubjects(
        lib.courses.map((course) => ({
          id: course.id,
          name: course.name,
          color: course.color,
          materialIds: lib.materials
            .filter((m) => m.courseId === course.id)
            .map((m) => m.id),
        })),
        lib.attempts,
        lib.cards,
        now,
        lib.papers,
      ),
    [lib.courses, lib.materials, lib.attempts, lib.cards, lib.papers, now],
  );
  const ranked = subjects.filter((s) => s.confident);

  const scored = lib.attempts.filter((a) => a.total > 0);
  const average = scored.length
    ? Math.round(
        (scored.reduce((sum, a) => sum + a.score / a.total, 0) / scored.length) * 100,
      )
    : null;

  return (
    <PageShell
      title={language.t("progress.title")}
      lede={language.t("progress.lede")}
      actions={
        dueToday > 0 ? (
          <Link
            href="/review"
            className="rounded-full grad px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
          >
            Review {dueToday} due
          </Link>
        ) : undefined
      }
      wide
    >
      {lib.loading ? (
        <Loading what="your progress" />
      ) : lib.error ? (
        <LoadError message={lib.error} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={String(dueToday)} label="Due today" />
            <Stat value={String(lib.cards.length)} label="Review cards" />
            <Stat value={String(lib.attempts.length)} label="Quizzes taken" />
            <Stat value={average === null ? "—" : `${average}%`} label="Average score" />
          </div>

          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
              Next seven days
            </h2>
            <div className="surface mt-3 flex items-end gap-2 rounded-md px-4 py-4">
              {forecast.map((count, i) => {
                const day = new Date(now + i * 864e5);
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[11px] font-bold text-muted">{count || ""}</span>
                    <div
                      className={`w-full rounded-[4px] ${count ? "grad" : "bg-[var(--tint)]"}`}
                      style={{
                        height: `${count ? Math.max(6, (count / peak) * 72) : 6}px`,
                        transition: "height var(--dur-slow) var(--ease-out)",
                      }}
                    />
                    <span className="text-[10.5px] font-bold uppercase text-dim">
                      {i === 0 ? "Today" : DAY_NAMES[day.getDay()]}
                    </span>
                  </div>
                );
              })}
            </div>
            {forecast.every((n) => n === 0) && (
              <p className="mt-2.5 text-[12.5px] text-dim">
                Nothing scheduled this week — answer some quiz questions and the
                queue fills itself in.
              </p>
            )}
          </section>

          {subjects.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                {language.t("progress.bySubject")}
              </h2>
              <p className="mt-1 text-[12.5px] text-muted">
                {language.t("progress.rankingHint")}
              </p>

              <ul className="stagger mt-3 flex flex-col gap-2">
                {subjects.map((subject, i) => {
                  const strongest = ranked.length > 1 && subject === ranked[0];
                  const weakest =
                    ranked.length > 1 && subject === ranked[ranked.length - 1];
                  return (
                    <li
                      key={subject.courseId}
                      className="surface rounded-md px-4 py-3.5"
                      style={{ ["--i" as string]: i }}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${SWATCH[subject.color] ?? SWATCH.cyan}`}
                        />
                        <p className="text-[13.5px] font-semibold text-fg">
                          {subject.name}
                        </p>
                        {strongest && (
                          <span className="rounded-full bg-good/12 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-good">
                            {language.t("progress.strongest")}
                          </span>
                        )}
                        {weakest && (
                          <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-warn">
                            {language.t("progress.weakest")}
                          </span>
                        )}
                        <span className="ml-auto text-[12px] text-dim">
                          {subject.confident
                            ? `${subject.label} · ${subject.mastery}%`
                            : language.t("progress.notEnough")}
                          {subject.answered
                            ? ` · ${subject.correct}/${subject.answered} answered`
                            : ""}
                          {subject.lapses ? ` · ${subject.lapses} forgotten` : ""}
                          {subject.dueNow ? ` · ${subject.dueNow} due` : ""}
                        </span>
                      </div>

                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--tint)]">
                        <div
                          className={`h-full transition-[width] ${
                            subject.confident ? "grad" : "bg-[var(--color-line-2)]"
                          }`}
                          style={{
                            width: `${subject.confident ? subject.mastery : 0}%`,
                          }}
                        />
                      </div>

                      {!subject.confident && (
                        <p className="mt-1.5 text-[11.5px] text-dim">
                          {language.t("progress.notEnoughHint")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
              {language.t("progress.byMaterial")}
            </h2>
            {!rollup.length ? (
              <div className="mt-3">
                <Empty title="No material yet" action={{ href: "/app", label: "Upload something" }}>
                  Upload a file and take a quiz on it — mastery appears once
                  there's something to measure.
                </Empty>
              </div>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {rollup.map((row) => (
                  <li
                    key={row.material.id}
                    className="surface rounded-md px-4 py-3.5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">
                        {row.material.name}
                      </p>
                      <span className="shrink-0 text-[12px] text-dim">
                        {row.label}
                        {row.dueNow ? ` · ${row.dueNow} due` : ""}
                      </span>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-panel-3">
                      <div
                        className="h-full grad transition-[width]"
                        style={{ width: `${row.mastery}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <HowYouLearn learning={learning} />
        </>
      )}
    </PageShell>
  );
}

/**
 * What the tutor has worked out about this person, and the means to delete it.
 *
 * Shown because it is a record about them that changes how they get taught.
 * Something kept about you that you can neither see nor erase is a different
 * kind of thing from a tutor remembering how last term went.
 */
function HowYouLearn({ learning }: { learning: ReturnType<typeof useLearning> }) {
  const ranked = modeRanking(learning.profile).filter((m) => m.confident);
  const notes = [...learning.profile.notes].sort((a, b) => b.seen - a.seen || b.at - a.at);
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
          How you learn
        </h2>
        {ranked.length || notes.length ? (
          confirming ? (
            <span className="flex items-center gap-2 text-[12px]">
              <button
                type="button"
                onClick={() => {
                  learning.forgetEverything();
                  setConfirming(false);
                }}
                className="font-semibold text-pink hover:underline"
              >
                Erase it all
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-dim hover:text-fg"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-[12px] text-dim transition hover:text-pink"
            >
              Make it forget
            </button>
          )
        ) : null}
      </div>

      {!ranked.length && !notes.length ? (
        <p className="mt-3 surface rounded-md px-4 py-3.5 text-[13px] leading-relaxed text-muted">
          Nothing yet. As the tutor teaches you, it works out what makes things
          click — pictures, worked steps, being asked before being told — and
          leans on that next time. It needs {MIN_MODE_SHOWN} or so lessons
          before it will commit to anything.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {ranked.map((standing) => (
            <div key={standing.mode} className="surface rounded-md px-4 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">
                  {modeName(standing.mode)}
                </p>
                <span className="shrink-0 text-[12px] text-dim">
                  landed {Math.round(standing.rate * 100)}% of {standing.shown}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-panel-3">
                <div
                  className="h-full grad transition-[width]"
                  style={{ width: `${Math.round(standing.rate * 100)}%` }}
                />
              </div>
            </div>
          ))}

          {notes.map((note) => (
            <div
              key={note.id}
              className="surface flex items-start gap-3 rounded-md px-4 py-3.5"
            >
              <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-fg">
                {note.text}
                {note.seen > 1 ? (
                  <span className="ml-2 text-[12px] text-dim">
                    noticed {note.seen} times
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() => learning.forget(note.id)}
                title="Forget this"
                aria-label="Forget this"
                className="shrink-0 text-[12px] text-dim transition hover:text-pink"
              >
                forget
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="surface rounded-md px-4 py-3.5">
      <p className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg">
        {value}
      </p>
      <p className="mt-1.5 text-[12px] text-dim">{label}</p>
    </div>
  );
}
