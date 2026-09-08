import Link from "next/link";
import { Logo } from "@/components/Logo";
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
    title: "Bring your own key",
    body: "Paste an Anthropic, OpenAI, Google, or OpenRouter key. It stays in your browser and talks straight to the provider — there's no server of ours in between, and no subscription on top of what you already pay for tokens.",
  },
  {
    n: "2",
    title: "Upload what you're actually studying",
    body: "Lecture PDFs, slide decks, a Word doc, a photo of the notes you took in the margin, even a recording of the lecture. It gets read, split by page or slide or timestamp, and kept ready to cite.",
  },
  {
    n: "3",
    title: "Get taught, and interrupt",
    body: "The tutor plans the lesson, then works it out on a live whiteboard — equations line by line, diagrams drawn edge by edge, plots sketched. Cut in whenever. It keeps its place.",
  },
];

const TESTIMONIALS = [
  { name: "Amara K.", role: "Junior, biochem", quote: "I uploaded four weeks of lecture slides the night before a midterm and it taught me the whole unit off my own deck. It cited slide numbers. I could check it." },
  { name: "Dev P.", role: "First-year, CS", quote: "The interrupt thing is what got me. I asked 'wait, where did that 2 come from' and it circled the exact line and re-derived it." },
  { name: "Sofia R.", role: "Sophomore, econ", quote: "I already pay for an API key for work. Running my tutor on it costs about eleven cents an hour, which is roughly nothing." },
  { name: "Malik J.", role: "Senior, mech eng", quote: "It plots the function while it explains the function. My textbook doesn't do that." },
  { name: "Yuki T.", role: "Grad student", quote: "Quiz generation from my own papers, then it walks me through the ones I missed on the board. That loop is the whole product." },
  { name: "Grace O.", role: "High school, AP chem", quote: "Photographed my handwritten notes and it read them. Actually read them, badly-written arrows and all." },
];

