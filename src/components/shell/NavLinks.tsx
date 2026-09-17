"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useLanguage } from "@/lib/language";

import { isActive, NAV_LINKS } from "./nav-links";

/**
 * Every destination, as one row.
 *
 * Shared by the study pages' nav bar and the board's own header, so the two
 * can't drift — a page missing from one of two hand-maintained lists is
 * exactly how /practice-exam ended up unreachable before.
 *
 * The active item is marked by a single pill that slides between positions
 * rather than one highlight switching off as another switches on. That
 * continuity is the difference between a nav that feels built and a row of
 * buttons: the eye follows one object moving instead of re-finding a new one.
 * It's measured from the DOM, so it stays correct at any label length, and it
 * doesn't animate on first paint — sliding in from the left on load would be
 * motion with nothing to say.
 */

interface Props {
  /**
   * Spread the links across the available width instead of packing them left.
   * The board's header has room to fill; a narrow one is better packed.
   */
  spread?: boolean;
}

export function NavLinks({ spread = true }: Props) {
  const pathname = usePathname();
  const language = useLanguage();
  const listRef = useRef<HTMLElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
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
    <nav
      ref={listRef}
      data-at-start={edges.start}
      data-at-end={edges.end}
      className={`edge-fade relative -mx-1 flex min-w-0 flex-1 items-center overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        spread ? "justify-between gap-1" : "gap-0.5"
      }`}
    >
      {pill && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 z-0 rounded-full"
          style={{
            // Geometry here rather than in classes: the inline transform has to
            // compose with the vertical centring, and splitting them across
            // both invites exactly the drift that put this pill above the
            // labels the first time.
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
            className={`tx relative z-10 shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
              active ? "text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {language.t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}
