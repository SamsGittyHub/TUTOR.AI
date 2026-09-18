"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Whiteboard } from "@/components/board/Whiteboard";
import type { TutorAction } from "@/lib/actions";
import { BETA } from "@/lib/beta";
import { loadKeys, pullAccountKeys } from "@/lib/keys";
import { loadSettings } from "@/lib/settings";
import { BETA_REALTIME_MODEL } from "@/lib/beta";
import { BoardExport } from "@/components/board/BoardExport";
import {
  getChunksFor, getSession, putSession,
  type MaterialChunk, type Session,
} from "@/lib/db";
import { useLibrary } from "@/lib/useLibrary";
import { useRealtime } from "@/lib/useRealtime";
import { applyDrawnImage, type ImageRequest } from "@/lib/board-image";
import { planImage, requestImage } from "@/lib/draw-image";
import { useLearning } from "@/lib/useLearning";
import { buildBriefing, runVoiceTool, type VoiceContext } from "@/lib/voice-tools";

/**
 * Live voice: talk to the tutor, watch it write.
 *
 * This is the one place the board is driven by speech rather than a typed
 * turn. The tutor gets the same board vocabulary as the text one plus an image
 * model, and is pushed to use all of it: a spoken explanation vanishes as it's
 * said, so the board has to hold everything the student will want to re-read.
 */

const BOARD_SCHEMA = `## The board

Call write_on_board with "actions": one JSON object per line, nothing else on
the line. Every object needs a short unique "id". These are the card types:

{"type":"write_text","id":"h1","text":"Integration by parts","style":"title","color":"ink"}
  style: "title" | "body" | "note". color: ink | cyan | pink | amber | green | violet.

{"type":"write_equation","id":"eq1","latex":"\\\\int u\\\\,dv = uv - \\\\int v\\\\,du","label":"the formula","color":"cyan"}
  Raw LaTeX only — no $ or \\\\[ delimiters, they render as literal characters.

{"type":"write_steps","id":"w1","title":"Worked example","color":"ink","steps":[
  {"text":"Choose u and dv","latex":"u = x,\\\\quad dv = e^x dx","note":"pick u so du is simpler"},
  {"text":"Differentiate and integrate","latex":"du = dx,\\\\quad v = e^x"}]}
  Each step may carry text, latex, note — any combination. This is where the
  real work goes: one line per move, never a jump to the answer.

{"type":"write_table","id":"tb1","title":"Comparison","headers":["Method","Use when"],"rows":[["Substitution","one function inside another"],["By parts","a product of two kinds"]]}

{"type":"draw_diagram","id":"d1","title":"Cell respiration","layout":"flow","nodes":[
  {"id":"a","label":"Glucose","shape":"round","color":"cyan"},
  {"id":"b","label":"Pyruvate","shape":"box","color":"ink"}],
 "edges":[{"from":"a","to":"b","label":"glycolysis"}]}
  layout: "flow" (top to bottom) | "row" (left to right) | "cycle" | "tree".
  shape: box | round | circle | diamond.

{"type":"draw_plot","id":"p1","title":"f(x) = x² - 3x","xRange":[-2,5],"curves":[{"expr":"x^2 - 3*x","label":"f(x)","color":"cyan"}],"points":[{"x":1.5,"y":-2.25,"label":"vertex","color":"pink"}]}
  expr is plain math in x: + - * / ^ ( ), and sin cos tan sqrt abs exp ln log.
  No LaTeX in expr.

{"type":"ask_question","id":"q1","question":"What should u be here?","choices":["x","e^x"],"answer":"x","explanation":"du = dx is simpler than what we started with."}
  A check for understanding. Omit "choices" for an open question.

{"type":"highlight","id":"hl1","targetId":"eq1","note":"this is the part that flips sign"}
  Marks something already up there. targetId must be an id you wrote earlier.
  Use it constantly — pointing at the board is most of teaching at one.

{"type":"erase","id":"er1","targetId":"w1"}
  Clears a card when it has served its purpose or was wrong.

For a picture — anything the shapes above can't draw — call draw_image instead.`;