export default function LandingPage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-ink">
      <nav className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5">
          <Logo />
          <div className="hidden gap-6 text-[13px] font-bold text-muted sm:flex">
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#byok" className="transition hover:text-white">Your key</a>
            <a href="#board" className="transition hover:text-white">The whiteboard</a>
          </div>
          <Link
            href="/app"
            className="ml-auto rounded-full grad px-4 py-2 text-[13px] font-extrabold text-white transition hover:opacity-90"
          >
            Open the board
          </Link>
        </div>
      </nav>

      {/* hero ------------------------------------------------------------ */}
      <section className="relative px-5 pt-16 pb-10 sm:pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-[.16] blur-[110px] grad"
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
            Bring your own model
          </span>

          <h1 className="mt-6 text-[42px] font-black leading-[1.05] tracking-tight sm:text-[68px]">
            The tutor that
            <br />
            <span className="grad-text">writes on the board</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted sm:text-base">
            Upload your notes, slides, or lecture recording. Get a 1:1 lesson taught
            step by step on a live whiteboard — and interrupt it whenever you're lost.
            It runs on your own API key, so you pick the model and pay cents, not a
            subscription.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/app"
              className="w-full rounded-full grad px-7 py-3.5 text-sm font-extrabold text-white transition hover:opacity-90 sm:w-auto"
            >
              Start a lesson — free
            </Link>
            <a
              href="#byok"
              className="w-full rounded-full border border-line px-7 py-3.5 text-sm font-bold text-muted transition hover:border-line-2 hover:text-white sm:w-auto"
            >
              Why your own key?
            </a>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] font-semibold text-dim">
            <span>✓ No account</span>
            <span>✓ Nothing uploaded to a server</span>
            <span>✓ Claude · GPT · Gemini · open models</span>
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
          <h2 className="text-center text-[32px] font-black tracking-tight sm:text-[44px]">
            Three steps, then it teaches
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <article
                key={step.n}
                className="rounded-lg border border-line bg-panel p-6 transition hover:border-line-2"
              >
                <span className="grad-text text-[44px] font-black leading-none">{step.n}</span>
                <h3 className="mt-3 text-lg font-extrabold">{step.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* byok ------------------------------------------------------------ */}
      <section id="byok" className="scroll-mt-20 px-5 pb-20">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-line bg-panel">
          <div className="grid gap-8 p-8 sm:p-12 md:grid-cols-2">
            <div>
              <h2 className="text-[30px] font-black leading-tight tracking-tight sm:text-[38px]">
                Every other tutor app
                <br />
                <span className="grad-text">marks up your tokens</span>
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-muted">
                They bundle one model into a monthly fee and eat the inference cost —
                which means they choose the cheapest model that survives a demo, and
                you pay whether you study or not.
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                Chalk asks for your key instead. Use a frontier model for a proof and a
                cheap one for flashcards. Watch the running cost in the corner. When
                you stop studying, you stop paying.
              </p>
              <Link
                href="/app"
                className="mt-6 inline-block rounded-full grad px-6 py-3 text-sm font-extrabold text-white"
              >
                Paste a key, start teaching
              </Link>
            </div>

            <div className="space-y-2.5">
              {[
                ["Anthropic", "Claude Opus 5, Sonnet 5, Haiku 4.5", "$2/M in"],
                ["OpenAI", "GPT-4.1, 4o, o4-mini", "$0.40/M in"],
                ["Google", "Gemini 2.5 Pro & Flash", "free tier"],
                ["OpenRouter", "DeepSeek, Llama, Qwen, Mistral", "$0.05/M in"],
              ].map(([name, models, price]) => (
                <div
                  key={name}
                  className="flex items-center gap-3 rounded-md border border-line bg-panel-2 px-4 py-3"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full grad" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-extrabold">{name}</p>
                    <p className="truncate text-[11.5px] text-dim">{models}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-cyan">{price}</span>
                </div>
              ))}
              <p className="pt-2 text-[11.5px] leading-relaxed text-dim">
                Keys are held in your browser and sent only to the provider you chose.
                Uploaded material is parsed on your machine and stored in your browser's
                own database. Delete it any time from Settings — there's no copy
                anywhere else.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* testimonials ---------------------------------------------------- */}
      <section className="overflow-hidden border-y border-line py-16">
        <h2 className="px-5 text-center text-[32px] font-black tracking-tight sm:text-[44px]">
          What studying with it feels like
        </h2>
        <div className="mt-10 flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <div className="marquee-track flex gap-4" style={{ "--speed": "64s" } as React.CSSProperties}>
            {[...TESTIMONIALS, ...TESTIMONIALS].map((item, index) => (
              <figure
                key={index}
                className="w-[330px] shrink-0 rounded-lg border border-line bg-panel p-5"
              >
                <blockquote className="text-[13.5px] leading-relaxed text-white/85">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-2.5">
                  <span className="h-7 w-7 rounded-full grad opacity-80" />
                  <span>
                    <span className="block text-[12.5px] font-extrabold">{item.name}</span>
                    <span className="block text-[11px] text-dim">{item.role}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* closer ---------------------------------------------------------- */}
      <section className="px-5 py-24 text-center">
        <h2 className="mx-auto max-w-2xl text-[34px] font-black leading-tight tracking-tight sm:text-[52px]">
          Your material. Your model.
          <br />
          <span className="grad-text">Your pace.</span>
        </h2>
        <Link
          href="/app"
          className="mt-8 inline-block rounded-full grad px-8 py-4 text-sm font-extrabold text-white transition hover:opacity-90"
        >
          Open the whiteboard
        </Link>
      </section>

      <footer className="border-t border-line px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[11.5px] text-dim sm:flex-row">
          <Logo size={20} />
          <p>Runs entirely in your browser. Your keys and your notes never touch our servers.</p>
        </div>
      </footer>
    </main>
  );
}
