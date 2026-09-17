"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/auth/AccountMenu";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

import { NavLinks } from "./NavLinks";
import { Tour } from "./Tour";

/** The bar every study page shares. The links themselves live in NavLinks. */
export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="chrome hair sticky top-0 z-40">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2.5">
        <Link href="/app" className="tx press shrink-0 opacity-90 hover:opacity-100">
          <Logo size={24} />
        </Link>

        <NavLinks />

        <div className="flex shrink-0 items-center gap-1.5">
          <Tour />
          <Link
            href="/settings"
            aria-label="Settings"
            className={`tx press flex h-8 w-8 items-center justify-center rounded-full ${
              pathname === "/settings"
                ? "bg-[var(--tint-strong)] text-fg"
                : "text-muted hover:bg-[var(--tint)] hover:text-fg"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </Link>
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
