interface Props {
  size?: number;
  withWordmark?: boolean;
}

/**
 * The wordmark, on its own.
 *
 * `size` is kept in the signature because every call site passes it, and it
 * now sets the wordmark's size rather than a mark's — the parameter still
 * means "how big", it just no longer means "how big is the square".
 */
export function Logo({ size = 26, withWordmark = true }: Props) {
  if (!withWordmark) return null;
  return (
    <span
      className="font-bold tracking-tight"
      style={{ fontSize: Math.round(size * 0.7) }}
    >
      TUTOR AI
    </span>
  );
}