const INSTRUCTIONS = `You are a patient tutor talking with one student out loud,
at a whiteboard you are both looking at.

Speak naturally and briefly — two or three sentences at a time, then stop and
let them respond. Never lecture for a minute straight. If they cut in, stop and
listen; being interrupted is the point of talking rather than reading.

${BOARD_SCHEMA}

## Fill the board

Your voice is short. The board is not. Everything you say out loud should have
something written under it, and a student who looks away for a minute should be
able to catch up from the board alone.

- **Write constantly.** A card for the topic, a card for the idea, the working
  line by line, the result, and a summary at the end. Several cards per call,
  several calls per explanation. A board that has one equation on it after five
  minutes of talking is a failure.
- **Show the whole working.** write_steps with every line, not the first and
  last. The student cannot rewind your voice; they can re-read the board.
- **Draw the thing, and draw often.** A diagram for a process, a plot for a
  shape, a table for a comparison, and draw_image for anything real —
  apparatus, anatomy, a map, a mechanism, a specimen, the actual object you're
  describing. Reach for a picture whenever the subject is something a student
  could look at, which is most of the time; don't save it for special
  occasions. Draw it before explaining it, and talk over it while it appears —
  it arrives on its own, so never wait for it or announce that it's coming.
  The only subjects that don't want one are purely symbolic, like rearranging
  an equation.
- **Point at what you wrote.** highlight the line you're talking about as you
  talk about it, and erase a worked example before starting a new one.
- **Ask early.** ask_question every few minutes, right after a new idea, not at
  the end.

Never read the JSON aloud and never mention the board, the tools or the cards;
from the student's side, things simply appear as you explain them.

## Their own work

Call search_material before answering anything that touches their notes, slides
or lecture transcripts — teach from what they actually have, name the file it
came from, and don't fall back on general knowledge when their material covers
it. get_progress tells you where they're strong and weak; list_lessons tells you
what they've already been taught, so you build on it rather than repeat it.

Look things up quietly. Say "let me check your notes", not "I am calling the
search_material function".

When you work out something about how they learn — what makes it click, what
loses them — call remember_this so your next self knows it. One short, specific
sentence, only once you've seen it more than once, and never out loud.`;

