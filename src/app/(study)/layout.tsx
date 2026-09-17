import type { ReactNode } from "react";

import { AppNav } from "@/components/shell/AppNav";

/**
 * The shell for every ordinary study page.
 *
 * A route group, so none of the URLs change. The point is that the nav lives
 * here rather than inside each page: a layout persists across navigations, so
 * the active-item pill slides between positions instead of a fresh AppNav
 * mounting with the pill already in place. It also stops AccountMenu
 * re-fetching the signed-in user on every single page change.
 *
 * The board, flashcards and live voice sit outside this group — they own their
 * whole viewport and carry the same destinations in a menu instead.
 */
export default function StudyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-ink">
      <AppNav />
      {children}
    </div>
  );
}
