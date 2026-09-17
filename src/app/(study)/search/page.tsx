"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Empty } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { useLanguage } from "@/lib/language";
import { splitOnTerms } from "@/lib/search";

/**
 * Finding your own notes and lessons again.
 *
 * A student with a term of uploads has no way to answer "where did we do
 * titration?" except by opening files. The tutor has had retrieval over all of
 * this from the beginning; this is the same thing, pointed at the person who
 * owns the material.
 */

interface MaterialHit {
  materialId: string;
  name: string;
  locator: string;
  excerpt: string;
}

interface LessonHit {
  id: string;
  title: string;
  mode: "typed" | "voice";
  updatedAt: number;
  cards: number;
}

/** The matched words, marked, so the eye lands on them without reading. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitOnTerms(text, query).map((run, index) =>
        run.hit ? (
          <mark key={index} className="rounded-[3px] bg-warn/30 px-0.5 text-fg">
            {run.text}
          </mark>
        ) : (
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}

export default function SearchPage() {
  const language = useLanguage();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [material, setMaterial] = useState<MaterialHit[]>([]);
  const [lessons, setLessons] = useState<LessonHit[]>([]);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const latest = useRef(0);

  useEffect(() => field.current?.focus(), []);

  const search = useCallback(async (value: string) => {
    const term = value.trim();
    // Each request carries a number; a slow early one must not overwrite the
    // results of a later, faster one.
    const ticket = (latest.current += 1);
    if (term.length < 2) {
      setQuery("");
      setMaterial([]);
      setLessons([]);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const body = await response.json().catch(() => ({}));
      if (ticket !== latest.current) return;
      setQuery(term);
      setMaterial(body.material ?? []);
      setLessons(body.lessons ?? []);
    } finally {
      if (ticket === latest.current) setBusy(false);
    }
  }, []);

  // Typing shouldn't fire a query per keystroke, and shouldn't feel delayed.
  useEffect(() => {
    const handle = window.setTimeout(() => void search(draft), 220);
    return () => window.clearTimeout(handle);
  }, [draft, search]);

  const found = material.length + lessons.length;

  return (
    <PageShell
      title={language.t("search.title")}
      lede={language.t("search.lede")}
    >
      <input
        ref={field}
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={language.t("search.placeholder")}
        aria-label={language.t("search.label")}
        className="w-full rounded-md border border-line bg-panel-2 px-4 py-3 text-[15px] text-fg outline-none transition placeholder:text-dim focus:border-line-2"
      />

      {!query ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          {language.t("search.hint")}
        </p>
      ) : !found && !busy ? (
        <div className="mt-4">
          <Empty
            title={language.t("search.nothing", { query })}
            action={{ href: "/app", label: "Upload something" }}
          >
            {language.t("search.nothingHint")}
          </Empty>
        </div>
      ) : (
        <>
          {lessons.length ? (
            <section className="mt-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                {language.t("nav.lessons")}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {lessons.map((hit) => (
                  <li key={hit.id} className="surface rounded-md px-4 py-3.5">
                    <Link
                      href={`${hit.mode === "voice" ? "/voice" : "/app"}?session=${encodeURIComponent(hit.id)}`}
                      className="text-[14px] font-semibold text-fg transition hover:text-cyan"
                    >
                      <Marked text={hit.title} query={query} />
                    </Link>
                    <p className="mt-0.5 text-[12px] text-dim">
                      {hit.mode === "voice" ? "spoken · " : ""}
                      {new Date(hit.updatedAt).toLocaleDateString()}
                      {hit.cards ? ` · ${hit.cards} board cards` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {material.length ? (
            <section className="mt-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                {language.t("search.inMaterial")}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {material.map((hit, index) => (
                  <li key={`${hit.materialId}-${index}`} className="surface rounded-md px-4 py-3.5">
                    <p className="text-[12px] font-semibold text-dim">
                      {hit.name} · {hit.locator}
                    </p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                      <Marked text={hit.excerpt} query={query} />
                    </p>
                    <Link
                      href={`/app?ask=${encodeURIComponent(`Teach me this bit of ${hit.name} (${hit.locator}): ${hit.excerpt.slice(0, 160)}`)}`}
                      className="mt-2 inline-block text-[12.5px] font-semibold text-cyan hover:underline"
                    >
                      {language.t("search.teachMe")}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
