# PRD: AI Tutor

**Version:** 1.0
**Owner:** Sami
**Status:** Draft

---

## 1. Summary

An AI tutoring web/mobile app where students upload their own study material (notes, slides, PDFs, textbooks, homework, video lectures) and an AI tutor teaches it step-by-step on an interactive whiteboard — explaining, drawing diagrams/equations, answering interruptions, and generating practice questions from that material.

**Key differentiator:** unlike existing products (e.g. Studdy AI), the user brings their own API key and chooses which AI model powers their tutor (Claude, GPT, Gemini, or others via OpenRouter/local models). This removes inference cost from the product owner and lets users pick the model that fits their budget, subject, or quality preference.

---

## 2. Problem & Motivation

- Students want 1:1, on-demand help with their *actual* coursework, not generic explanations.
- Existing AI tutoring products bundle a single model and its inference cost into the subscription price, capping how cheap or how powerful the experience can be.
- Letting users supply their own API key removes the cost bottleneck for the builder, gives users model choice/control, and makes the product viable as an indie/solo project without ongoing inference bills.

---

## 3. Goals

1. Replicate the core "upload material → AI tutor teaches on a whiteboard → ask/interrupt/practice" loop.
2. Support multiple AI providers (Anthropic, OpenAI, Google, OpenRouter) behind a single abstraction, selectable per user/session via their own API key.
3. Support material upload across common formats: PDF, PPT/PPTX, DOCX, images, and video lectures.
4. Generate practice questions/quizzes grounded in the uploaded material.
5. Ship a usable MVP before adding polish (see Phases, §9).

### Non-goals (v1)
- Building a full LMS (grading, classrooms, teacher dashboards).
- Live human tutor marketplace features.
- Supporting every possible AI provider on day one — start with 2–3.
- Mobile native apps (web-first, responsive; native app is a later phase).

---

## 4. Target Users

- High school and college students studying independently.
- Primary use cases: exam prep, homework help, learning a new topic from uploaded material, reviewing lecture content.
- Secondary: self-directed learners studying non-academic material (a manual, a guide, etc.).

---

## 5. Core Features

### 5.1 Material Upload & Ingestion
- Upload types: PDF, PPTX, DOCX, images (photos of notes/whiteboards), video lectures (with audio).
- Pipeline: type-specific extraction → text + page/slide images → chunking → embedding → storage (see §7.3).
- Video lectures: audio extraction → transcription (timestamped) → chunked like text.
- Each chunk retains a reference (material ID, page/slide/timestamp) so the tutor can cite where an explanation came from.

### 5.2 AI Whiteboard Tutor
- Core loop: user picks/uploads material (or asks a general question) → tutor builds a lesson plan → teaches step-by-step on a canvas whiteboard (text, equations via LaTeX, diagrams, highlights, erasures).
- Whiteboard state is structured data (a sequence of actions), rendered progressively client-side — not a video — so it feels like it's being drawn live.
- User can interrupt at any point: ask a question, request another example, say "explain that again," or skip ahead.
- Tutor maintains session state (current topic, step index, whiteboard history) so interruptions are contextual.

### 5.3 BYOK Model Selection
- User provides their own API key for one or more providers (Anthropic, OpenAI, Google, OpenRouter as a catch-all for others).
- User selects active provider/model per session (or sets a default).
- Key validated with a lightweight test call before use; encrypted at rest; never logged; never sent anywhere but the provider's own API.
- Provider abstraction layer normalizes each model's output into the same "tutor action" schema, so the whiteboard/UI doesn't need to know which model is behind it.
- Clear UX handling for weaker/cheaper models that may produce lower-quality structured output (fallback prompting/repair, see §7.2).

### 5.4 Practice & Review
- Tutor generates practice questions/quizzes sourced from the user's own uploaded material (not generic question banks).
- Walks through missed questions the same way it teaches (whiteboard step-by-step).
- Optional: spaced review / "test again on what you missed."

### 5.5 Session & History
- Persist sessions per material (resume a lesson later).
- History of past lessons/quizzes per material or topic.

---

## 6. User Stories

- As a student, I upload a PDF of my chemistry notes and the tutor teaches me the material at my pace.
- As a student, I ask "explain that again" mid-lesson and the tutor re-explains without losing my place.
- As a student, I paste in a homework problem and get a step-by-step walkthrough, not just the answer.
- As a student, I want to use my own OpenAI/Claude key so I'm not paying a markup on inference, and I can pick a cheaper model for easy subjects and a stronger one for hard ones.
- As a student, before a test, I ask the tutor to quiz me on my uploaded notes and walk me through what I get wrong.

