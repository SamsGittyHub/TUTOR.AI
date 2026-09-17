"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageShell } from "@/components/shell/PageShell";
import { SettingsModal } from "@/components/app/SettingsModal";
import { loadSettings, saveSettings, type Settings } from "@/lib/settings";

/**
 * Keys and model choice as a page.
 *
 * SettingsModal already owns all of this logic and is used from the board, so
 * rather than fork it the page renders it inline with its close handler wired
 * to going back — one implementation, two entry points.
 */
export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [nonce, setNonce] = useState(0);

  // Settings live in localStorage, so the first read has to be client-side.
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function change(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  if (!settings) {
    return (
      <PageShell title="Settings" lede="Your key, your model.">
        <p className="py-14 text-center text-[13px] text-dim">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Settings"
      lede="Your key never leaves this browser — it goes straight to the provider you pick. Your material lives on your account so it follows you between devices."
    >
      <SettingsModal
        key={nonce}
        variant="page"
        settings={settings}
        onChange={change}
        onKeysChanged={() => setNonce((n) => n + 1)}
        onClose={() => router.push("/app")}
      />
    </PageShell>
  );
}
