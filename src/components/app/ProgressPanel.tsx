"use client";

import { useMemo, useState } from "react";
import type { Material, QuizAttempt } from "@/lib/db";
import { bucketForecast, masteryForMaterial } from "@/lib/progress";
import { DAY_MS, isDue, startOfDay, type ReviewCard } from "@/lib/srs";

interface Props {
  materials: Material[];
  cards: ReviewCard[];
  attempts: QuizAttempt[];
  /** Only offered when something is actually due. */
  onReview: () => void;
  onClose: () => void;
}

/**
 * The study record: what's due, how the queue will land over the next week,
 * how each material is trending. Read-only except for the review shortcut.
 */
export function ProgressPanel({ materials, cards, attempts, onReview, onClose }: Props) {
  // Frozen per mount: a Date.now() dep would recompute both memos on every
  // parent render while the panel is open.
  const [now] = useState(() => Date.now());
  const dueToday = cards.filter((card) => isDue(card, now)).length;
  const forecast = useMemo(() => bucketForecast(cards, now, 7), [cards, now]);

  const rollup = useMemo(
    () =>
      materials
        .map((material) => masteryForMaterial(material.id, attempts, cards, now))
        .sort((a, b) => b.mastery - a.mastery || a.dueNow - b.dueNow),
    [materials, attempts, cards, now],
  );

  const avgScore = useMemo(() => {
    if (!attempts.length) return null;
    const score = attempts.reduce((sum, a) => sum + a.score, 0);
    const total = attempts.reduce((sum, a) => sum + a.total, 0);
    return total > 0 ? Math.round((score / total) * 100) : null;
  }, [attempts]);

  const mastered = rollup.filter((m) => m.label === "Strong").length;
  const maxBucket = Math.max(1, ...forecast);
  // Same day boundary the forecast buckets on — labels must not drift from math.
  const today = startOfDay(now);

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
            <h2 className="text-base font-extrabold">Progress</h2>
            <p className="text-xs text-dim">
              Built from your quizzes and the review queue — nothing leaves this browser.
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

        <div className="space-y-5 p-5">
          {/* overall ----------------------------------------------------- */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Due today" value={String(dueToday)} accent={dueToday > 0} />
            <Stat label="Review cards" value={String(cards.length)} />
            <Stat label="Quizzes taken" value={String(attempts.length)} />
            <Stat label="Average score" value={avgScore === null ? "—" : `${avgScore}%`} />
          </div>

          {dueToday > 0 ? (
            <button
              type="button"
              onClick={onReview}
              className="w-full rounded-full grad py-2.5 text-sm font-extrabold text-white"
            >
              Review {dueToday} due card{dueToday === 1 ? "" : "s"}
            </button>
          ) : null}

          {/* forecast ---------------------------------------------------- */}
          {cards.length ? (
            <section>
              <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-dim">
                What's coming back
              </h3>
              <div className="flex h-24 items-end gap-1.5">
                {forecast.map((count, day) => {
                  const date = new Date(today + day * DAY_MS);
                  return (
                    <div key={day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-dim">{count || ""}</span>
                      <div
                        className={`w-full rounded-t-sm ${count ? "grad" : "bg-panel-3"}`}
                        style={{ height: `${Math.max((count / maxBucket) * 72, count ? 4 : 2)}px` }}
                        title={`${count} card${count === 1 ? "" : "s"} due`}
                      />
                      <span className="text-[10px] text-dim">
                        {day === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* per-material ------------------------------------------------ */}
          {materials.length ? (
            <section>
              <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-dim">
                Mastery by material
              </h3>
              <ul className="space-y-1.5">
                {rollup.map((entry) => {
                  const material = materials.find((m) => m.id === entry.materialId);
                  return (
                    <li
                      key={entry.materialId}
                      className="rounded-md border border-line bg-panel-2 px-3 py-2"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs font-bold">
                          {material?.name ?? "Material"}
                        </span>
                        <span
                          className={`shrink-0 text-[10px] font-extrabold uppercase tracking-wide ${
                            entry.label === "Strong"
                              ? "text-good"
                              : entry.label === "Learning"
                                ? "text-warn"
                                : "text-dim"
                          }`}
                        >
                          {entry.label}
                        </span>
                        <span className="shrink-0 font-mono text-[10.5px] text-dim">
                          {entry.mastery}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full grad transition-all"
                          style={{ width: `${entry.mastery}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10.5px] text-dim">
                        {entry.attemptCount
                          ? `${entry.attemptCount} quiz${entry.attemptCount === 1 ? "" : "zes"} · last ${entry.lastScore!.score}/${entry.lastScore!.total}`
                          : "no quizzes yet"}
                        {entry.cardCount
                          ? ` · ${entry.cardCount} card${entry.cardCount === 1 ? "" : "s"}${entry.dueNow ? `, ${entry.dueNow} due` : ""}`
                          : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-dim">
              Upload something, take a quiz, and this panel starts telling you how it's
              sticking.
            </p>
          )}

          {/* trend -------------------------------------------------------- */}
          {attempts.length >= 2 ? (
            <section>
              <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-dim">
                Last {Math.min(attempts.length, 10)} quizzes
              </h3>
              <Sparkline attempts={attempts.slice(0, 10).reverse()} />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-md border px-3 py-2.5 ${
        accent ? "border-cyan/40 bg-cyan/[.06]" : "border-line bg-panel-2"
      }`}
    >
      <p className={`text-xl font-black ${accent ? "text-cyan" : ""}`}>{value}</p>
      <p className="text-[10.5px] font-semibold text-dim">{label}</p>
    </div>
  );
}

function Sparkline({ attempts }: { attempts: QuizAttempt[] }) {
  const width = 100;
  const height = 32;
  const points = attempts.map((attempt, i) => {
    const x = attempts.length === 1 ? width / 2 : (i / (attempts.length - 1)) * width;
    const y = height - (attempt.total > 0 ? attempt.score / attempt.total : 0) * (height - 4) - 2;
    return { x, y, fraction: attempt.total > 0 ? attempt.score / attempt.total : 0 };
  });
  const path = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div className="rounded-md border border-line bg-panel-2 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full text-cyan" preserveAspectRatio="none">
        <polyline
          points={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.4" fill={p.fraction >= 0.7 ? "var(--color-good)" : "currentColor"} />
        ))}
      </svg>
      <p className="mt-1.5 text-[10px] text-dim">
        oldest → newest · green dots are perfect scores
      </p>
    </div>
  );
}
