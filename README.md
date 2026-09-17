# TUTOR AI — a tutor that teaches on a whiteboard

Upload your own study material, get a 1:1 lesson worked out step by step on a
live whiteboard, interrupt whenever you're lost, and quiz yourself on what you
actually uploaded. It runs on **your** API key — Anthropic, OpenAI, Google, or
OpenRouter — so there's no subscription and no markup on inference.

Built from [`PRD-ai-tutor.md`](./PRD-ai-tutor.md).

```bash
npm install
docker run -d --name tutorai-pg -e POSTGRES_PASSWORD=tutorai \
  -e POSTGRES_USER=tutorai -e POSTGRES_DB=tutorai -p 55432:5432 postgres:16-alpine
cp .env.example .env          # DATABASE_URL, storage dir, key secret
npm run migrate               # applies migrations/*.sql once each
npm run dev                   # http://localhost:3000
npm test                      # 72 checks
npm run build
```

Needs Node 20+ and a Postgres. On Railway, set `DATABASE_URL` from the Postgres
service, point `TUTOR_AI_STORAGE_DIR` at a mounted volume, and set
`TUTOR_AI_KEY_SECRET` to a long random string (`openssl rand -base64 48`).
Without that last one the server refuses to store keys and the option
disappears from Settings — it will never fall back to storing them in plaintext.

---

## Deploying to Railway

`railway.json` carries the whole build and deploy config, so the only manual
steps are the ones Railway can't infer.

1. **New project → Deploy from GitHub repo**, pointed at this repository.
2. **Add a Postgres service** (`+ New → Database → PostgreSQL`).
3. In the app service's **Variables**, add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `TUTOR_AI_KEY_SECRET` | output of `openssl rand -base64 48` |

4. **Attach a volume** to the app service (`+ New → Volume`). Any mount path
   works — it's read from `RAILWAY_VOLUME_MOUNT_PATH` automatically.

Everything else configures itself:

- **Migrations** run in `preDeployCommand`, against the live database, before
  the new version takes traffic. A failed migration stops the deploy and the
  old version keeps serving.
- **Node 20+** is pinned via `engines` and `.nvmrc`; the build fails loudly
  rather than tripping over Next 16's runtime requirement.
- **Uploads** go to the mounted volume, detected at boot.
- **`/api/health`** is the healthcheck target. It returns 503 while anything
  required is missing — an unreachable database, or a database nobody has
  migrated — so a broken deploy never takes traffic. Degraded-but-working
  states report in the body without failing the check.

The two optional pieces degrade rather than break. No volume means uploaded
originals are lost on each redeploy (lessons and chunks still live in
Postgres). No `TUTOR_AI_KEY_SECRET` means the key vault is disabled and
students re-enter their API key per device; the server will never fall back to
storing keys in plaintext.

Check a running deployment with `curl https://your-app.up.railway.app/api/health`.

## The split: your account holds the work, your browser holds the key

The PRD left key storage open. This build splits it, and the split is the whole
architecture:

| | Where it lives |
|---|---|
| **Your API key** | Used straight from your browser to the provider — no server in the request path. Optionally also kept on your account, AES-256-GCM encrypted, so you aren't pasting it again on every device. That's a checkbox in Settings, and unticking it deletes the stored copy. |
| **Your material, lessons, cards, calendar** | Postgres, under your account, so a lesson started on a laptop resumes on a phone. |
| **Original files** | A mounted volume, one directory per material. |
| **Parsing** | Still the browser — pdf.js, mammoth, JSZip. Files are uploaded to be kept, not to be read. |

Live voice is the one place a key must reach the server regardless: WebRTC
can't carry a raw key safely, so it is posted once to mint a ~60-second session
token and is never written down.

The honest costs, all three stated in the UI. Browser storage is readable by any
script on the origin, so Settings says so and offers session-only storage for
shared machines. Your coursework sits on a server — which is what makes
cross-device study work, and why deleting a material or an account is a cascade
that leaves nothing behind. And if you turn on key syncing, we hold your
provider key: encrypted under a secret that lives in the environment rather than
the database, so a stolen dump decrypts nothing, but held all the same.

## How a lesson works

