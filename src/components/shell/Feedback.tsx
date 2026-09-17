"use client";

import { usePathname } from "next/navigation";

import { useLanguage } from "@/lib/language";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Telling us what's wrong, from inside the thing that's wrong.
 *
 * The whole point of the free beta is hearing what breaks, and there was no
 * way to say so without leaving the app. Which page they were on travels with
 * the message: "it didn't work" costs a round trip to become useful, and a
 * tester who has to be asked a follow-up question usually doesn't answer it.
 */

interface Props {
  /** The lesson open at the time, when there is one. */
  lessonId?: string;
  /** Bordered, for headers whose other controls are bordered buttons. */
  compact?: boolean;
}

export function Feedback({ lessonId, compact = false }: Props) {
  const pathname = usePathname();
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const send = useCallback(async () => {
    if (message.trim().length < 3) return;
    setState("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, path: pathname, lessonId }),
      });
      if (!response.ok) throw new Error("failed");
      setState("sent");
      setMessage("");
      // Long enough to read the thank-you, short enough not to linger.
      window.setTimeout(() => {
        setOpen(false);
        setState("idle");
      }, 1600);
    } catch {
      setState("error");
    }
  }, [message, pathname, lessonId]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={language.t("feedback.title")}
        aria-label={language.t("feedback.open")}
        aria-expanded={open}
        className={`tx press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--tint)] hover:text-fg ${
          compact ? "border border-line" : ""
        } ${open ? "bg-[var(--tint-strong)] text-fg" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M21 12a8 8 0 0 1-8 8H8l-4 3v-4.6A8 8 0 1 1 21 12Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="surface-2 raised pop-in absolute right-0 top-10 z-[60] w-[min(20rem,calc(100vw-1.5rem))] rounded-md p-3">
          {state === "sent" ? (
            <p className="px-1 py-3 text-center text-[13px] font-semibold text-good">
              {language.t("feedback.sent")}
            </p>
          ) : (
            <>
              <p className="px-1 text-[12.5px] leading-relaxed text-muted">
                {language.t("feedback.lede")}
              </p>
              <textarea
                ref={field}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void send();
                }}
                rows={4}
                placeholder={language.t("feedback.placeholder")}
                className="mt-2 w-full resize-none rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none transition placeholder:text-dim focus:border-line-2"
              />
              {state === "error" ? (
                <p role="alert" className="mt-1 px-1 text-[11.5px] font-semibold text-pink">
                  {language.t("feedback.failed")}
                </p>
              ) : null}
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="tx rounded-full px-3 py-1.5 text-[12.5px] font-medium text-muted hover:text-fg"
                >
                  {language.t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void send()}
                  aria-label="Send this feedback"
                  disabled={message.trim().length < 3 || state === "sending"}
                  className="grad press rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
                >
                  {language.t(state === "sending" ? "feedback.sending" : "feedback.send")}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
