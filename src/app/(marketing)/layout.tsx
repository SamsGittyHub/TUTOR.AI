import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { MARKETING_NAV } from "@/lib/marketing";

/**
 * The shell for the public pages.
 *
 * A route group, so none of the URLs gain a prefix. The nav and footer live
 * here rather than in each page: four copies of a nav is four chances for
 * one of them to fall out of date, which is exactly how the old single-page
 * version ended up advertising a product that no longer existed.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-ink">
      <MarketingNav />
      <main>{children}</main>

      <footer className="border-t border-line px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <Logo size={20} />
            <p className="max-w-xs text-[11.5px] leading-relaxed text-dim">
              Your material and lessons are saved to your account so they follow you
              between devices. Delete any of it, or the whole account, from Settings.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-2 text-[12.5px] font-semibold text-muted">
            {MARKETING_NAV.map((link) => (
              <Link key={link.href} href={link.href} className="transition hover:text-fg">
                {link.label}
              </Link>
            ))}
            <Link href="/login" className="transition hover:text-fg">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
