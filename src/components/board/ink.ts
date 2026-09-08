import type { PenColor } from "@/lib/actions";

/** Marker colors, tuned for both the paper board and the chalkboard. */
export const INK: Record<PenColor, { paper: string; chalk: string }> = {
  ink: { paper: "#16161a", chalk: "#f4f4ee" },
  cyan: { paper: "#0682c4", chalk: "#5fd0ff" },
  pink: { paper: "#d63b86", chalk: "#ff8ec4" },
  amber: { paper: "#b06d05", chalk: "#ffc861" },
  green: { paper: "#1a7a4c", chalk: "#6ee7a5" },
  violet: { paper: "#6b46c1", chalk: "#c4a7ff" },
};

export type BoardTheme = "paper" | "chalk";

export function inkColor(color: PenColor, theme: BoardTheme): string {
  return INK[color][theme];
}

/** Slight, deterministic tilt so cards don't look machine-placed. */
export function tiltFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const degrees = ((Math.abs(hash) % 90) / 100 - 0.45).toFixed(2);
  return `${degrees}deg`;
}
