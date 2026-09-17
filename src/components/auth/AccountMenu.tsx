"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { resetCache } from "@/lib/db";

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
  const boxRef = useRef<HTMLDivElement>(null);

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
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        className="flex h-8 w-8 items-center justify-center rounded-full grad text-[12px] font-black text-white transition hover:opacity-90"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-60 overflow-hidden rounded-sm border border-line bg-panel-2 shadow-xl"
        >
          <div className="border-b border-line px-3.5 py-3">
            {user.displayName && (
              <p className="text-[13px] font-extrabold text-fg">{user.displayName}</p>
            )}
            <p className="truncate text-[11.5px] text-dim">{user.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="w-full px-3.5 py-2.5 text-left text-[13px] font-bold text-muted transition hover:bg-panel-3 hover:text-fg disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
