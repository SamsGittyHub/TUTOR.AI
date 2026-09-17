"use client";

import { useState } from "react";
import { keyFor } from "@/lib/beta";

import type { EventKind } from "@/lib/calendar";
import { getChunksFor, type Material } from "@/lib/db";
import { loadKeys } from "@/lib/keys";
import { loadSettings } from "@/lib/settings";
import { parseSyllabus, type ParsedEvent } from "@/lib/tutor/syllabus";

/**
 * Pick an uploaded syllabus, read the dates out of it, confirm, import.
 *
 * The confirm step is not ceremony: these are model guesses about dates a
 * student will plan a term around, and a wrong midterm date is worse than no
 * midterm date. Everything lands unticked-able but visible before it's saved.
 */

interface Props {
  materials: Material[];
  courses: { id: string; name: string }[];
  onImport: (events: ParsedEvent[], courseId: string | null) => Promise<void>;
}

export function SyllabusImport({ materials, courses, onImport }: Props) {
  const [materialId, setMaterialId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [found, setFound] = useState<ParsedEvent[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textual = materials.filter((m) => m.kind !== "image" && m.chunkCount > 0);

  async function read() {
    const material = materials.find((m) => m.id === materialId);
    if (!material) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const settings = loadSettings();
      const apiKey = keyFor(loadKeys()[settings.providerId]);
      if (!apiKey) {
        throw new Error("Add an API key in Settings first — reading a syllabus is a model call.");
      }
      const chunks = await getChunksFor([material.id]);
      const { events } = await parseSyllabus({
        providerId: settings.providerId,
        model: settings.model,
        apiKey,
        material,
        chunks,
      });
      setFound(events);
      setSkip(new Set());
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!found) return;
    setBusy(true);
    try {
      await onImport(
        found.filter((_, i) => !skip.has(i)),
        courseId || null,
      );
      setFound(null);
      setMaterialId("");
    } finally {
      setBusy(false);
    }
  }

  if (!textual.length) {
    return (
      <p className="rounded-sm border border-dashed border-line-2 px-4 py-3 text-[12.5px] text-muted">
        Upload your syllabus on the board first, then import its dates here.
      </p>
    );
  }

  return (
    <div className="surface rounded-md px-4 py-3.5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
            Syllabus
          </span>
          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none focus:border-line-2"
          >
            <option value="">pick an uploaded file…</option>
            {textual.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {courses.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
              For course
            </span>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-[13px] text-fg outline-none focus:border-line-2"
            >
              <option value="">none</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={read}
          disabled={!materialId || busy}
          className="rounded-full border border-line px-4 py-2 text-[13px] font-bold text-muted transition hover:text-fg disabled:opacity-40"
        >
          {busy && !found ? "Reading…" : "Read the dates"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xs border border-pink/40 bg-pink/10 px-3 py-2 text-[12.5px] font-bold text-pink"
        >
          {error}
        </p>
      )}

      {found && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[12.5px] font-bold text-fg">
            Found {found.length} dated item{found.length === 1 ? "" : "s"}. Untick
            anything wrong before importing — these are read off the document, not
            verified.
          </p>
          <ul className="mt-2.5 flex flex-col gap-1">
            {found.map((event, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={!skip.has(i)}
                  onChange={(e) =>
                    setSkip((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  aria-label={`Import ${event.title}`}
                  className="h-4 w-4 shrink-0 accent-[var(--color-cyan)]"
                />
                <span className="w-16 shrink-0 text-[11px] font-medium text-dim">
                  {event.kind}
                </span>
                <span className="flex-1 truncate text-[13px] text-fg">{event.title}</span>
                <span className="shrink-0 font-mono text-[11.5px] text-muted">
                  {event.date}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || skip.size === found.length}
            className="mt-3 rounded-full grad px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Importing…" : `Import ${found.length - skip.size} to the calendar`}
          </button>
        </div>
      )}
    </div>
  );
}
