"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/auth/AccountMenu";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The bar every study page shares.
 *
 * The board is deliberately absent from these links — it owns the whole
 * viewport and has its own header. Everything else is a normal page with a
 * normal nav, which is what makes the rest of the product feel like a site
 * rather than one canvas with modals stacked on it.
 */

const LINKS = [
  { href: "/app", label: "Board" },
  { href: "/materials", label: "Material" },
  { href: "/courses", label: "Courses" },
  { href: "/calendar", label: "Calendar" },
  { href: "/quiz", label: "Flashcards" },
  { href: "/review", label: "Review" },
  { href: "/progress", label: "Progress" },
  { href: "/sessions", label: "Lessons" },
  { href: "/voice", label: "Live voice" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link href="/app" className="shrink-0">
          <Logo size={24} />
        </Link>

        <nav className="-mx-1 flex flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition ${
                  active
                    ? "bg-panel-3 text-fg"
                    : "text-muted hover:bg-panel-2 hover:text-fg"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/settings"
            aria-label="Settings"
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
              pathname === "/settings"
                ? "border-line-2 text-fg"
                : "border-line text-muted hover:text-fg"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                stroke="currentColor"
                strokeWidth="1.6"
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
