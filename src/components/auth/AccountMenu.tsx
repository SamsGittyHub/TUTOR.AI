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
        className="tx press grad flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-white shadow-[var(--elev-1)] hover:brightness-110"
      >
        {initial}
      </button>

      {open && (
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
            onClick={signOut}
            disabled={busy}
            className="tx w-full rounded-sm px-3 py-2 text-left text-[13px] font-semibold text-muted hover:bg-[var(--tint)] hover:text-fg disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
