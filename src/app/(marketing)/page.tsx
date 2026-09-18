import Link from "next/link";

import { BoardDemo } from "@/components/landing/BoardDemo";
import { STEPS, SUBJECTS } from "@/lib/marketing";

/** Short teasers out to the other three pages, so the home page isn't a dead end. */
const ONWARD = [
  {
    href: "/features",
    label: "Everything it does",
    body: "The whiteboard, live voice, generated diagrams, spaced review, practice exams, the study planner, and the memory of how you learn.",
  },
  {
    href: "/why",
    label: "Why not a human tutor?",
    body: "Six things a person sitting next to you can't do — availability at 2am, teaching in your lecturer's notation, remembering last term.",
  },
  {
    href: "/pricing",
    label: "What it costs",
    body: "Free while it's in beta. Three plans when it launches, from €19.99 — and the differences between them are mostly about talking.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* hero ------------------------------------------------------------ */}
      <section className="relative px-5 pt-16 pb-10 sm:pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-[.16] blur-[110px] grad"
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
            Free while in beta
          </span>

          <h1 className="mt-6 text-[42px] font-bold leading-[1.05] tracking-tight sm:text-[68px]">
            The tutor that
            <br />
            <span className="grad-text">writes on the board</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted sm:text-base">
            Upload your notes, slides, or lecture recording. Get a 1:1 lesson taught
            step by step on a live whiteboard — out loud, if you want — and interrupt
            it the second you&apos;re lost. It teaches from your material, not a
            generic syllabus.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="w-full rounded-full grad px-7 py-3.5 text-sm font-semibold text-white transition hover:opacity-90 sm:w-auto"
            >
              Start a lesson — free
            </Link>
            <Link
              href="/why"
              className="w-full rounded-full border border-line px-7 py-3.5 text-sm font-bold text-muted transition hover:border-line-2 hover:text-fg sm:w-auto"
            >
              Why not a human tutor?
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] font-semibold text-dim">
            <span>✓ No card, no API key</span>
            <span>✓ Teaches from your own notes</span>
            <span>✓ Talks out loud — interrupt it</span>
            <span>✓ Saved to your account, any device</span>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <BoardDemo />
        </div>
      </section>

      {/* subjects — a plain list, not a marquee ------------------------- */}
      <section className="border-y border-line px-5 py-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-[11.5px] font-semibold uppercase tracking-wider text-dim">
            Whatever you&apos;re studying
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {SUBJECTS.map((subject) => (
              <span
                key={subject}
                className="rounded-full border border-line px-4 py-1.5 text-[13px] font-bold text-dim"
              >
                {subject}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* how it works ---------------------------------------------------- */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-[32px] font-bold tracking-tight sm:text-[44px]">
            Three steps, then it teaches
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <article
                key={step.n}
                className="rounded-lg border border-line bg-panel p-6 transition hover:border-line-2"
              >
                <span className="grad-text text-[44px] font-bold leading-none">{step.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* onward ---------------------------------------------------------- */}
      <section className="border-t border-line px-5 py-16">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
          {ONWARD.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-lg border border-line bg-panel p-6 transition hover:border-line-2"
            >
              <h3 className="flex items-center gap-2 text-[15.5px] font-semibold">
                {card.label}
                <span className="text-cyan transition group-hover:translate-x-0.5">→</span>
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{card.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* closer ---------------------------------------------------------- */}
      <section className="border-t border-line px-5 py-24 text-center">
        <h2 className="mx-auto max-w-2xl text-[34px] font-bold leading-tight tracking-tight sm:text-[52px]">
          Your material. Your pace.
          <br />
          <span className="grad-text">Until it actually clicks.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[14.5px] leading-relaxed text-muted">
          Free while it&apos;s in beta. Make an account and ask it something
          you&apos;re stuck on.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-full grad px-8 py-4 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Start free
        </Link>
      </section>
    </>
  );
}
