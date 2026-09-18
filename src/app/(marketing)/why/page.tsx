import type { Metadata } from "next";
import Link from "next/link";

import { VERSUS } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Why not a human tutor? — TUTOR AI",
  description:
    "A good tutor costs £40 an hour and goes home at six. Six specific things a person sitting next to you can't do — and one honest thing they do better.",
};

export default function WhyPage() {
  return (
    <>
      <section className="px-5 pt-16 pb-12 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[34px] font-bold leading-tight tracking-tight sm:text-[50px]">
            A good tutor costs £40 an hour
            <br />
            <span className="grad-text">and goes home at six</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            This isn&apos;t a worse version of a human tutor that&apos;s cheaper. There
            are specific things it does that a person sitting next to you simply
            can&apos;t.
          </p>
        </div>
      </section>

      <section className="px-5 pb-16">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-line bg-panel">
          <div className="hidden grid-cols-[1fr_1fr_1fr] gap-px border-b border-line bg-line text-[11px] font-semibold uppercase tracking-wider text-dim sm:grid">
            <span className="bg-panel px-5 py-3" />
            <span className="bg-panel px-5 py-3">An hour with a tutor</span>
            <span className="bg-panel px-5 py-3 text-cyan">TUTOR AI</span>
          </div>

          {VERSUS.map((row) => (
            <div
              key={row.label}
              className="grid gap-px border-b border-line bg-line last:border-b-0 sm:grid-cols-[1fr_1fr_1fr]"
            >
              <span className="bg-panel px-5 py-4 text-[13.5px] font-semibold text-fg">
                {row.label}
              </span>
              {/* The column headers are desktop-only, so each cell names its own
                  side on a phone — otherwise this stacks into three unlabelled
                  lines and stops meaning anything. */}
              <span className="bg-panel px-5 py-4 text-[13px] leading-relaxed text-dim">
                <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-dim sm:hidden">
                  An hour with a tutor
                </span>
                {row.human}
              </span>
              <span className="bg-panel px-5 py-4 text-[13px] leading-relaxed text-fg/90">
                <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-cyan sm:hidden">
                  TUTOR AI
                </span>
                {row.ours}
              </span>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-[13px] leading-relaxed text-dim">
          A brilliant human tutor who knows you well is still a wonderful thing. Most
          students don&apos;t have one, can&apos;t afford one weekly, and can&apos;t
          call one at midnight. This is built for the other twenty-three hours.
        </p>
      </section>

      <section className="border-t border-line px-5 py-20 text-center">
        <h2 className="text-[28px] font-bold tracking-tight sm:text-[38px]">
          Try it on something you&apos;re stuck on
        </h2>
        <Link
          href="/signup"
          className="mt-7 inline-block rounded-full grad px-8 py-4 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Start free
        </Link>
      </section>
    </>
  );
}