```
student message
   → retrieve.ts        BM25 + cosine, fused by rank → the excerpts that matter
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
- **Voice** — the tutor reads each line as it streams onto the board (browser
  speech synthesis, no keys), and you answer with your voice: the mic pauses
  while the tutor speaks and resumes after, so you can interrupt a lesson
  hands-free. Live questions sent by voice queue until the turn settles.
- **BYOK** — four providers, key validation before use, per-session model
  choice, any custom model id, live cost estimate from the model price table.
- **Practice** — a dedicated flashcards page (`/quiz`): pick material, topic,
  and question count, then generate as many quizzes as you like, one flashcard
  at a time, with optional read-aloud. Every answered question becomes a
  review card (SM-2-lite scheduling), "teach me this one" hands the question
  to the live board, and a Progress panel tracks per-material mastery, quiz
  history, and the due forecast.
- **Sessions** — saved to your account, resumable on any device, board and all,
  and exportable as Markdown notes (display math, real tables, mermaid diagrams,
  source citations) so a lesson survives the tab closing.
- **Exam review** — photograph a marked paper and the tutor goes through it
  question by question: what you wrote, what went wrong *in your working*, and
  what to do differently. A question it can't read off the photo is marked
  unclear and excluded from the score rather than guessed at — telling a student
  they got something wrong when the page was blurry sends them to re-learn
  something they already knew. Anything you lost marks on goes to the board.
- **Practice exam** — pick one or more past lessons and get a full multi-section
  paper, weighted toward what you personally found hard: the questions you
  interrupted with mid-lesson, the cards you keep forgetting, the quizzes you
  failed. Sections page like a real exam, answers autosave, and grading happens
  server-side so the answer key never leaves the row.
- **Show your work** — sketch your attempt on the board with a pen or stylus and
  the tutor reads it, marking up the step that went wrong instead of handing you
  the answer.
- **Subjects** — folders for Maths, English, Science. File material *and* past
  lessons into one, and a lesson in that folder can draw on everything in it:
  ask about last week's topic mid-lesson and the tutor already has the notes.
- **Calendar** — group material by class; add an exam with the topics
  it covers, or import them from your syllabus, and get a study plan worked
  backwards from the date: every topic twice, then a full review the day before.
- **Live voice** — a speech-to-speech session (OpenAI Realtime over WebRTC)
  where you talk and it explains out loud while writing on the board.
- **Accounts** — email and password, scrypt-hashed, opaque session tokens, and
  an optional encrypted key vault so your provider key follows you between
  devices.
- **Light / dark chrome** — a sun/moon toggle on every page; follows the OS
  until you choose, applies before first paint (no flash), and the whiteboard
  keeps its own paper/chalk look regardless.

### Retrieval, in two rankers

BM25 handles locators and exact terminology — "explain page 17 again" pulls page
17, because locator matches are weighted by rarity. It fails on paraphrase: "why
does entropy always go up" matches nothing in notes that say "the second law",
and not knowing the vocabulary is the reason a student is asking.

So chunks are also embedded, through *your* provider (about $0.00002 a page)
rather than by shipping a 25 MB transformer to the browser. The two rankings are
fused by reciprocal rank, not by blending scores — those are on different
scales. Anthropic has no embedding endpoint, so a Claude-only user gets BM25:
worse at paraphrase, not broken.

**Video → transcription API.** Browsers can't transcode, but they *can* decode.
A recording is decoded, the video track dropped, downmixed to 16 kHz mono
(Whisper resamples there anyway), and cut into chunks that each fit under the
25 MB cap — transcribed in sequence with timestamps shifted back onto the
original clock. Needs an OpenAI key even if your tutor runs elsewhere.

## Layout

```
src/lib/
  actions.ts          the twelve actions + the forgiving normalizer
  planner.ts          exam date → study plan (pure, unit-tested)
  weakpoints.ts       lessons → what you're actually weak at (pure, unit-tested)
  exam.ts             practice exam shape + marking (pure, unit-tested)
  exam-review.ts      reading a marked paper back (pure, unit-tested)
  export.ts           lesson → Markdown notes (pure, unit-tested)
  server/             db pool, auth, repository, volume storage
  materials/embed.ts  embeddings via the student's own provider
  materials/audio.ts  video → 16 kHz mono WAV chunks under the cap
  stream-json.ts      incremental JSON object extraction from a token stream
  expr.ts             sandboxed math parser for draw_plot (never eval)
  srs.ts              SM-2-lite review scheduling (pure, unit-tested)
  progress.ts         mastery blend + due forecast (pure, unit-tested)
  voice.ts            tutor TTS + student mic (Web Speech API, no keys)
  settings.ts         shared provider/model choice for board + flashcards
  keys.ts  db.ts      browser key vault, API client for the account's data
  providers/          anthropic · openai · google · openrouter, one interface
  materials/          extract → chunk → retrieve
  tutor/              prompts (the teaching contract) + engine (a turn)
  useTutor.ts         session state machine
  useQuizLab.ts       the flashcards page: unlimited quizzes → review cards
src/app/quiz/         the flashcards page — quizzes live here, not in a modal
src/components/
  board/              Whiteboard, BoardCard, Diagram, Plot, Equation
  app/                Sidebar, ChatRail (with mic), SettingsModal,
                      ReviewModal, ProgressPanel
  landing/BoardDemo   the landing page runs the real renderer on a canned lesson
```

## Not built

No teacher dashboard, no native app, no OAuth or password reset yet. Review cards come from quizzes you actually took; there's
no streak counter and no daily-goal gamification. Voice runs on whatever the
browser ships (Chrome/Edge are best); there's no premium TTS provider option.
