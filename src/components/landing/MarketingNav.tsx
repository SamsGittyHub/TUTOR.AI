"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MARKETING_NAV } from "@/lib/marketing";

/**
 * The bar every public page shares.
 *
 * Deliberately built without any absolute or overlay positioning: on a phone
 * the links move to their own row underneath rather than collapsing into a
 * hamburger panel that floats over the page. A dropdown is the usual answer
 * and it's also the usual source of "something is covering the content" —
 * two stacked rows in normal flow cannot overlap anything, at any width.
 */
export function MarketingNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex items-center gap-4 py-3.5">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>

          {/* Desktop: links sit inline. Phone: this row is empty and the
              second row below carries them. */}
          <div className="hidden flex-1 gap-6 text-[13px] font-bold text-muted sm:flex">
            {MARKETING_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`transition hover:text-fg ${
                  pathname === link.href ? "text-fg" : ""
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2.5 sm:ml-0">
            <ThemeToggle />
            <Link
              href="/signup"
              className="rounded-full grad px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
            >
              Start free
            </Link>
          </div>
        </div>

        {/* Phone only: a second row, in normal flow, that scrolls sideways if
            the labels ever outgrow the screen rather than wrapping raggedly. */}
        <div className="-mx-5 flex gap-5 overflow-x-auto border-t border-line/60 px-5 py-2.5 text-[13px] font-bold text-muted [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
          {MARKETING_NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap transition hover:text-fg ${
                pathname === link.href ? "text-fg" : ""
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
