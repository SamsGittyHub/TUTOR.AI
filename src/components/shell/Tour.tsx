"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useLanguage } from "@/lib/language";
import { TOUR_STEPS } from "@/lib/tour";

/**
 * The question mark in the corner, and what's behind it.
 *
 * A student signing up is handed eleven destinations and no idea which of them
 * is the one that teaches. This is the answer to "what is all this?" — one
 * step per feature, each saying what it's for and what to actually do, with a
 * link that takes you there.
 *
 * It opens by itself exactly once, on a first visit, and is reachable from the
 * corner of every page after that. Deliberately not a spotlight overlay
 * pointing at live elements: those break the moment a page's layout changes,
 * and a tour that points at the wrong thing is worse than no tour.
 */

const SEEN_KEY = "tutor-ai.tour-seen";

export function Tour({ compact = false }: { compact?: boolean }) {
  const language = useLanguage();
  // The English in tour.ts is both the fallback and the source the other
  // locales are translated from, so a locale mid-translation still reads.
  const say = (key: string, english: string) => language.t(key, undefined, english);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  /*
   * Rendered into document.body rather than in place. A modal that lives
   * inside a header inherits that header's stacking context and overflow —
   * .chrome's backdrop-filter makes one, and this used to surface as the
   * tour opening underneath the whiteboard. From the body it has no
   * ancestors left to be trapped by.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dialog = useRef<HTMLDivElement>(null);
  const closer = useRef<HTMLButtonElement>(null);

  // First visit only. A tour that reappears is an obstacle, not a welcome.
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // Private browsing: no tour on load, still reachable from the button.
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* nothing to remember it with */
    }
  }, []);

  const show = useCallback((next: number) => {
    setStep(Math.max(0, Math.min(TOUR_STEPS.length - 1, next)));
  }, []);

  // Arrow keys and Escape, because this is mostly read with one hand.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") setStep((s) => Math.min(TOUR_STEPS.length - 1, s + 1));
      if (event.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Focus lands inside the dialog, and the page behind it stops scrolling.
  useEffect(() => {
    if (!open) return;
    closer.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        title="How this works"
        aria-label="How this works"
        className={`tx press flex shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--tint)] hover:text-fg ${
          compact ? "h-8 w-8 border border-line" : "h-8 w-8"
        }`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M9.4 9.2a2.7 2.7 0 1 1 3.3 2.9c-.5.2-.7.6-.7 1.1v.6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.6" r="1" fill="currentColor" />
        </svg>
      </button>

      {open && mounted
        ? createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (!dialog.current?.contains(event.target as Node)) close();
          }}
        >
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="How TUTOR AI works"
            className="surface flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-lg sm:rounded-lg"
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                  {language.t("tour.heading", { n: step + 1, total: TOUR_STEPS.length },
                    `How this works · ${step + 1} of ${TOUR_STEPS.length}`)}
                </p>
                <h2 className="mt-0.5 truncate text-[17px] font-semibold text-fg">
                  {say(`${current.key}.title`, current.title)}
                </h2>
              </div>
              <button
                ref={closer}
                type="button"
                onClick={close}
                className="tx press shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-muted hover:bg-[var(--tint)] hover:text-fg"
              >
                {language.t("common.close", undefined, "Close")}
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-0 sm:grid-cols-[190px_1fr]">
                {/* The whole map, so it never feels like an endless sequence. */}
                <nav
                  aria-label="Tour steps"
                  className="hidden border-r border-line p-2 sm:block"
                >
                  {TOUR_STEPS.map((item, index) => (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => show(index)}
                      className={`tx block w-full truncate rounded-xs px-3 py-1.5 text-left text-[12.5px] ${
                        index === step
                          ? "bg-[var(--tint-strong)] font-semibold text-fg"
                          : "text-muted hover:bg-[var(--tint)] hover:text-fg"
                      }`}
                    >
                      {say(`${item.key}.title`, item.title)}
                    </button>
                  ))}
                </nav>

                <div className="p-5">
                  <p className="text-[14px] leading-relaxed text-fg">
                    {say(`${current.key}.what`, current.what)}
                  </p>
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {current.how.map((line, index) => (
                      <li key={index} className="flex gap-3">
                        <span className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--tint-strong)] text-[11px] font-bold text-fg">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-muted">
                          {say(`${current.key}.how${index + 1}`, line)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={current.href}
                    onClick={close}
                    className="grad mt-5 inline-flex h-9 items-center rounded-full px-5 text-[13px] font-semibold text-white transition hover:opacity-90"
                  >
                    {language.t("tour.takeMeTo", {
                      where: say(`${current.key}.title`, current.title).toLowerCase(),
                    }, `Take me to ${current.title.toLowerCase()}`)}
                  </Link>
                </div>
              </div>
            </div>

            <footer className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-3">
              <div className="flex flex-1 items-center gap-1.5" aria-hidden>
                {TOUR_STEPS.map((item, index) => (
                  <span
                    key={item.href}
                    className={`h-1.5 rounded-full transition-all ${
                      index === step ? "w-6 grad" : "w-1.5 bg-line-2"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => show(step - 1)}
                disabled={step === 0}
                className="tx press rounded-full border border-line px-4 py-1.5 text-[12.5px] font-medium text-muted hover:text-fg disabled:pointer-events-none disabled:opacity-35"
              >
                {language.t("common.back", undefined, "Back")}
              </button>
              <button
                type="button"
                onClick={() => (last ? close() : show(step + 1))}
                className="grad press rounded-full px-5 py-1.5 text-[12.5px] font-semibold text-white"
              >
                {last
                  ? language.t("tour.gotIt", undefined, "Got it")
                  : language.t("tour.next", undefined, "Next")}
              </button>
            </footer>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