---

## 7. Technical Architecture

### 7.1 High-Level Components
- **Frontend:** Next.js/React app. Canvas whiteboard (tldraw/Excalidraw/Konva) + KaTeX/MathJax for equations. Chat/interrupt UI alongside the whiteboard.
- **Backend:** API routes for session management, material ingestion pipeline, provider abstraction layer, key storage/encryption.
- **Storage:** Object storage (S3/R2) for original files + extracted text/images. Vector DB (pgvector/Chroma) for embedded chunks. Relational DB (Postgres) for users, sessions, whiteboard history, material metadata.

### 7.2 Provider Abstraction Layer
- Common `TutorProvider` interface: `streamTutorTurn()`, `validateKey()`.
- Each provider implementation (Anthropic, OpenAI, Google, OpenRouter) maps its native tool-use/function-calling format to the shared **tutor-action schema** (write_text, write_equation, draw_diagram, highlight, erase, ask_question, etc.), each action carrying an ID for later reference and a `source_refs` link back to material chunks.
- For models without reliable native tool-use: prompt for raw JSON matching the schema, then validate/repair against a JSON schema parser before rendering; degrade gracefully (e.g. fall back to plain text explanation if structured output repeatedly fails).

### 7.3 Material Ingestion Pipeline
```
Upload (PDF/PPT/DOCX/image/video)
  → type-specific extractor (pdf-parse/pdfjs, mammoth, pptx-parser, Whisper for video audio)
  → chunk (~500–1000 tokens, by page/slide/topic)
  → embed → vector DB, tagged with material_id + page/slide/timestamp
  → retrieval at lesson time: top-k relevant chunks injected as materialContext (or full-context stuffing for short materials)
```

### 7.4 Security & Key Handling
- API keys encrypted at rest (e.g. per-user envelope encryption), never stored in plaintext, never logged, never exposed to the frontend after initial entry.
- Keys used only for direct calls to the provider's API from the backend (or client-side direct-to-provider calls, if avoiding server-side key handling entirely — worth an explicit decision, see Open Questions).

---

## 8. Non-Functional Requirements

- **Latency:** whiteboard actions should stream progressively (not wait for a full response) to preserve the "live teaching" feel.
- **Cost transparency:** since users bring their own key, show estimated token usage/cost per session where the provider supports it.
- **Reliability:** graceful degradation when a model's structured output fails validation (retry, repair, or fallback to plain text).
- **Privacy:** uploaded material and API keys are user data — clear handling/deletion policy needed (see Open Questions).

---

## 9. Phased Rollout

**Phase 1 — MVP core loop**
- Chat + whiteboard rendering with a single hardcoded provider.
- Manual text input only (no file upload yet).

**Phase 2 — Whiteboard polish**
- Structured tutor-action schema fully implemented with progressive rendering, equations, diagrams, highlight/erase.

**Phase 3 — BYOK**
- Provider abstraction layer live for 2–3 providers.
- Key entry, validation, encrypted storage, per-session model selection.

**Phase 4 — Material upload**
- PDF/PPTX/DOCX/image upload → ingestion pipeline → tutor teaches from material with source citations.

**Phase 5 — Practice & history**
- Quiz generation from material, review flow, session history/resume.

**Phase 6 — Video lecture support & polish**
- Video upload/transcription, UI polish, cost display, mobile responsiveness.

---

## 10. Success Metrics

- Session completion rate (user finishes a lesson vs. drops off).
- Return usage (comes back to study a different topic/material).
- % of lessons where user interrupts/asks follow-ups (engagement signal).
- Quiz accuracy improvement across repeated attempts on the same material.

---

## 11. Open Questions

- Server-side key storage vs. client-side-only (browser stores key, calls provider directly) — the latter avoids you ever touching user keys, at the cost of some backend simplicity (e.g. can't do server-side retrieval augmentation as easily).
- Which providers to support at Phase 3 launch (recommend starting with Anthropic + OpenAI, add OpenRouter for broad/local-model coverage).
- Data retention policy for uploaded material — how long stored, user-deletable, encrypted at rest?
- Pricing model, if any, beyond BYOK (e.g. free tier with rate limits, or fully free since inference cost is offloaded to the user).
