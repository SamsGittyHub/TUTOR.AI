"use client";

import { useState } from "react";

import { useLanguage } from "@/lib/language";

/**
 * Turning one lesson into a link.
 *
 * One student's revision becoming five students' revision is the cheapest
 * growth a study tool gets. The link is unguessable and can be turned off
 * again, and turning it off invalidates it for good rather than just hiding
 * the button.
 */
export function ShareLesson({ lessonId }: { lessonId: string }) {
  const language = useLanguage();
  const [shareId, setShareId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = shareId ? `${window.location.origin}/s/${shareId}` : "";

  async function share() {
    setBusy(true);
    try {
      const response = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}/share`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (body.shareId) {
        setShareId(body.shareId);
        // Straight to the clipboard: a link you have to select and copy is a
        // link that doesn't get sent.
        await navigator.clipboard
          ?.writeText(`${window.location.origin}/s/${body.shareId}`)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await fetch(`/api/lessons/${encodeURIComponent(lessonId)}/share`, { method: "DELETE" });
      setShareId(null);
    } finally {
      setBusy(false);
    }
  }

  if (!shareId) {
    return (
      <button
        type="button"
        onClick={() => void share()}
        disabled={busy}
        title="Get a read-only link to this board"
        className="tx press inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[11.5px] font-medium text-muted hover:bg-[var(--tint)] hover:text-fg disabled:opacity-40"
      >
        {language.t(busy ? "share.making" : "share.share")}
      </button>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(link)}
        title={link}
        className="tx press inline-flex h-8 items-center rounded-full border border-line px-3 text-[11.5px] font-semibold text-fg"
      >
        {language.t(copied ? "share.copied" : "share.copy")}
      </button>
      <button
        type="button"
        onClick={() => void revoke()}
        disabled={busy}
        title="Turn the link off — anyone holding it loses access"
        className="tx press inline-flex h-8 items-center rounded-full px-2.5 text-[11.5px] font-medium text-muted hover:text-pink disabled:opacity-40"
      >
        {language.t("share.stop")}
      </button>
    </span>
  );
}
