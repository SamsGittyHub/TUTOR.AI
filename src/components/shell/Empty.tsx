import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/Button";

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
    <div className="rounded-md px-6 py-11 text-center shadow-[inset_0_0_0_1px_var(--hairline)]">
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-[1.6] text-muted">
        {children}
      </p>
      {action && (
        // Secondary on purpose: the page header already carries the primary
        // action, and two gradient buttons for the same thing is exactly the
        // flattened hierarchy this pass is undoing.
        <ButtonLink href={action.href} tone="secondary" className="mt-5">
          {action.label}
        </ButtonLink>
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
