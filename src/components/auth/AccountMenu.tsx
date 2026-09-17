"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { resetCache } from "@/lib/db";
import { useLanguage } from "@/lib/language";
import { LANGUAGES, languageByCode } from "@/lib/languages";

/**
 * Who's signed in, and the way out. Sits in the header of every study page.
 *
 * The cache reset on sign-out matters: db.ts memoizes reads for the life of the
 * page, and without clearing it the next account to sign in on this machine
 * would be served the previous one's materials.
 */

interface User {
  id: string;
  email: string;
  displayName: string | null;
}

export function AccountMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const language = useLanguage();
  const t = language.t;

  useEffect(() => {
    let live = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((body) => live && setUser(body.user ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape backs out of the language list first, then the menu — closing
      // both at once loses the student's place.
      if (picking) setPicking(false);
      else setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, picking]);

  if (!user) return null;

  const label = user.displayName || user.email;
  const initial = label.trim().charAt(0).toUpperCase() || "?";

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      resetCache();
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${label}`}
        className="tx press grad flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-white shadow-[var(--elev-1)] hover:brightness-110"
      >
        {initial}
      </button>

      {open && picking && (
        <div
          role="menu"
          aria-label={t("account.language")}
          className="surface-2 raised pop-in absolute right-0 top-10 z-50 flex w-72 flex-col overflow-hidden rounded-md"
          style={{ ["--origin" as string]: "top right" }}
        >
          <div className="p-2">
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="tx mb-1.5 flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-[12px] font-medium text-muted hover:bg-[var(--tint)] hover:text-fg"
            >
              ‹ {t("account.settings")}
            </button>
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("language.search")}
              className="tx w-full rounded-sm bg-[var(--tint)] px-2.5 py-2 text-[13px] text-fg shadow-[inset_0_0_0_0.5px_var(--hairline)] outline-none placeholder:text-dim"
            />
          </div>

          <div className="max-h-72 overflow-y-auto px-2 pb-1">
            {LANGUAGES.filter((l) => {
              const q = filter.trim().toLowerCase();
              return (
                !q ||
                l.name.toLowerCase().includes(q) ||
                l.native.toLowerCase().includes(q) ||
                l.code === q
              );
            }).map((l) => (
              <button
                key={l.code}
                type="button"
                role="menuitemradio"
                aria-checked={l.code === language.code}
                onClick={() => {
                  language.change(l.code);
                  setPicking(false);
                  setOpen(false);
                }}
                className={`tx flex w-full items-baseline gap-2 rounded-sm px-2 py-1.5 text-left ${
                  l.code === language.code
                    ? "bg-[var(--tint-strong)] text-fg"
                    : "text-muted hover:bg-[var(--tint)] hover:text-fg"
                }`}
              >
                <span className="text-[13px] font-medium">{l.native}</span>
                {l.native !== l.name && (
                  <span className="text-[11.5px] text-dim">{l.name}</span>
                )}
                {l.code === language.code && language.translating && (
                  <span className="ml-auto text-[10px] text-dim">
                    {t("language.translating")}
                  </span>
                )}
              </button>
            ))}
          </div>

          <p className="border-t border-line px-3 py-2.5 text-[11px] leading-relaxed text-dim">
            {t("language.note")}
          </p>
        </div>
      )}

      {open && !picking && (
        <div
          role="menu"
          className="surface-2 raised pop-in absolute right-0 top-10 z-50 w-60 overflow-hidden rounded-md p-1"
          style={{ ["--origin" as string]: "top right" }}
        >
          <div className="px-3 pb-2.5 pt-2.5">
            {user.displayName && (
              <p className="text-[13px] font-semibold text-fg">{user.displayName}</p>
            )}
            <p className="truncate text-[11.5px] text-dim">{user.email}</p>
          </div>
          <div className="mx-1 mb-1 h-px bg-[var(--hairline)]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => setPicking(true)}
            className="tx flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-[13px] font-semibold text-muted hover:bg-[var(--tint)] hover:text-fg"
          >
            {t("account.language")}
            <span className="ml-auto text-[12px] font-normal text-dim">
              {languageByCode(language.code)?.native ?? "English"}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="tx w-full rounded-sm px-3 py-2 text-left text-[13px] font-semibold text-muted hover:bg-[var(--tint)] hover:text-fg disabled:opacity-50"
          >
            {busy ? "…" : t("account.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