export default function VoicePage() {
  const [actions, setActions] = useState<TutorAction[]>([]);
  const [lines, setLines] = useState<{ role: "student" | "tutor"; text: string }[]>([]);
  /*
   * What the drawing tool is paced against. null means nothing has been drawn
   * yet, which is the one state where a picture is always allowed.
   */
  const [pacing, setPacing] = useState<{
    questionsSincePicture: number | null;
    lastQuestion: string;
  }>({ questionsSincePicture: null, lastQuestion: "" });
  const [theme, setTheme] = useState<"paper" | "chalk">("paper");
  const [keyMissing, setKeyMissing] = useState(false);

  // Everything the tutor is allowed to know about this student. Loaded up
  // front so a lookup mid-sentence is a local search, not a round trip.
  const lib = useLibrary();
  const learning = useLearning();
  const [chunks, setChunks] = useState<MaterialChunk[]>([]);

  useEffect(() => {
    if (!lib.materials.length) return;
    let live = true;
    getChunksFor(lib.materials.map((m) => m.id))
      .then((loaded) => live && setChunks(loaded))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [lib.materials]);

  const onAction = useCallback((action: TutorAction) => {
    setActions((list) => [...list, action]);
  }, []);

  /* --- keeping the lesson ------------------------------------------------- */

  /*
   * A spoken lesson is still a lesson. It used to live only in this tab: close
   * it and the board it produced was gone, which is a strange thing to do to a
   * student who just spent twenty minutes being taught. It is now saved like a
   * typed one — same store, same Lessons list, same export buttons — created
   * lazily on the first card so an opened-and-abandoned page leaves nothing.
   */
  const sessionId = useRef<string | null>(null);
  const startedAt = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const boardRef = useRef({ actions, lines });
  boardRef.current = { actions, lines };

  /** Writes the board as it stands. Safe to call twice; the id is stable. */
  const saveNow = useCallback(() => {
    const { actions: cards, lines: said } = boardRef.current;
    if (!cards.length) return;
    if (!sessionId.current) {
      sessionId.current = `s_${crypto.randomUUID()}`;
      // Fixed once: re-stamping it on every save would make the lesson look
      // as though it had started the moment it was last touched.
      startedAt.current = Date.now();
    }

    const firstAsked = said.find((line) => line.role === "student")?.text;
    const session: Session = {
      id: sessionId.current,
      title: (firstAsked ?? "Live voice lesson").slice(0, 60),
      createdAt: startedAt.current,
      updatedAt: Date.now(),
      materialIds: [],
      providerId: "openai",
      model: BETA_REALTIME_MODEL,
      actions: cards,
      transcript: said.map((line) => ({
        role: line.role === "student" ? ("student" as const) : ("tutor" as const),
        text: line.text,
        at: Date.now(),
      })),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, turns: said.length },
      boardTheme: theme,
      mode: "voice",
    };
    void putSession(session).catch(() => {});
  }, [theme]);

  useEffect(() => {
    if (!actions.length) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(saveNow, 1500);
  }, [actions, lines, saveNow]);

  /*
   * Leaving mid-sentence must not lose the board — and until now this only
   * cancelled the pending write rather than completing it, so ending a
   * session within the debounce window dropped whatever had just been said
   * or drawn.
   */
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      saveNow();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [saveNow]);

  /*
   * Reopening a spoken lesson. Lessons links here rather than to the typed
   * board for anything taught out loud: the board comes back as it was, and
   * saving continues into the same record instead of forking a second copy of
   * the same lesson.
   */
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    const id = new URLSearchParams(window.location.search).get("session");
    if (!id) return;
    resumed.current = true;
    window.history.replaceState(null, "", "/voice");
    void getSession(id)
      .then((found) => {
        if (!found) return;
        sessionId.current = found.id;
        startedAt.current = found.createdAt;
        setActions(found.actions);
        setLines(
          found.transcript.map((entry) => ({
            role: entry.role === "student" ? ("student" as const) : ("tutor" as const),
            text: entry.text,
          })),
        );
        setTheme(found.boardTheme);
      })
      .catch(() => {});
  }, []);

  /**
   * Puts a picture on the board.
   *
   * The card goes up empty straight away and fills in when the image model
   * comes back, because generation takes seconds the conversation can't wait
   * for — the tutor carries on talking over a card that says what's coming.
   */
  const drawImage = useCallback((request: ImageRequest) => {
    const cardId = `img-${crypto.randomUUID()}`;
    // Same ordering as the typed board: the card carries its final URL from
    // the start, so ending the session mid-drawing doesn't lose the picture.
    const planned = planImage(request);
    setActions((list) => [
      ...list,
      {
        type: "show_image",
        id: cardId,
        prompt: request.prompt,
        caption: request.caption,
        src: planned.src,
        width: planned.width,
        height: planned.height,
      },
    ]);
    // The clock restarts when the picture is asked for, not when it arrives:
    // it's already on the board as a placeholder, and the student has seen it.
    setPacing((prev) => ({ ...prev, questionsSincePicture: 0 }));
    void requestImage(planned.id, request).then((result) => {
      if (result.error) {
        setActions((list) => applyDrawnImage(list, cardId, { error: result.error }));
      }
    });
  }, []);

  const onTranscript = useCallback((role: "student" | "tutor", text: string) => {
    setLines((list) => [...list, { role, text }]);
    if (role !== "student") return;
    setPacing((prev) => ({
      // Still null while nothing has been drawn — counting starts at the
      // first picture, not at the first question.
      questionsSincePicture:
        prev.questionsSincePicture === null ? null : prev.questionsSincePicture + 1,
      lastQuestion: text,
    }));
  }, []);

  const context: VoiceContext = useMemo(
    () => ({
      materials: lib.materials,
      chunks,
      sessions: lib.sessions,
      courses: lib.courses,
      cards: lib.cards,
      attempts: lib.attempts,
      papers: lib.papers,
      drawImage,
      learning: learning.profile,
      remember: learning.remember,
      pacing,
    }),
    [
      lib.materials, chunks, lib.sessions, lib.courses, lib.cards, lib.attempts,
      lib.papers, drawImage, learning.profile, learning.remember, pacing,
    ],
  );

  const contextRef = useRef(context);
  contextRef.current = context;

  const rt = useRealtime({
    onAction,
    onTranscript,
    // Read through a ref: the session is opened once, and a tool called twenty
    // minutes in should see the material as it is then, not as it was at
    // connect time.
    runTool: (name, args) => runVoiceTool(name, args, contextRef.current),
  });

  // Live voice can be the first page someone opens; pull the stored key so
  // "Start talking" doesn't bounce them to Settings for a key they already have.
  useEffect(() => {
    void pullAccountKeys();
  }, []);

  function begin() {
    // In beta the realtime token is minted with the server's key, so the
    // browser has nothing to send and nothing to be missing.
    const openaiKey = BETA ? "" : (loadKeys().openai ?? "");
    if (!BETA && !openaiKey) {
      setKeyMissing(true);
      return;
    }
    setKeyMissing(false);
    void rt.start(openaiKey, INSTRUCTIONS + buildBriefing(context));
  }

  const live = rt.status === "live";

  return (
    <div className="flex h-[calc(100dvh-53px)] flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        <div className="min-h-0 flex-1">
          <Whiteboard
            actions={actions}
            theme={theme}
            status={live ? "teaching" : "idle"}
            onAnswer={() => {}}
            onToggleTheme={() => setTheme((t) => (t === "paper" ? "chalk" : "paper"))}
            onClear={() => setActions([])}
            materialName={() => "material"}
            emptyState={
              <div className="text-center">
                <p className="hand text-[34px] leading-tight text-[var(--board-ink)]">
                  Just start talking.
                </p>
                <p className="mx-auto mt-3 max-w-sm text-[13.5px] leading-relaxed text-[var(--board-ink)] opacity-70">
                  The tutor listens continuously — interrupt it mid-sentence the
                  way you would a person. It writes here while it explains.
                </p>
              </div>
            }
          />
        </div>

        <aside className="flex w-full shrink-0 flex-col surface rounded-md lg:w-[340px]">
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="flex-1 text-[13px] font-semibold text-fg">Live voice</h2>
            <BoardExport
              actions={actions}
              title={
                lines.find((line) => line.role === "student")?.text.slice(0, 60) ??
                "Live voice lesson"
              }
              materialName={(id) =>
                lib.materials.find((m) => m.id === id)?.name ?? "material"
              }
            />
            <span
              className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
                live ? "text-good" : rt.status === "error" ? "text-pink" : "text-dim"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  live
                    ? rt.speaking
                      ? "animate-pulse bg-good"
                      : "bg-good"
                    : rt.status === "error"
                      ? "bg-pink"
                      : "bg-dim"
                }`}
              />
              {rt.status === "connecting" ? "connecting" : rt.status}
            </span>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {rt.error && (
              <p
                role="alert"
                className="mb-3 rounded-xs border border-pink/40 bg-pink/10 px-3 py-2 text-[12.5px] font-bold text-pink"
              >
                {rt.error}
              </p>
            )}
            {keyMissing && (
              <p className="mb-3 rounded-xs border border-warn/40 bg-warn/10 px-3 py-2 text-[12.5px] font-bold text-warn">
                Live voice runs on OpenAI&apos;s realtime model, so it needs an
                OpenAI key specifically.{" "}
                <Link href="/settings" className="underline">
                  Add one
                </Link>
                .
              </p>
            )}

            {!lines.length ? (
              <p className="text-[13px] leading-relaxed text-muted">
                {live
                  ? "Listening. Say what you're stuck on."
                  : "Start the session and talk — the transcript shows up here while the board fills in."}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {lines.map((line, i) => (
                  <li key={i} className="flex min-w-0 gap-2">
                    {line.role === "tutor" ? (
                      <Image
                        src="/tutor-avatar.png"
                        alt=""
                        width={22}
                        height={22}
                        className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full"
                      />
                    ) : (
                      <span className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full bg-[var(--tint-strong)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-dim">
                        {line.role === "student" ? "you" : "tutor"}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-fg [overflow-wrap:anywhere] whitespace-pre-wrap">
                        {line.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line p-3">
            {live ? (
              <button
                type="button"
                onClick={rt.stop}
                className="w-full rounded-full border border-line px-5 py-3 text-[13px] font-semibold text-muted transition hover:border-pink/50 hover:text-pink"
              >
                End session
              </button>
            ) : (
              <button
                type="button"
                onClick={begin}
                disabled={rt.status === "connecting"}
                className="w-full rounded-full grad px-5 py-3 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {rt.status === "connecting" ? "Connecting…" : "Start talking"}
              </button>
            )}
            <p className="mt-2 text-center text-[11px] leading-relaxed text-dim">
              Your mic streams straight to OpenAI. TUTOR AI only mints the session
              token — it never stores your key.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
