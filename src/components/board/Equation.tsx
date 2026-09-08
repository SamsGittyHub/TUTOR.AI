"use client";

import { useMemo } from "react";
import katex from "katex";

interface Props {
  latex: string;
  display?: boolean;
  className?: string;
}

/**
 * KaTeX with the guard rails on: a model that emits `\int_0^` mid-stream must
 * not blow up the board, so we render the error text in place instead.
 */
export function Equation({ latex, display = true, className }: Props) {
  const html = useMemo(() => {
    // Models keep wrapping LaTeX in delimiters despite being told not to.
    const cleaned = latex
      .trim()
      .replace(/^\$\$?|\$\$?$/g, "")
      .replace(/^\\\[|\\\]$/g, "")
      .replace(/^\\\(|\\\)$/g, "")
      .trim();
    try {
      return katex.renderToString(cleaned, {
        displayMode: display,
        throwOnError: false,
        errorColor: "#d63b86",
        strict: false,
        trust: false,
        macros: { "\\R": "\\mathbb{R}", "\\d": "\\mathrm{d}" },
      });
    } catch {
      return `<span style="font-family:var(--font-mono)">${cleaned.replace(/</g, "&lt;")}</span>`;
    }
  }, [latex, display]);

  return (
    <span
      className={className}
      // KaTeX output is generated locally from the model's LaTeX; it never
      // contains raw model HTML because KaTeX escapes what it can't parse.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
