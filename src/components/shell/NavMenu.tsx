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
        className="flex h-8 items-center gap-1.5 rounded-full border border-line px-2.5 text-muted transition hover:text-fg"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="hidden text-[12px] font-bold sm:block">Go to</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-10 z-50 w-64 overflow-hidden rounded-sm border border-line bg-panel-2 py-1 shadow-xl"
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
                className={`block px-3.5 py-2 transition ${
                  active ? "bg-panel-3" : "hover:bg-panel-3"
                }`}
              >
                <span
                  className={`block text-[13px] font-bold ${active ? "text-fg" : "text-muted"}`}
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
