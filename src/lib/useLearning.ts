"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  emptyProfile,
  forgetNote,
  parseProfile,
  recordTurn,
  rememberNote,
  type LearningProfile,
  type Reaction,
  type TeachingMode,
} from "./learning";

/**
 * The account's learning memory, loaded once and saved as it changes.
 *
 * Server-side only — no IndexedDB mirror. It is a few kilobytes, it is read
 * once per lesson rather than per keystroke, and the one thing it must never
 * do is diverge between two devices: a tutor that remembers a different you on
 * your laptop than on your phone is worse than one that remembers nothing.
 *
 * Writes are coalesced on a trailing edge, because a lesson updates this on
 * every turn and none of those updates is urgent.
 */

const SAVE_DELAY_MS = 1200;

export function useLearning() {
  const [profile, setProfile] = useState<LearningProfile>(() => emptyProfile());
  const [ready, setReady] = useState(false);

  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const latest = useRef(profile);
  latest.current = profile;

  useEffect(() => {
    let live = true;
    void fetch("/api/learning")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!live) return;
        if (body?.profile) setProfile(parseProfile(body.profile));
      })
      .catch(() => {})
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    void fetch("/api/learning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: latest.current }),
    }).catch(() => {
      // A memory that failed to save is picked up by the next change; losing
      // one turn's worth of evidence is not worth surfacing to a student
      // mid-lesson.
      dirty.current = true;
    });
  }, []);

  const change = useCallback(
    (next: (current: LearningProfile) => LearningProfile) => {
      setProfile((current) => {
        const updated = next(current);
        if (updated === current) return current;
        latest.current = updated;
        dirty.current = true;
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(save, SAVE_DELAY_MS);
        return updated;
      });
    },
    [save],
  );

  // A lesson often ends by closing the tab, which would drop the last turn.
  useEffect(() => {
    const flush = () => save();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      if (timer.current !== null) window.clearTimeout(timer.current);
      save();
    };
  }, [save]);

  return {
    profile,
    ready,
    /** Records how one turn's mix of card types went down. */
    noteTurn: useCallback(
      (modes: TeachingMode[], reaction: Reaction) =>
        change((current) => recordTurn(current, modes, reaction)),
      [change],
    ),
    /** Writes down something the tutor worked out. */
    remember: useCallback(
      (text: string) => change((current) => rememberNote(current, text)),
      [change],
    ),
    forget: useCallback(
      (id: string) => change((current) => forgetNote(current, id)),
      [change],
    ),
    /** Wipes the memory. It is personal, so this has to be one click. */
    forgetEverything: useCallback(() => {
      const cleared = emptyProfile();
      latest.current = cleared;
      setProfile(cleared);
      dirty.current = false;
      void fetch("/api/learning", { method: "DELETE" }).catch(() => {});
    }, []),
  };
}
