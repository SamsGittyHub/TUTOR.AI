"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DEFAULT_LANGUAGE, isRtl, languageLabel } from "./languages";
import { sourceHash, STRINGS, type Dict } from "./strings";
import { readStored } from "./storage-keys";

/**
 * The student's chosen language.
 *
 * Stored locally and mirrored to the account, so it follows them between
 * devices like everything else. Read in an effect rather than during render:
 * the server can't know the choice, and using it on the first client render
 * would mismatch the markup it just sent.
 */

export const LANGUAGE_KEY = "tutorai.language.v1";

interface LanguageState {
  code: string;
  change: (next: string) => void;
  ready: boolean;
  /** Translate a key. Falls back to English for anything missing. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** True while a locale is being translated for the first time. */
  translating: boolean;
}

/**
 * One shared value for the whole tree.
 *
 * It was per-component state first, which meant changing the language in the
 * account menu left every other component holding its own stale copy: the nav
 * kept its old labels until a reload, and switching from French to Arabic
 * showed French.
 */
const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const value = useLanguageState();
  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  // Components rendered outside the provider (and tests) still work, they just
  // don't share the change.
  const fallback = useLanguageState(!ctx);
  return ctx ?? fallback;
}

function useLanguageState(enabled = true): LanguageState {
  const [code, setCode] = useState(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);
  const [dict, setDict] = useState<Dict>(STRINGS);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const stored = readStored(localStorage, LANGUAGE_KEY);
    if (stored) setCode(stored);
    setReady(true);

    // Only where there's a session to ask about: the landing and auth pages
    // have none, and firing it there is a guaranteed 401 in the console.
    const PUBLIC = ["/", "/login", "/signup"];
    if (PUBLIC.includes(window.location.pathname)) return;

    // The account copy wins if it differs from this browser's — a language set
    // on a phone should be the language on a laptop.
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const remote = body?.language;
        if (remote && remote !== stored) {
          setCode(remote);
          try {
            localStorage.setItem(LANGUAGE_KEY, remote);
          } catch {
            /* private mode */
          }
        }
      })
      .catch(() => {});
  }, [enabled]);

  const change = useCallback((next: string) => {
    setCode(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      /* private mode */
    }
    void fetch("/api/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => {});
  }, []);

  // `dir` belongs on the document: a right-to-left interface can't be done
  // with a class on one component.
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = code;
    document.documentElement.dir = isRtl(code) ? "rtl" : "ltr";
  }, [code, ready]);

  /*
   * Load the dictionary for the chosen locale.
   *
   * localStorage first so a returning student sees their language instantly
   * rather than a flash of English, then the network to pick up any
   * regeneration. English needs neither — it's compiled in.
   */
  useEffect(() => {
    if (!enabled) return;
    if (code === DEFAULT_LANGUAGE) {
      setDict(STRINGS);
      setTranslating(false);
      return;
    }

    let live = true;
    const cacheKey = `${LANGUAGE_KEY}.dict.${code}.${sourceHash()}`;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) setDict(JSON.parse(cached) as Dict);
      else setTranslating(true);
    } catch {
      setTranslating(true);
    }

    fetch(`/api/translations/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!live || !body?.dict) return;
        // A fallback response comes back tagged English; don't cache that as
        // if it were a translation.
        if (body.locale === code) {
          setDict(body.dict as Dict);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(body.dict));
          } catch {
            /* quota or private mode */
          }
        }
      })
      .catch(() => {})
      .finally(() => live && setTranslating(false));

    return () => {
      live = false;
    };
  }, [code, enabled]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let value = dict[key] ?? STRINGS[key as keyof typeof STRINGS] ?? key;
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          value = value.replaceAll(`{${name}}`, String(replacement));
        }
      }
      return value;
    },
    [dict],
  );

  return useMemo(
    () => ({ code, change, ready, t, translating }),
    [code, change, ready, t, translating],
  );
}

/** Reads the preference outside React — prompts are built in plain functions. */
export function currentLanguage(): string {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  return readStored(localStorage, LANGUAGE_KEY) ?? DEFAULT_LANGUAGE;
}

/**
 * The line appended to every system prompt.
 *
 * Explicit about the maths on purpose: a model told to "answer in Arabic" will
 * sometimes translate variable names and LaTeX commands along with the prose,
 * which produces equations that don't render.
 */
export function languageInstruction(code = currentLanguage()): string {
  if (code === DEFAULT_LANGUAGE) return "";
  return `\n\n## Language

Write everything the student reads in ${languageLabel(code)} — your narration,
board text, headings, questions, explanations and feedback.

Leave notation alone: LaTeX commands, variable names, chemical formulae, code,
and standard units stay exactly as they are. Translate the words around them,
not the mathematics.`;
}
