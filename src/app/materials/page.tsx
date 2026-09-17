"use client";

import Link from "next/link";
import { useState } from "react";

import { Empty, LoadError, Loading } from "@/components/shell/Empty";
import { PageShell } from "@/components/shell/PageShell";
import { deleteMaterial, originalUrl, setMaterialCourse } from "@/lib/db";
import { useLibrary } from "@/lib/useLibrary";

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  pptx: "Slides",
  image: "Photo",
  text: "Text",
  audio: "Recording",
  video: "Lecture",
};

function size(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MaterialsPage() {
  const lib = useLibrary();
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Its review cards go with it.`)) return;
    setBusy(id);
    try {
      await deleteMaterial(id);
      lib.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell
      title="Material"
      lede="Everything you've uploaded, and which course it belongs to. Deleting a file takes its chunks and review cards with it."
      actions={
        <Link
          href="/app"
          className="rounded-full grad px-4 py-2.5 text-[13px] font-extrabold text-white transition hover:opacity-90"
        >
          Upload on the board
        </Link>
      }
    >
      {lib.loading ? (
        <Loading what="your material" />
      ) : lib.error ? (
        <LoadError message={lib.error} />
      ) : !lib.materials.length ? (
        <Empty title="Nothing uploaded yet" action={{ href: "/app", label: "Upload something" }}>
          Notes, slides, a PDF, a photo of your handwriting, or a lecture
          recording. The tutor teaches from whatever you give it.
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {lib.materials.map((m) => {
            const cards = lib.cards.filter((c) => c.materialIds.includes(m.id)).length;
            return (
              <li
                key={m.id}
                className="flex items-start gap-4 rounded-sm border border-line bg-panel px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-extrabold text-fg">{m.name}</p>
                  <p className="mt-0.5 text-[11.5px] font-bold uppercase tracking-wider text-dim">
                    {KIND_LABEL[m.kind] ?? m.kind}
                    {m.unitCount ? ` · ${m.unitCount} pages` : ""}
                    {m.chunkCount ? ` · ${m.chunkCount} chunks` : ""}
                    {cards ? ` · ${cards} cards` : ""}
                    {m.sizeBytes ? ` · ${size(m.sizeBytes)}` : ""}
                  </p>
                  {m.preview && (
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
                      {m.preview}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {lib.courses.length > 0 && (
                    <select
                      value={m.courseId ?? ""}
                      aria-label={`Course for ${m.name}`}
                      onChange={async (e) => {
                        await setMaterialCourse(m.id, e.target.value || null);
                        lib.reload();
                      }}
                      className="rounded-full border border-line bg-panel-2 px-2.5 py-1.5 text-[11.5px] font-bold text-muted outline-none focus:border-line-2"
                    >
                      <option value="">no course</option>
                      {lib.courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <a
                    href={originalUrl(m.id)}
                    className="rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-dim transition hover:text-fg"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(m.id, m.name)}
                    disabled={busy === m.id}
                    className="rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-dim transition hover:border-pink/50 hover:text-pink disabled:opacity-50"
                  >
                    {busy === m.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
