"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * The three buttons this app needs.
 *
 * The gradient used to be on every control, which is why nothing read as more
 * important than anything else — the surest way to make a page look generated.
 * It's now reserved for the single action that commits work on a screen.
 * Everything else is a tinted or plain surface, and the hierarchy does the
 * talking.
 */

export type ButtonTone = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const TONE: Record<ButtonTone, string> = {
  primary:
    "grad text-white shadow-[var(--elev-2)] hover:brightness-110 active:brightness-95",
  secondary:
    "bg-[var(--tint)] text-fg hover:bg-[var(--tint-strong)] shadow-[inset_0_0_0_0.5px_var(--hairline)]",
  ghost: "text-muted hover:bg-[var(--tint)] hover:text-fg",
  danger:
    "text-pink hover:bg-pink/10 shadow-[inset_0_0_0_0.5px_color-mix(in_srgb,var(--color-pink)_35%,transparent)]",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-[12px] gap-1.5",
  md: "h-9 px-4 text-[13px] gap-2",
  lg: "h-11 px-6 text-[14px] gap-2",
};

function classesFor(tone: ButtonTone, size: ButtonSize, full?: boolean) {
  return [
    "tx press inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
    "disabled:pointer-events-none disabled:opacity-40",
    TONE[tone],
    SIZE[size],
    full ? "w-full" : "",
  ].join(" ");
}

interface Shared {
  tone?: ButtonTone;
  size?: ButtonSize;
  full?: boolean;
  children: ReactNode;
}

export function Button({
  tone = "secondary",
  size = "md",
  full,
  className = "",
  children,
  ...rest
}: Shared & ComponentProps<"button">) {
  return (
    <button className={`${classesFor(tone, size, full)} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  tone = "secondary",
  size = "md",
  full,
  className = "",
  children,
  ...rest
}: Shared & ComponentProps<typeof Link>) {
  return (
    <Link className={`${classesFor(tone, size, full)} ${className}`} {...rest}>
      {children}
    </Link>
  );
}

/** A square icon button — the one shape the header uses over and over. */
export function IconButton({
  active,
  className = "",
  children,
  ...rest
}: { active?: boolean } & ComponentProps<"button">) {
  return (
    <button
      className={`tx press flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        active
          ? "bg-[var(--tint-strong)] text-fg"
          : "text-muted hover:bg-[var(--tint)] hover:text-fg"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
