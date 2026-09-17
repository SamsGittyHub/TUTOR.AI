"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { BETA } from "@/lib/beta";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Sign up and sign in are the same form with different copy, so they share one
 * component — the only real difference is the endpoint and whether a display
 * name is asked for.
 */

interface Props {
  mode: "signup" | "login";
}

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const signup = mode === "signup";
  // The proxy stashes where they were headed before the gate bounced them.
  const next = params.get("next");
  const destination = next?.startsWith("/") ? next : "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${signup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          signup ? { email, password, displayName } : { email, password },
        ),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
        return;
      }
      // A fresh cookie means every server component must re-read it.
      router.replace(destination);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-ink">
      <header className="flex items-center justify-between px-5 py-3.5">
        <Link href="/">
          <Logo size={24} />
        </Link>
        <ThemeToggle />
      </header>

      <div className="relative flex flex-1 items-center justify-center px-5 pb-16">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[380px] w-[620px] -translate-x-1/2 rounded-full opacity-[.13] blur-[110px] grad"
        />

        <div className="relative w-full max-w-sm">
          <h1 className="text-center text-[30px] font-bold leading-tight tracking-tight">
            {signup ? (
              <>
                Study from <span className="grad-text">any device</span>
              </>
            ) : (
              "Welcome back"
            )}
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-center text-[13.5px] leading-relaxed text-muted">
            {signup
              ? BETA
                ? "Free while we're in beta — no API key, no card, nothing to set up. Your material, lessons and review queue follow you to any device."
                : "Free account. Your material, lessons, and review queue follow you everywhere — and your API key can too, encrypted, if you want it to."
              : "Sign in to pick up where you left off."}
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
            {signup && (
              <Field
                label="Name"
                type="text"
                value={displayName}
                onChange={setDisplayName}
                placeholder="optional"
                autoComplete="name"
              />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@school.edu"
              autoComplete="email"
              required
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={signup ? "at least 8 characters" : ""}
              autoComplete={signup ? "new-password" : "current-password"}
              required
            />

            {error && (
              <p
                role="alert"
                className="rounded-xs border border-pink/40 bg-pink/10 px-3 py-2 text-[12.5px] font-bold text-pink"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-full grad px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy
                ? signup
                  ? "Creating your account…"
                  : "Signing in…"
                : signup
                  ? "Create free account"
                  : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-muted">
            {signup ? "Already have an account? " : "New here? "}
            <Link
              href={{
                pathname: signup ? "/login" : "/signup",
                query: next ? { next } : undefined,
              }}
              className="font-bold text-cyan transition hover:opacity-80"
            >
              {signup ? "Sign in" : "Create one free"}
            </Link>
          </p>

          <p className="mt-8 text-center text-[11.5px] leading-relaxed text-dim">
            {BETA
              ? "The tutor runs on our key during the beta, with a daily limit so it keeps working for everyone. Tell us what breaks."
              : "Your material syncs so it's on every device. Your API key stays in this browser unless you ask us to remember it, and calls always go straight from here to your provider."}
          </p>
        </div>
      </div>
    </main>
  );
}

interface FieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}

function Field({ label, type, value, onChange, ...rest }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xs border border-line bg-panel px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-dim focus:border-line-2"
        {...rest}
      />
    </label>
  );
}
