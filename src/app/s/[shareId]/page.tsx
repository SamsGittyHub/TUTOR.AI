import type { Metadata } from "next";
import Link from "next/link";

import { SharedBoard } from "@/components/board/SharedBoard";
import { Logo } from "@/components/Logo";
import type { TutorAction } from "@/lib/actions";
import { queryOne } from "@/lib/server/db";

/**
 * Somebody else's lesson, read only.
 *
 * No account needed and nothing to interact with: the board as it was left,
 * for a classmate sent the link. Rendered on the server so a shared link is a
 * page rather than an empty shell that fetches one.
 *
 * Pictures are rewritten to a route scoped to this share, because the owner's
 * image endpoint is behind their session — without that, every shared board
 * with a drawing on it would be full of broken images.
 */

interface Row {
  title: string;
  actions: TutorAction[];
  updated_at: Date;
}

async function load(shareId: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/.test(shareId)) return null;
  return queryOne<Row>(
    "select title, actions, updated_at from lessons where share_id = $1",
    [shareId],
  );
}

export async function generateMetadata(
  { params }: { params: Promise<{ shareId: string }> },
): Promise<Metadata> {
  const { shareId } = await params;
  const row = await load(shareId);
  return {
    title: row ? `${row.title} · TUTOR AI` : "Lesson not found · TUTOR AI",
    // A revoked link must not linger in a search index.
    robots: { index: false, follow: false },
  };
}

export default async function SharedLessonPage(
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const row = await load(shareId);

  if (!row) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink px-6 text-center">
        <Logo size={28} />
        <h1 className="text-[20px] font-semibold text-fg">This link isn&apos;t live</h1>
        <p className="max-w-sm text-[13.5px] leading-relaxed text-muted">
          Either the lesson was never shared, or whoever shared it has since
          turned the link off.
        </p>
        <Link href="/" className="grad rounded-full px-5 py-2.5 text-[13px] font-semibold text-white">
          See what TUTOR AI is
        </Link>
      </main>
    );
  }

  const actions = (row.actions ?? []).map((action) =>
    action.type === "show_image" && action.src?.startsWith("/api/images/")
      ? { ...action, src: `/s/${shareId}/image/${action.src.slice("/api/images/".length)}` }
      : action,
  );

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <header className="chrome hair flex w-full min-w-0 shrink-0 items-center gap-3 overflow-hidden px-4 py-2.5">
        <Link href="/" className="shrink-0">
          <Logo size={24} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{row.title}</p>
          <p className="text-[11px] text-dim">
            A shared lesson · {new Date(row.updated_at).toLocaleDateString()}
          </p>
        </div>
        <Link
          href="/signup"
          className="grad shrink-0 rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-white"
        >
          Get your own tutor
        </Link>
      </header>

      <main className="min-h-0 flex-1 p-3">
        <SharedBoard actions={actions} />
      </main>
    </div>
  );
}
