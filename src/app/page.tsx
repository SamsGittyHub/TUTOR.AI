"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BoardDemo } from "@/components/landing/BoardDemo";

const SUBJECTS = [
  "Organic chemistry",
  "Linear algebra",
  "Thermodynamics",
  "Microeconomics",
  "Cell biology",
  "Statistics",
  "US history",
  "Discrete math",
  "Genetics",
  "Calculus II",
  "Circuit analysis",
  "Macroeconomics",
];

const STEPS = [
  {
    n: "1",
    title: "Make a free account",
    body: "Email and a password, and you're in. No API key, no card, nothing to configure. Everything you do is saved to your account, so you can start on a laptop and pick it up on your phone at the exact card you stopped on.",
  },
  {
    n: "2",
    title: "Upload what you're actually studying",
    body: "Lecture PDFs, slide decks, a Word doc, a photo of the notes you scrawled in the margin, even a recording of the lecture itself. It gets read, split by page or slide or timestamp, and kept ready to quote back at you.",
  },
  {
    n: "3",
    title: "Get taught — and interrupt",
    body: "It plans the lesson, then works it out on a live whiteboard: equations line by line, diagrams drawn edge by edge, plots sketched to scale. Cut in whenever you're lost. It answers, then says where it's picking back up.",
  },
];

/** What the app actually does, in the order a student meets it. */
const FEATURES = [
  {
    title: "A whiteboard, not a wall of text",
    body: "Every lesson is written out as you watch — titles, equations in real LaTeX, worked steps one line at a time, comparison tables, flowcharts, and graphs plotted to scale. You can wipe the board mid-lesson without ending the lesson.",
  },
  {
    title: "It talks, and you can talk back",
    body: "Live voice is a real conversation: it explains out loud while writing on the board, and you interrupt it the way you'd interrupt a person — mid-sentence, not by waiting for a beep. It can search your notes while you're still talking.",
  },
  {
    title: "It draws things that aren't shapes",
    body: "When the thing you're stuck on is a real object — a titration setup, a leaf cross-section, a circuit, a map — it generates a properly labelled picture instead of approximating it with boxes and arrows.",
  },
  {
    title: "Taught from your material, and it shows its sources",
    body: "It teaches from your lecture slides in your professor's notation, not a generic curriculum. Every card it writes from your files is stamped with the file and the page, slide, or timestamp — so you can check it.",
  },
  {
    title: "Flashcards that come back when you'd forget",
    body: "Every quiz question you answer becomes a review card on a spaced schedule. Get it right and the gap stretches; miss it and it's back tomorrow. Anything you keep missing has a \"teach me this one\" button that opens a full lesson on it.",
  },
  {
    title: "Practice exams aimed at your weak spots",
    body: "A full paper — sections, marks per question, a real total — weighted toward what you actually got stuck on, read from your own lesson history: where you interrupted, where you said \"wait\", where a card has been missed three times.",
  },
  {
    title: "It reads your marked paper back to you",
    body: "Photograph an exam you've had marked and it goes through it question by question: what you wrote, what went wrong in the working, and what to do differently. Not the score — you already have the score.",
  },
  {
    title: "Your exam dates become a study plan",
    body: "Put your deadlines in with the topics they cover and say how many minutes a day you realistically have. It works backwards: every topic twice, spread across the days you've got, with a full review the day before.",
  },
  {
    title: "It learns how you learn",
    body: "It notices which explanations land for you — pictures, worked steps, being asked before being told — and leans on those next time. It keeps short notes on what trips you up. You can read all of it, and delete any of it, whenever you like.",
  },
  {
    title: "Everything is searchable, and yours to keep",
    body: "Search every file and every lesson by the words your notes actually use, including things only ever said out loud in a recorded lecture. Export any board as a PDF, Word file, image, or notes — or share a read-only link with a classmate.",
  },
];

/** Honest, specific, and checkable — the things a human tutor genuinely can't do. */
const VERSUS = [
  {
    label: "At 2am, the night before",
    human: "Booked out, asleep, or £50 for an emergency hour",
    ours: "Open. Same patience at 2am as at 2pm.",
  },
  {
    label: "Asking the same thing six times",
    human: "You stop asking around the third, because you can feel it",
    ours: "It re-explains a different way. It has no opinion about you.",
  },
  {
    label: "Knowing your actual course",
    human: "Works from their material until you've paid enough hours",
    ours: "Teaches from your slides, in your lecturer's notation, from lesson one",
  },
  {
    label: "Remembering last term",
    human: "Remembers you. Probably not which explanation worked in October.",
    ours: "Knows which kinds of explanation land for you, measured over every session",
  },
  {
    label: "Practice papers",
    human: "Whatever they had time to prepare",
    ours: "Unlimited, generated from your material, weighted to your weak spots",
  },
  {
    label: "What's left afterwards",
    human: "A wiped whiteboard and whatever you managed to copy down",
    ours: "Every board saved, searchable, exportable, on any device you sign into",
  },
];

