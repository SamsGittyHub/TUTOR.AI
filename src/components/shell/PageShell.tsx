import type { ReactNode } from "react";

import { AppNav } from "./AppNav";

/**
 * Standard page frame: the shared nav, a centred column, and a title block.
 * Pages that need the full viewport (the board, live voice) skip this.
 */

interface Props {
  title: string;
  lede?: string;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}

export function PageShell({ title, lede, actions, children, wide }: Props) {
  return (
    <div className="min-h-dvh bg-ink">
      <AppNav />
      <main
        className={`mx-auto px-4 pb-24 pt-8 ${wide ? "max-w-6xl" : "max-w-4xl"}`}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[27px] font-black tracking-tight">{title}</h1>
            {lede && (
              <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-muted">
                {lede}
              </p>
            )}
          </div>
          {actions}
        </div>
        <div className="mt-7">{children}</div>
      </main>
    </div>
  );
}
