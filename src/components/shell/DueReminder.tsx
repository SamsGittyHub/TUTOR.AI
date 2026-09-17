"use client";

import { useCallback, useEffect, useState } from "react";

import { reminderText, REMINDER_KEY, shouldRemind } from "@/lib/reminders";

/**
 * Opt-in reminders for cards that are due.
 *
 * Never asks on load. A site that demands notification permission before
 * you've decided you want it is a site people click "block" on, and blocking
 * is permanent — so the prompt only happens on a deliberate press.
 *
 * Honest about its limit: without a service worker this can only fire while a
 * tab is open, so it says so rather than promising a phone buzz it can't send.
 */
export function DueReminder({ dueCount }: { dueCount: number }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  // Fire at most once a day, and only for a queue that actually has something.
  useEffect(() => {
    if (permission !== "granted" || dueCount <= 0) return;
    let last: number | null = null;
    try {
      const stored = localStorage.getItem(REMINDER_KEY);
      last = stored ? Number(stored) : null;
    } catch {
      last = null;
    }
    if (!shouldRemind(Number.isFinite(last) ? last : null, dueCount)) return;

    const { title, body } = reminderText(dueCount);
    try {
      new Notification(title, { body, tag: "tutor-ai-due" });
      localStorage.setItem(REMINDER_KEY, String(Date.now()));
    } catch {
      // Some browsers refuse a bare Notification outside a service worker.
    }
  }, [permission, dueCount]);

  const ask = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }, []);

  if (permission === "unsupported") return null;

  if (permission === "granted") {
    return (
      <p className="mt-3 text-[12px] text-dim">
        Reminders are on. They appear while TUTOR AI is open in a tab.
      </p>
    );
  }

  if (permission === "denied") {
    return (
      <p className="mt-3 text-[12px] text-dim">
        Reminders are blocked for this site in your browser settings.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void ask()}
      className="tx press mt-3 rounded-full border border-line px-4 py-1.5 text-[12.5px] font-medium text-muted hover:border-line-2 hover:text-fg"
    >
      Remind me when cards are due
    </button>
  );
}
