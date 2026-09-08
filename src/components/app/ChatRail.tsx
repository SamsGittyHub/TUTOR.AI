"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TutorAction } from "@/lib/actions";
import type { TranscriptEntry } from "@/lib/db";
import type { TutorStatus } from "@/lib/useTutor";

interface Props {
  actions: TutorAction[];
  transcript: TranscriptEntry[];
  status: TutorStatus;
  onSend: (message: string) => void;
  onStop: () => void;
  disabled?: boolean;
  /** Live voice: mic state comes from the useVoice hook. */
  micSupported?: boolean;
  micOn?: boolean;
  speaking?: boolean;
  interim?: string;
  micError?: string | null;
  onToggleMic?: () => void;
}

interface ChatItem {
  who: "student" | "tutor";
  text: string;
  key: string;
}

/**
 * Rebuilds the conversation from two sources that grow independently: the
 * student's own messages (transcript) and the tutor's `say` actions (which
 * arrive mid-stream, ahead of the transcript entry that summarizes the turn).
 * Turns are delimited by the `done` action that closes each one.
 */
function buildChat(actions: TutorAction[], transcript: TranscriptEntry[]): ChatItem[] {
  const turns: TutorAction[][] = [];
  let current: TutorAction[] = [];
  for (const action of actions) {
    current.push(action);
    if (action.type === "done") {
      turns.push(current);
      current = [];
    }
  }
  if (current.length) turns.push(current);

  const studentMessages = transcript.filter((entry) => entry.role === "student");
  const items: ChatItem[] = [];
  const total = Math.max(turns.length, studentMessages.length);

  for (let i = 0; i < total; i += 1) {
    const student = studentMessages[i];
    if (student) {
      items.push({ who: "student", text: student.text, key: `u${i}` });
    }
    for (const action of turns[i] ?? []) {
      if (action.type === "say") {
        items.push({ who: "tutor", text: action.text, key: action.id });
      }
    }
  }
  return items;
}

const OPENERS = [
  "Explain that again, slower",
  "Give me another example",
  "Why does that step work?",
  "Skip ahead",
];

export function ChatRail({
  actions,
  transcript,
  status,
  onSend,
  onStop,
  disabled,
  micSupported,
  micOn,
  speaking,
  interim,
  micError,
  onToggleMic,
}: Props) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const items = useMemo(() => buildChat(actions, transcript), [actions, transcript]);

  const suggestions = useMemo(() => {
    for (let i = actions.length - 1; i >= 0; i -= 1) {
      const action = actions[i];
      if (action.type === "done" && action.suggestions?.length) return action.suggestions;
    }
    return items.length ? OPENERS.slice(0, 3) : [];
  }, [actions, items.length]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [items.length, status]);

  const busy = status === "thinking" || status === "teaching";

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    onSend(value);
    setDraft("");
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-panel">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-sm font-extrabold">Ask anything</span>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted transition hover:border-pink/60 hover:text-pink"
          >
            ■ stop
          </button>
        ) : (
          <span className="text-xs font-semibold text-dim">interrupt any time</span>
        )}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {items.length === 0 ? (
          <p className="mt-6 text-sm leading-relaxed text-dim">
            Your tutor talks here while it writes on the board. Cut in whenever —
            asking a question mid-lesson is the point.
          </p>
        ) : (
          items.map((item) =>
            item.who === "student" ? (
              <div key={item.key} className="flex justify-end">
                <p className="max-w-[85%] rounded-lg rounded-br-xs grad px-3.5 py-2 text-[13.5px] font-semibold leading-relaxed text-white">
                  {item.text.replace(/^\(answering "(.*)"\)\s*/, "")}
                </p>
              </div>
            ) : (
              <div key={item.key} className="flex gap-2.5">
                <span className="mt-1 h-6 w-6 shrink-0 rounded-full grad" />
                <p className="max-w-[88%] text-[13.5px] leading-relaxed text-fg/90">
                  {item.text}
                </p>
              </div>
            ),
          )
        )}
        {status === "thinking" ? (
          <div className="flex items-center gap-2 pl-9">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="thinking-dot h-1.5 w-1.5 rounded-full bg-cyan"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </div>
        ) : null}
      </div>

      {suggestions.length ? (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-line px-3 py-2">
          {suggestions.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy || disabled}
              onClick={() => submit(suggestion)}
              className="rounded-full border border-line px-2.5 py-1 text-[11.5px] font-semibold text-muted transition hover:border-cyan/60 hover:text-fg disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
        className="shrink-0 border-t border-line p-3"
      >
        {micOn && interim ? (
          <p className="mb-1.5 truncate px-1 text-[11.5px] italic text-cyan">“{interim}…”</p>
        ) : null}
        {micError ? (
          <p className="mb-1.5 px-1 text-[11px] font-semibold text-pink">{micError}</p>
        ) : null}
        <div className="grad-border flex items-end gap-2 rounded-md bg-panel-2 p-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(draft);
              }
            }}
            rows={2}
            disabled={disabled}
            placeholder={
              disabled
                ? "Add an API key to start"
                : micOn
                  ? "Listening — or just type…"
                  : "Wait — where did that 2 come from?"
            }
            className="max-h-40 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-1 text-[13.5px] leading-relaxed outline-none placeholder:text-dim"
          />
          {micSupported && onToggleMic ? (
            <button
              type="button"
              onClick={onToggleMic}
              disabled={disabled}
              title={micOn ? "Stop listening" : "Ask with your voice"}
              aria-label={micOn ? "Stop listening" : "Ask with your voice"}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-30 ${
                micOn
                  ? "border-transparent bg-pink/20 text-pink"
                  : "border-line text-muted hover:border-line-2 hover:text-fg"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M5 11a7 7 0 0 0 14 0M12 18v3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy || disabled || !draft.trim()}
            className="grad flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-30"
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 12h15m0 0-6-6m6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {micOn ? (
          <p className="mt-1.5 px-1 text-[10.5px] font-semibold text-dim">
            {speaking ? "Tutor is speaking — mic paused" : "Listening — just start talking"}
          </p>
        ) : null}
      </form>
    </section>
  );
}
