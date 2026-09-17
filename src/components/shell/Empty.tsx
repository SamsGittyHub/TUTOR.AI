import Link from "next/link";
import type { ReactNode } from "react";

/** The same empty state everywhere: what this page is for, and the way to fill it. */
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-md border border-dashed border-line-2 px-6 py-14 text-center">
      <p className="text-[15px] font-extrabold text-fg">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
        {children}
      </p>
      {action && (
        <Link
          href={action.href}
          className="mt-5 inline-block rounded-full grad px-5 py-2.5 text-[13px] font-extrabold text-white transition hover:opacity-90"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="py-14 text-center text-[13px] text-dim">Loading {what}…</p>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-sm border border-pink/40 bg-pink/10 px-4 py-3 text-[13px] font-bold text-pink"
    >
      {message}
    </p>
  );
}
