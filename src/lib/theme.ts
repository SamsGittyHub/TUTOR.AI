"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Chrome theme (light / dark) — separate from the board's paper/chalk look,
 * which stays per-lesson. The default follows the OS until the student
 * explicitly chooses; the choice persists and is applied pre-paint by the
 * inline script in the root layout, so there's no flash either way.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "chalk.theme.v1";

/** Runs before paint (inline in the root layout) — not for React use. */
export const THEME_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem("${THEME_KEY}");var t=s==="light"||s==="dark"?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=t;}catch(e){}})();`;

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function useTheme() {
  // Null until mounted: the server render can't know the choice, so toggles
  // hold their shape and flip on the client.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      apply(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* private mode: theme just won't persist */
      }
      return next;
    });
  }, []);

  return { theme, toggle, mounted: theme !== null };
}
