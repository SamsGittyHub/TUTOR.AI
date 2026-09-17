"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { isActive, NAV_LINKS } from "./nav-links";

/**
 * The full destination list, as a dropdown.
 *
 * For the board and flashcards pages, which use their whole height and can't
 * afford a nav bar. Same links as AppNav, from the same list.
 */
export function NavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Go to"
        title="Go to"
        className={`tx press flex h-8 items-center gap-1.5 rounded-full px-2.5 ${
          open
            ? "bg-[var(--tint-strong)] text-fg"
            : "text-muted hover:bg-[var(--tint)] hover:text-fg"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        <span className="hidden text-[12px] font-semibold sm:block">Go to</span>
      </button>

      {open && (
        <div
          role="menu"
          className="surface-2 raised pop-in absolute left-0 top-10 z-50 w-64 overflow-hidden rounded-md p-1"
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`tx block rounded-sm px-3 py-2 ${
                  active ? "bg-[var(--tint-strong)]" : "hover:bg-[var(--tint)]"
                }`}
              >
                <span
                  className={`block text-[13px] font-semibold ${active ? "text-fg" : "text-muted"}`}
                >
                  {link.label}
                </span>
                <span className="block text-[11px] text-dim">{link.blurb}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
