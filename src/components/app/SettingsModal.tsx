"use client";

import { useState } from "react";
import {
  PROVIDER_LIST,
  getProvider,
  type ProviderId,
} from "@/lib/providers";
import {
  clearAllKeys,
  getStorageMode,
  loadKeys,
  maskKey,
  setKey,
  setStorageMode,
  type KeyStorageMode,
} from "@/lib/keys";
import { wipeEverything } from "@/lib/db";
import type { Settings } from "@/lib/useTutor";

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onKeysChanged: () => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onChange, onKeysChanged, onClose }: Props) {
  const [active, setActive] = useState<ProviderId>(settings.providerId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<ProviderId | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [storage, setStorage] = useState<KeyStorageMode>(
    typeof window === "undefined" ? "local" : getStorageMode(),
  );
  const [customModel, setCustomModel] = useState("");

  const keys = loadKeys();
  const provider = getProvider(active);
  const stored = keys[active];

  const saveKey = async (value: string) => {
    setKey(active, value);
    onKeysChanged();
    setDrafts((prev) => ({ ...prev, [active]: "" }));
    if (!value.trim()) {
      setResults((prev) => ({ ...prev, [active]: { ok: false, message: "Key removed." } }));
      return;
    }
    setChecking(active);
    const result = await provider.validateKey(value.trim());
    setResults((prev) => ({ ...prev, [active]: result }));
    setChecking(null);
    if (result.ok && settings.providerId !== active) {
      onChange({ providerId: active, model: provider.models[0].id });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="my-8 w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-panel"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-base font-extrabold">Your key, your model</h2>
            <p className="text-xs text-dim">
              Keys stay in this browser and go straight to the provider. There is no
              server in the middle.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted hover:text-white"
          >
            done
          </button>
        </header>

        <div className="flex gap-1 border-b border-line px-3 py-2">
          {PROVIDER_LIST.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              className={`relative rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                active === item.id ? "bg-panel-3 text-white" : "text-dim hover:text-muted"
              }`}
            >
              {item.label}
              {keys[item.id] ? (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-400 align-middle" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="space-y-5 p-5">
          <p className="text-[13px] leading-relaxed text-muted">{provider.blurb}</p>

          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-dim">
              API key
            </label>
            {stored ? (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-line bg-panel-2 px-3 py-2">
                <span className="font-mono text-xs text-muted">{maskKey(stored)}</span>
                <span className="ml-auto text-[11px] font-bold text-green-400">saved</span>
                <button
                  type="button"
                  onClick={() => void saveKey("")}
                  className="text-[11px] font-bold text-dim hover:text-pink"
                >
                  remove
                </button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <input
                type="password"
                value={drafts[active] ?? ""}
                onChange={(event) =>
                  setDrafts((prev) => ({ ...prev, [active]: event.target.value }))
                }
                placeholder={`${provider.keyPrefix}…`}
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono text-xs outline-none focus:border-cyan/60"
              />
              <button
                type="button"
                disabled={!drafts[active]?.trim() || checking === active}
                onClick={() => void saveKey(drafts[active] ?? "")}
                className="grad rounded-md px-4 py-2 text-xs font-extrabold text-white disabled:opacity-40"
              >
                {checking === active ? "checking…" : "Save & test"}
              </button>
            </div>
            {results[active] ? (
              <p
                className={`mt-1.5 text-[11.5px] font-semibold ${
                  results[active].ok ? "text-green-400" : "text-pink"
                }`}
              >
                {results[active].message}
              </p>
            ) : null}
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block text-[11.5px] font-bold text-cyan hover:underline"
            >
              Get a {provider.label} key →
            </a>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-dim">
              Model for this session
            </label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {provider.models.map((model) => {
                const selected =
                  settings.providerId === active && settings.model === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => onChange({ providerId: active, model: model.id })}
                    className={`rounded-md border p-2.5 text-left transition ${
                      selected
                        ? "border-cyan/50 bg-cyan/[.07]"
                        : "border-line bg-panel-2 hover:border-line-2"
                    }`}
                  >
                    <span className="block text-xs font-extrabold">{model.label}</span>
                    {model.inputPrice !== undefined ? (
                      <span className="block text-[10.5px] text-dim">
                        ${model.inputPrice}/M in · ${model.outputPrice}/M out
                      </span>
                    ) : null}
                    {model.note ? (
                      <span className="mt-1 block text-[10.5px] leading-snug text-muted">
                        {model.note}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {provider.allowsCustomModel ? (
              <div className="mt-2 flex gap-2">
                <input
                  value={customModel}
                  onChange={(event) => setCustomModel(event.target.value)}
                  placeholder="or type any model id this provider serves"
                  className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-1.5 font-mono text-[11.5px] outline-none focus:border-cyan/60"
                />
                <button
                  type="button"
                  disabled={!customModel.trim()}
                  onClick={() => onChange({ providerId: active, model: customModel.trim() })}
                  className="rounded-md border border-line px-3 py-1.5 text-[11.5px] font-bold text-muted hover:text-white disabled:opacity-40"
                >
                  use
                </button>
              </div>
            ) : null}
            {settings.providerId === active &&
            !provider.models.some((m) => m.id === settings.model) ? (
              <p className="mt-1.5 font-mono text-[11px] text-cyan">
                using custom model: {settings.model}
              </p>
            ) : null}
          </div>

          <div className="rounded-md border border-line bg-panel-2 p-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-dim">
              Where keys live
            </p>
            <div className="mt-2 flex gap-2">
              {(
                [
                  ["local", "This browser", "Stays until you clear it."],
                  ["session", "This tab only", "Gone when you close the tab."],
                ] as const
              ).map(([mode, title, blurb]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setStorageMode(mode);
                    setStorage(mode);
                    onKeysChanged();
                  }}
                  className={`flex-1 rounded-md border p-2 text-left transition ${
                    storage === mode
                      ? "border-cyan/50 bg-cyan/[.07]"
                      : "border-line hover:border-line-2"
                  }`}
                >
                  <span className="block text-xs font-bold">{title}</span>
                  <span className="block text-[10.5px] text-dim">{blurb}</span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-dim">
              Stored obfuscated in browser storage, not encrypted — anything that can
              run scripts on this page could read it. That is the honest tradeoff for
              never sending your key to a server of ours. On a shared computer, use
              &ldquo;this tab only&rdquo;.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => {
                clearAllKeys();
                onKeysChanged();
                setResults({});
              }}
              className="rounded-full border border-line px-3.5 py-1.5 text-[11.5px] font-bold text-muted transition hover:border-pink/50 hover:text-pink"
            >
              Forget all keys
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "Delete every uploaded material and saved lesson from this browser? This can't be undone.",
                  )
                ) {
                  void wipeEverything().then(() => window.location.reload());
                }
              }}
              className="rounded-full border border-line px-3.5 py-1.5 text-[11.5px] font-bold text-muted transition hover:border-pink/50 hover:text-pink"
            >
              Delete all my data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
