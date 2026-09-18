import type { Metadata } from "next";
import Link from "next/link";

import { FEATURES, SCENARIOS } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Features — TUTOR AI",
  description:
    "A live whiteboard, voice you can interrupt, generated diagrams, spaced review, practice exams weighted to your weak spots, and a tutor that remembers how you learn.",
};

export default function FeaturesPage() {
  return (
    <>
      <section className="px-5 pt-16 pb-12 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[36px] font-bold leading-tight tracking-tight sm:text-[52px]">
            Everything it does
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            One account, one place. The lesson, the practice, the plan, and the record
            of what you&apos;ve actually learned. Every feature here ships today.
          </p>
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-lg border border-line bg-panel p-6 transition hover:border-line-2"
            >
              <h2 className="text-[15.5px] font-semibold leading-snug">{feature.title}</h2>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-line px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-[30px] font-bold tracking-tight sm:text-[40px]">
            What studying with it looks like
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SCENARIOS.map((item) => (
              <figure
                key={item.tag}
                className="rounded-lg border border-line bg-panel p-5"
              >
                <figcaption className="text-[11px] font-semibold uppercase tracking-wider text-cyan">
                  {item.tag}
                </figcaption>
                <p className="mt-3 text-[13.5px] leading-relaxed text-fg/85">{item.body}</p>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line px-5 py-20 text-center">
        <h2 className="text-[28px] font-bold tracking-tight sm:text-[38px]">
          All of it, free while in beta
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