/** Concrete scenarios, not fabricated customer quotes — this is a beta with no users yet. */
const SCENARIOS = [
  {
    tag: "The night before",
    body: "Upload four weeks of lecture slides at 11pm and have it teach you the unit off your own deck, citing slide numbers you can check against the lecture.",
  },
  {
    tag: "Mid-derivation",
    body: "\"Wait — where did that 2 come from?\" It highlights the exact line it came from and re-derives that step before carrying on.",
  },
  {
    tag: "Out loud, hands free",
    body: "Walk through a problem by talking. It explains aloud, writes the working on the board as it goes, and stops the moment you cut in.",
  },
  {
    tag: "From a photo",
    body: "Photograph a page of handwritten notes — badly-drawn arrows and all — and ask it to teach you what's on it.",
  },
  {
    tag: "After a bad paper",
    body: "Photograph the marked exam. Get a question-by-question breakdown of what went wrong in the working, then a fresh paper aimed at exactly those gaps.",
  },
  {
    tag: "In your language",
    body: "Pick any of 182 languages and it teaches, quizzes, and marks entirely in it — the board content written in your language, not translated after the fact.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-ink">
      <nav className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5">
          <Logo />
          <div className="hidden gap-6 text-[13px] font-bold text-muted sm:flex">
            <a href="#how" className="transition hover:text-fg">How it works</a>
            <a href="#features" className="transition hover:text-fg">Features</a>
            <a href="#versus" className="transition hover:text-fg">vs a tutor</a>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/signup"
              className="rounded-full grad px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
            >
              Start free
            </Link>
          </div>
        </div>
      </nav>

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
            <a
              href="#versus"
              className="w-full rounded-full border border-line px-7 py-3.5 text-sm font-bold text-muted transition hover:border-line-2 hover:text-fg sm:w-auto"
            >
              Why not a human tutor?
            </a>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] font-semibold text-dim">
            <span>✓ No card, no API key</span>
            <span>✓ Teaches from your own notes</span>
            <span>✓ Talks out loud — interrupt it</span>
            <span>✓ Saved to your account, any device</span>
          </div>
        </div>

        <div id="board" className="mx-auto mt-14 max-w-5xl scroll-mt-20">
          <BoardDemo />
        </div>
      </section>

      {/* subject marquee ------------------------------------------------- */}
      <section className="border-y border-line py-5">
        <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="marquee-track flex gap-3" style={{ "--speed": "46s" } as React.CSSProperties}>
            {[...SUBJECTS, ...SUBJECTS].map((subject, index) => (
              <span
                key={index}
                className="whitespace-nowrap rounded-full border border-line px-4 py-1.5 text-[13px] font-bold text-dim"
              >
                {subject}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* how it works ---------------------------------------------------- */}
      <section id="how" className="scroll-mt-20 px-5 py-20">
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

      {/* features -------------------------------------------------------- */}
      <section id="features" className="scroll-mt-20 border-t border-line px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-[32px] font-bold tracking-tight sm:text-[44px]">
            Everything it does
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[14.5px] leading-relaxed text-muted">
            One account, one place. The lesson, the practice, the plan, and the record
            of what you&apos;ve actually learned.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="rounded-lg border border-line bg-panel p-6 transition hover:border-line-2"
              >
                <h3 className="text-[15.5px] font-semibold leading-snug">{feature.title}</h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* versus a human tutor -------------------------------------------- */}
      <section id="versus" className="scroll-mt-20 border-t border-line px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-[32px] font-bold leading-tight tracking-tight sm:text-[44px]">
            A good tutor costs £40 an hour
            <br />
            <span className="grad-text">and goes home at six</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[14.5px] leading-relaxed text-muted">
            This isn&apos;t a worse version of a human tutor that&apos;s cheaper.
            There are specific things it does that a person sitting next to you
            simply can&apos;t.
          </p>

          <div className="mt-12 overflow-hidden rounded-xl border border-line bg-panel">
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
                {/* The column headers are desktop-only, so each cell names its
                    own side on a phone — otherwise the comparison stacks into
                    three unlabelled lines and stops meaning anything. */}
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

          <p className="mx-auto mt-6 max-w-2xl text-center text-[12.5px] leading-relaxed text-dim">
            A brilliant human tutor who knows you well is still a wonderful thing. Most
            students don&apos;t have one, can&apos;t afford one weekly, and can&apos;t
            call one at midnight. This is built for the other twenty-three hours.
          </p>
        </div>
      </section>

      {/* scenarios ------------------------------------------------------- */}
      <section className="overflow-hidden border-y border-line py-16">
        <h2 className="px-5 text-center text-[32px] font-bold tracking-tight sm:text-[44px]">
          What studying with it looks like
        </h2>
        <div className="mt-10 flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <div className="marquee-track flex gap-4" style={{ "--speed": "64s" } as React.CSSProperties}>
            {[...SCENARIOS, ...SCENARIOS].map((item, index) => (
              <figure
                key={index}
                className="w-[330px] shrink-0 rounded-lg border border-line bg-panel p-5"
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

      {/* closer ---------------------------------------------------------- */}
      <section className="px-5 py-24 text-center">
        <h2 className="mx-auto max-w-2xl text-[34px] font-bold leading-tight tracking-tight sm:text-[52px]">
          Your material. Your pace.
          <br />
          <span className="grad-text">Until it actually clicks.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[14.5px] leading-relaxed text-muted">
          Free while it&apos;s in beta. Make an account and ask it something you&apos;re
          stuck on.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-full grad px-8 py-4 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Start free
        </Link>
      </section>

      <footer className="border-t border-line px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[11.5px] text-dim sm:flex-row">
          <Logo size={20} />
          <p>
            Your material and lessons are saved to your account so they follow you
            between devices. Delete any of it, or the whole account, from Settings.
          </p>
        </div>
      </footer>
    </main>
  );
}
