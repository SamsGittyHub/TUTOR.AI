"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { bucketForecast, masteryForMaterial } from "@/lib/progress";
import { isDue } from "@/lib/srs";
import { useLibrary } from "@/lib/useLibrary";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ProgressPage() {
  const lib = useLibrary();
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

  const scored = lib.attempts.filter((a) => a.total > 0);
  const average = scored.length
    ? Math.round(
        (scored.reduce((sum, a) => sum + a.score / a.total, 0) / scored.length) * 100,
      )
    : null;

  return (
    <PageShell
      title="Progress"
      lede="Built from the quizzes you've taken and the review queue behind them. Nothing here is a streak counter — it's just what's sticking."
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

          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
              By material
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
        </>
      )}
    </PageShell>
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
