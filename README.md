# Chalk — an AI tutor that teaches on a whiteboard

Upload your own study material, get a 1:1 lesson worked out step by step on a
live whiteboard, interrupt whenever you're lost, and quiz yourself on what you
actually uploaded. It runs on **your** API key — Anthropic, OpenAI, Google, or
OpenRouter — so there's no subscription and no markup on inference.

Built from [`PRD-ai-tutor.md`](./PRD-ai-tutor.md).

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 32 checks: parser, action repair, math, retrieval, providers
npm run build
```

No environment variables. No database to provision. Nothing to deploy but static
output — `next build` produces two prerendered routes.

---

## The one architectural decision

The PRD left it open: **server-side key storage, or client-side only?** This
build is client-side only, and everything else follows from that.

| | What it means here |
|---|---|
| **Keys** | Held in browser storage, sent only to the provider you picked. There is no backend to breach and no log to leak. |
| **Material** | Parsed in the browser (pdf.js, mammoth, JSZip) and stored in IndexedDB. Nothing is uploaded anywhere. |
| **Retrieval** | BM25 over the chunks, in memory. No embedding calls, no vector database. |
| **Deployment** | Static. Push it anywhere that serves files. |

The honest cost: browser storage is readable by any script running on the
origin, so Settings says so plainly and offers session-only storage for shared
machines. Server-side retrieval augmentation is off the table too — which is why
retrieval is lexical rather than semantic (see below).

## How a lesson works

```
student message
   → retrieve.ts        BM25 over chunks → the excerpts that matter, with locators
   → prompts.ts         system prompt: the action protocol + how to teach
   → providers/*        stream from the browser, straight to the vendor
   → stream-json.ts     pull complete JSON objects out of the token stream
   → actions.ts         normalize / repair each object, drop the unsalvageable
   → Whiteboard         render the card the instant its closing brace lands
```

The board draws while the model is still talking. That's the whole trick, and
it's why the parser is tolerant rather than strict.

### The tutor-action schema

Every model speaks the same twelve actions, so a $0.05 model and a $5 model
drive the same UI: `lesson_plan`, `say`, `write_text`, `write_equation`,
`write_steps`, `write_table`, `draw_diagram`, `draw_plot`, `highlight`, `erase`,
`ask_question`, `done`. Full protocol with examples: [`src/lib/tutor/prompts.ts`](src/lib/tutor/prompts.ts).

Cards carry `sourceRefs`, so an explanation drawn from page 214 says so on the
board.

### Three layers of graceful degradation

Weak models mangle structured output. Rather than showing an error:

1. **Tolerant parsing** — fences, top-level arrays, prose preamble, `{"action":
   "steps"}` instead of `{"type": "write_steps"}`, `"color": "purple"`, string
   steps instead of objects — all normalized into valid actions.
2. **One repair pass** — the model gets its own broken output back plus the rule
   it broke.
3. **Plain text** — the lesson still arrives in the chat rail, with a banner
   explaining that a stronger model will draw properly.

## What's implemented

Every phase in the PRD's rollout, with two scoped-down substitutions called out
below.

- **Materials** — PDF (with scanned pages rasterized for vision models), PPTX,
  DOCX, images, plain text, and audio/video via transcription. Chunked by page /
  slide / timestamp so citations point somewhere real.
- **Whiteboard** — progressive rendering, KaTeX equations, four SVG diagram
  layouts, function plotting, highlight, erase, paper/chalk themes, inline
  check-for-understanding questions.
- **BYOK** — four providers, key validation before use, per-session model
  choice, any custom model id, live cost estimate from the model price table.
- **Practice** — quizzes generated from your material, lenient answer checking,
  and "teach me this one" on anything you missed, which drops you back on the
  board.
- **Sessions** — saved, resumable, board and all.

### Where this deviates from the PRD

**Embeddings → BM25.** Client-side embedding means a paid call per upload and a
second index to maintain. Over the few hundred chunks one course produces, BM25
finds the same passages in a millisecond for free. Locator matches are weighted
by rarity, so "explain page 17 again" pulls page 17 rather than every chunk that
contains the word "page".

**Video → transcription API.** Browsers can't transcode media, so audio and
video are sent to OpenAI's transcription endpoint (25 MB cap) and need an OpenAI
key even if your tutor runs on another provider. Timestamped segments become
`14:20`-style locators.

## Layout

```
src/lib/
  actions.ts          the twelve actions + the forgiving normalizer
  stream-json.ts      incremental JSON object extraction from a token stream
  expr.ts             sandboxed math parser for draw_plot (never eval)
  keys.ts  db.ts      browser key vault, IndexedDB stores
  providers/          anthropic · openai · google · openrouter, one interface
  materials/          extract → chunk → retrieve
  tutor/              prompts (the teaching contract) + engine (a turn)
  useTutor.ts         session state machine
src/components/
  board/              Whiteboard, BoardCard, Diagram, Plot, Equation
  app/                Sidebar, ChatRail, SettingsModal, QuizPanel
  landing/BoardDemo   the landing page runs the real renderer on a canned lesson
```

## Not built

No accounts, no sync across devices, no teacher dashboard, no native app — all
non-goals in the PRD. Spaced repetition is stubbed out at "quiz me on what I
missed" rather than a scheduled review queue.
