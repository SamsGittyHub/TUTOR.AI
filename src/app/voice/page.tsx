"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AppNav } from "@/components/shell/AppNav";
import { Whiteboard } from "@/components/board/Whiteboard";
import type { TutorAction } from "@/lib/actions";
import { loadKeys, pullAccountKeys } from "@/lib/keys";
import { loadSettings } from "@/lib/settings";
import { useRealtime } from "@/lib/useRealtime";

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
let them respond. Never lecture for a minute straight.

Alongside speaking, you may write on a whiteboard the student is looking at.
To write, emit a single JSON object on its own line in your TEXT output (never
speak the JSON aloud):

{"type":"write_text","id":"t1","text":"Integration by parts","style":"title","color":"ink"}
{"type":"write_equation","id":"e1","latex":"\\\\int u\\\\,dv = uv - \\\\int v\\\\,du","color":"cyan"}
{"type":"write_steps","id":"s1","title":"Worked example","color":"ink","steps":[{"text":"Pick u","latex":"u = x"}]}

Raw LaTeX only, no $ delimiters. Write at most one or two cards per reply — the
board is support for what you're saying, not a transcript of it.`;

export default function VoicePage() {
  const [actions, setActions] = useState<TutorAction[]>([]);
  const [lines, setLines] = useState<{ role: "student" | "tutor"; text: string }[]>([]);
  const [theme, setTheme] = useState<"paper" | "chalk">("paper");
  const [keyMissing, setKeyMissing] = useState(false);

  const onAction = useCallback((action: TutorAction) => {
    setActions((list) => [...list, action]);
  }, []);

  const onTranscript = useCallback((role: "student" | "tutor", text: string) => {
    setLines((list) => [...list, { role, text }]);
  }, []);

  const rt = useRealtime({ onAction, onTranscript });

  // Live voice can be the first page someone opens; pull the stored key so
  // "Start talking" doesn't bounce them to Settings for a key they already have.
  useEffect(() => {
    void pullAccountKeys();
  }, []);

  function begin() {
    const keys = loadKeys();
    const openaiKey = keys.openai;
    if (!openaiKey) {
      setKeyMissing(true);
      return;
    }
    setKeyMissing(false);
    void rt.start(openaiKey, INSTRUCTIONS);
  }

  const live = rt.status === "live";

  return (
    <div className="flex h-dvh flex-col bg-ink">
      <AppNav />

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

        <aside className="flex w-full shrink-0 flex-col rounded-md border border-line bg-panel lg:w-[340px]">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-extrabold text-fg">Live voice</h2>
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
                  <li key={i}>
                    <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-dim">
                      {line.role === "student" ? "you" : "tutor"}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-fg">
                      {line.text}
                    </p>
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
                className="w-full rounded-full border border-line px-5 py-3 text-[13px] font-extrabold text-muted transition hover:border-pink/50 hover:text-pink"
              >
                End session
              </button>
            ) : (
              <button
                type="button"
                onClick={begin}
                disabled={rt.status === "connecting"}
                className="w-full rounded-full grad px-5 py-3 text-[13px] font-extrabold text-white transition hover:opacity-90 disabled:opacity-50"
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
