"use client";

import { useTheme } from "@/lib/theme";

/** Sun/moon toggle for the chrome theme. Shared by landing, board, flashcards. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle, mounted } = useTheme();
  const light = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      title={mounted ? (light ? "Switch to dark mode" : "Switch to light mode") : "Theme"}
      aria-label={mounted ? (light ? "Switch to dark mode" : "Switch to light mode") : "Theme"}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-2 hover:text-fg ${className}`}
    >
      {mounted && light ? (
        // moon — click returns to dark
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 11 10.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // sun — click returns to light
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
