"use client";

import { useEffect, useState } from "react";

import { useLanguage } from "@/lib/language";

/**
 * How much of today's free allowance is left.
 *
 * The beta runs on one shared key with a daily cap, and a student who hits it
 * mid-lesson used to get a bare 429 — which reads as the app breaking, not as
 * a limit being reached. This is the difference between a bug report and an
 * understood boundary.
 *
 * Deliberately invisible until it matters: a meter permanently in the corner
 * teaches a student to ration a thing they should be using freely. It appears
 * at four fifths spent, and only then.
 */

const WARN_AT = 0.8;
/** Refreshed on a timer, because a lesson spends allowance without navigating. */
const POLL_MS = 60_000;

interface Usage {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
}

export function Allowance() {
  const language = useLanguage();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let live = true;
    const read = () => {
      if (document.visibilityState === "hidden") return;
      void fetch("/api/usage")
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (live && body && typeof body.limit === "number") setUsage(body as Usage);
        })
        .catch(() => {});
    };
    read();
    const timer = window.setInterval(read, POLL_MS);
    document.addEventListener("visibilitychange", read);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);

  if (!usage || !usage.limit) return null;
  const spent = usage.used / usage.limit;
  if (spent < WARN_AT) return null;

  const percent = Math.min(100, Math.round(spent * 100));

  return (
    <span
      title={
        usage.exceeded
          ? "You've used today's free allowance. It resets at midnight UTC."
          : `${usage.remaining.toLocaleString()} of ${usage.limit.toLocaleString()} left today. Resets at midnight UTC.`
      }
      className={`hidden shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
        usage.exceeded
          ? "border-pink/40 bg-pink/10 text-pink"
          : "border-warn/40 bg-warn/10 text-warn"
      }`}
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-current/25" aria-hidden>
        <span
          className="block h-full rounded-full bg-current"
          style={{ width: `${percent}%` }}
        />
      </span>
      {usage.exceeded
        ? language.t("allowance.out")
        : language.t("allowance.left", { percent: 100 - percent })}
    </span>
  );
}
