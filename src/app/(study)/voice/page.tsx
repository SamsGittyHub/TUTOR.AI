"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Whiteboard } from "@/components/board/Whiteboard";
import type { TutorAction } from "@/lib/actions";
import { BETA } from "@/lib/beta";
import { loadKeys, pullAccountKeys } from "@/lib/keys";
import { loadSettings } from "@/lib/settings";
import { getChunksFor, type MaterialChunk } from "@/lib/db";
import { useLibrary } from "@/lib/useLibrary";
import { useRealtime } from "@/lib/useRealtime";
import type { ImageRequest } from "@/lib/board-image";
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

Call write_on_board with an "actions" array of JSON objects. Every object needs
a short unique "id". These are the card types:

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
- **Draw the thing.** A diagram for a process, a plot for a shape, a table for a
  comparison, draw_image for anything real — apparatus, anatomy, a map, a
  mechanism, a photograph of the object you're describing. If the student would
  understand faster from seeing it, draw it before explaining it.
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
search_material function".`;

export default function VoicePage() {
  const [actions, setActions] = useState<TutorAction[]>([]);
  const [lines, setLines] = useState<{ role: "student" | "tutor"; text: string }[]>([]);
  const [theme, setTheme] = useState<"paper" | "chalk">("paper");
  const [keyMissing, setKeyMissing] = useState(false);

  // Everything the tutor is allowed to know about this student. Loaded up
  // front so a lookup mid-sentence is a local search, not a round trip.
  const lib = useLibrary();
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

  /**
   * Puts a picture on the board.
   *
   * The card goes up empty straight away and fills in when the image model
   * comes back, because generation takes seconds the conversation can't wait
   * for — the tutor carries on talking over a card that says what's coming.
   */
  const drawImage = useCallback((request: ImageRequest) => {
    const id = `img-${crypto.randomUUID()}`;
    setActions((list) => [
      ...list,
      { type: "show_image", id, prompt: request.prompt, caption: request.caption },
    ]);

    const settle = (patch: Partial<Extract<TutorAction, { type: "show_image" }>>) =>
      setActions((list) =>
        list.map((a) => (a.id === id && a.type === "show_image" ? { ...a, ...patch } : a)),
      );

    void (async () => {
      try {
        const response = await fetch("/api/images", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...request,
            apiKey: BETA ? undefined : (loadKeys().openai ?? ""),
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.src) {
          settle({ error: body.error ?? "That drawing didn't come through." });
          return;
        }
        settle({ src: body.src, width: body.width, height: body.height });
      } catch {
        settle({ error: "That drawing didn't come through." });
      }
    })();
  }, []);

  const onTranscript = useCallback((role: "student" | "tutor", text: string) => {
    setLines((list) => [...list, { role, text }]);
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
    }),
    [lib.materials, chunks, lib.sessions, lib.courses, lib.cards, lib.attempts, lib.papers, drawImage],
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
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-semibold text-fg">Live voice</h2>
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
