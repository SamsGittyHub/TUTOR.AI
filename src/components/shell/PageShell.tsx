import type { ReactNode } from "react";

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
    <>
      <main
        className={`mx-auto px-5 pb-24 pt-10 ${wide ? "max-w-6xl" : "max-w-4xl"}`}
      >
        <div className="rise-in flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold leading-[1.1]">{title}</h1>
            {lede && (
              <p className="mt-2 max-w-xl text-[14px] leading-[1.55] text-muted">
                {lede}
              </p>
            )}
          </div>
          {actions}
        </div>
        <div className="rise-in mt-8" style={{ animationDelay: "60ms" }}>
          {children}
        </div>
      </main>
    </>
  );
}
