import type { Metadata } from "next";
import Link from "next/link";

import { TIERS } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Pricing — TUTOR AI",
  description:
    "Free while in beta. Three plans from €19.99 when it launches — the difference between them is mostly how much you want to talk to it.",
};

/** Answers to the things the tier cards deliberately don't try to cram in. */
const NOTES = [
  {
    q: "What does “unlimited” actually mean?",
    a: "Typed lessons, uploads, flashcards, practice exams, the planner — use them as much as you like. There's no daily quota and nothing gets cut off mid-lesson. The only metered thing is live voice, because talking is genuinely the expensive part.",
  },
  {
    q: "Why is voice the thing that's limited?",
    a: "A minute of the tutor speaking costs roughly sixty times what a minute of typed lesson costs. Every plan here is priced so that a student who uses every included minute, every day, still works out — rather than us quietly hoping most people don't.",
  },
  {
    q: "What happens when I run out of voice minutes?",
    a: "Your daily allowance resets the next day, and everything else keeps working — you're never locked out of the app, just out of talking. If you want more before then, you can top up with credits at any tier.",
  },
  {
    q: "Can I change or cancel?",
    a: "Move between plans whenever you like, and cancel without talking to anyone. Your lessons and material stay exactly where they are.",
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="px-5 pt-16 pb-10 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
            Everything is free right now
          </span>
          <h1 className="mt-6 text-[36px] font-bold leading-tight tracking-tight sm:text-[52px]">
            Pricing
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            TUTOR AI is in beta, so every feature is unlocked for everyone and
            nothing is being charged. These are the plans when it launches — the
            difference between them is mostly how much you want to talk to it.
          </p>
        </div>
      </section>

      {/* tiers ----------------------------------------------------------- */}
      <section className="px-5 pb-16">
        <div className="mx-auto grid max-w-5xl items-start gap-5 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <article
              key={tier.name}
              className={`flex h-full flex-col rounded-xl border bg-panel p-7 ${
                tier.featured ? "border-cyan/60 shadow-[0_0_0_1px_var(--cyan)]" : "border-line"
              }`}
            >
              <div className="flex items-center gap-3">
                <h2 className="text-[17px] font-semibold">{tier.name}</h2>
                {tier.featured ? (
                  <span className="rounded-full grad px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white">
                    Most popular
                  </span>
                ) : null}
              </div>

              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{tier.tagline}</p>

              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-[38px] font-bold leading-none tracking-tight">
                  {tier.price}
                </span>
                <span className="text-[13px] font-semibold text-dim">/ month</span>
              </p>

              <p
                className={`mt-5 rounded-md border px-3.5 py-2.5 text-[12.5px] font-semibold ${
                  tier.featured
                    ? "border-cyan/40 bg-cyan/10 text-fg"
                    : "border-line bg-panel-2 text-muted"
                }`}
              >
                {tier.voice}
              </p>

              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {tier.includes.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-muted">
                    <span aria-hidden className="mt-[3px] shrink-0 text-cyan">✓</span>
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`mt-7 block rounded-full px-5 py-3 text-center text-[13.5px] font-semibold transition ${
                  tier.featured
                    ? "grad text-white hover:opacity-90"
                    : "border border-line text-fg hover:border-line-2"
                }`}
              >
                Start free
              </Link>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-[12.5px] leading-relaxed text-dim">
          Extra voice minutes can be topped up with credits on any plan, including
          Basic. Nothing is charged during the beta — signing up today costs nothing
          and commits you to nothing.
        </p>
      </section>

      {/* notes ----------------------------------------------------------- */}
      <section className="border-t border-line px-5 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-[28px] font-bold tracking-tight sm:text-[38px]">
            The bits worth asking about
          </h2>
          <div className="mt-10 flex flex-col gap-4">
            {NOTES.map((note) => (
              <article key={note.q} className="rounded-lg border border-line bg-panel p-6">
                <h3 className="text-[14.5px] font-semibold">{note.q}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{note.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line px-5 py-20 text-center">
        <h2 className="text-[28px] font-bold tracking-tight sm:text-[38px]">
          Free today, whichever plan you&apos;d pick
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
