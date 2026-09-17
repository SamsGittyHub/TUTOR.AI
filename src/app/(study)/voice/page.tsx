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
import { buildBriefing, runVoiceTool, type VoiceContext } from "@/lib/voice-tools";

/**
 * Live voice: talk to the tutor, watch it write.
 *
 * This is the one place the board is driven by speech rather than a typed
 * turn. The instructions below are a trimmed version of the streaming
 * protocol — a realtime model has to keep talking while it emits JSON, so it
 * is asked for far fewer board actions per turn than the text tutor.
 */

const INSTRUCTIONS = `You are a patient tutor talking with one student out loud.

Speak naturally and briefly — two or three sentences at a time, then stop and
let them respond. Never lecture for a minute straight. If they cut in, stop and
listen; being interrupted is the point of talking rather than reading.

You have a whiteboard the student is looking at. Call write_on_board to put
something on it — an equation, a title, the steps of a worked example — while
you carry on speaking. Never read the JSON aloud and never mention the board
tool; from their side, things simply appear as you explain them. At most one or
two cards per reply: the board supports what you're saying, it isn't a
transcript of it.

You can also see their work. Call search_material before answering anything
that touches their own notes, slides or lecture transcripts — teach from what
they actually have, name the file it came from, and don't fall back on general
knowledge when their material covers it. get_progress tells you where they're
strong and weak; list_lessons tells you what they've already been taught, so
you can build on it rather than repeat it.

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

  const context: VoiceContext = useMemo(
    () => ({
      materials: lib.materials,
      chunks,
      sessions: lib.sessions,
      courses: lib.courses,
      cards: lib.cards,
      attempts: lib.attempts,
      papers: lib.papers,
    }),
    [lib.materials, chunks, lib.sessions, lib.courses, lib.cards, lib.attempts, lib.papers],
  );

  const onAction = useCallback((action: TutorAction) => {
    setActions((list) => [...list, action]);
  }, []);

  const onTranscript = useCallback((role: "student" | "tutor", text: string) => {
    setLines((list) => [...list, { role, text }]);
  }, []);

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
