"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { AccountMenu } from "@/components/auth/AccountMenu";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

import { isActive, NAV_LINKS } from "./nav-links";

/**
 * The bar every study page shares.
 *
 * The active item is marked by a single pill that slides between positions
 * rather than one highlight switching off as another switches on. That
 * continuity is the whole difference between a nav that feels built and a row
 * of buttons: the eye follows one object moving instead of re-finding a new
 * one. It's measured from the DOM, so it stays correct at any font size or
 * label length, and it does not animate on first paint — sliding in from the
 * left on load would be motion with nothing to say.
 */
export function AppNav() {
  const pathname = usePathname();
  const listRef = useRef<HTMLElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  // Which edges still have content past them, so the fade only appears where
  // there is genuinely more to scroll to.
  const [edges, setEdges] = useState({ start: true, end: true });
  const settled = useRef(false);

  // Layout effect: measure before paint, or the pill visibly jumps into place.
  useLayoutEffect(() => {
    const active = NAV_LINKS.find((l) => isActive(pathname, l.href));
    const node = active ? itemRefs.current.get(active.href) : undefined;
    const list = listRef.current;
    if (!node || !list) {
      setPill(null);
      return;
    }
    setPill({ x: node.offsetLeft - list.scrollLeft, w: node.offsetWidth });
  }, [pathname]);

  // Keep it attached through resizes and horizontal scrolling on narrow screens.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const reposition = () => {
      const active = NAV_LINKS.find((l) => isActive(pathname, l.href));
      const node = active ? itemRefs.current.get(active.href) : undefined;
      if (node) setPill({ x: node.offsetLeft - list.scrollLeft, w: node.offsetWidth });
      setEdges({
        start: list.scrollLeft <= 1,
        end: list.scrollLeft + list.clientWidth >= list.scrollWidth - 1,
      });
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(list);
    list.addEventListener("scroll", reposition, { passive: true });
    const timer = setTimeout(() => {
      settled.current = true;
    }, 80);
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", reposition);
      clearTimeout(timer);
    };
  }, [pathname]);

  return (
    <header className="chrome hair sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link href="/app" className="tx press shrink-0 opacity-90 hover:opacity-100">
          <Logo size={24} />
        </Link>

        <nav
          ref={listRef}
          data-at-start={edges.start}
          data-at-end={edges.end}
          className="edge-fade relative -mx-1 flex flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {pill && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 z-0 rounded-full"
              style={{
                // Set geometry here rather than in classes: the inline
                // transform has to compose with the vertical centring, and
                // splitting them across both invites exactly the drift that
                // put this pill above the labels the first time.
                top: "50%",
                height: 30,
                width: pill.w,
                transform: `translate(${pill.x}px, -50%)`,
                background: "var(--tint-strong)",
                transition: settled.current
                  ? "transform var(--dur) var(--ease-out), width var(--dur) var(--ease-out)"
                  : "none",
              }}
            />
          )}

          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                ref={(node) => {
                  if (node) itemRefs.current.set(link.href, node);
                  else itemRefs.current.delete(link.href);
                }}
                aria-current={active ? "page" : undefined}
                className={`tx relative z-10 shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
                  active ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
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
