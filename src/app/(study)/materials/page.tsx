"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
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
        <ButtonLink href="/app" tone="primary">
          Upload on the board
        </ButtonLink>
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
              <li key={m.id} className="surface rounded-md px-4 py-3.5">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-fg">
                      {m.name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-dim">
                      {KIND_LABEL[m.kind] ?? m.kind}
                      {m.unitCount ? ` · ${m.unitCount} pages` : ""}
                      {m.chunkCount ? ` · ${m.chunkCount} chunks` : ""}
                      {cards ? ` · ${cards} cards` : ""}
                      {m.sizeBytes ? ` · ${size(m.sizeBytes)}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {lib.courses.length > 0 && (
                      <select
                        value={m.courseId ?? ""}
                        aria-label={`Subject for ${m.name}`}
                        onChange={async (e) => {
                          await setMaterialCourse(m.id, e.target.value || null);
                          lib.reload();
                        }}
                        className="tx h-7 rounded-full bg-[var(--tint)] px-2.5 text-[11.5px] font-medium text-muted shadow-[inset_0_0_0_0.5px_var(--hairline)] outline-none hover:text-fg"
                      >
                        <option value="">No subject</option>
                        {lib.courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <a
                      href={originalUrl(m.id)}
                      className="tx press inline-flex h-7 items-center rounded-full px-3 text-[11.5px] font-medium text-muted hover:bg-[var(--tint)] hover:text-fg"
                    >
                      Download
                    </a>
                    <Button
                      tone="danger"
                      size="sm"
                      onClick={() => remove(m.id, m.name)}
                      disabled={busy === m.id}
                    >
                      {busy === m.id ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </div>

                {m.preview && (
                  <p className="mt-2 line-clamp-2 text-[12.5px] leading-[1.55] text-muted">
                    {m.preview}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
