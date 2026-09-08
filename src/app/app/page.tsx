"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ChatRail } from "@/components/app/ChatRail";
import { ProgressPanel } from "@/components/app/ProgressPanel";
import { ReviewModal } from "@/components/app/ReviewModal";
import { SettingsModal } from "@/components/app/SettingsModal";
import { Sidebar } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Whiteboard } from "@/components/board/Whiteboard";
import { findModel, formatCost, getProvider } from "@/lib/providers";
import { TEACH_REQUEST_KEY } from "@/lib/useQuizLab";
import { useTutor } from "@/lib/useTutor";
import { buildQuizReviewMessage } from "@/lib/tutor/prompts";
import { useVoice } from "@/lib/voice";

type MobileView = "material" | "board" | "chat";

export default function AppPage() {
  const tutor = useTutor();
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("board");

  const voice = useVoice({ onTranscript: handleTranscript });
  const pendingVoice = useRef<string | null>(null);

  function handleTranscript(text: string) {
    if (tutor.status === "idle") {
      tutor.send(text);
    } else {
      // The tutor is mid-turn; hold the question and send it the moment
      // the turn settles so live interruptions never get dropped.
      pendingVoice.current = pendingVoice.current
        ? `${pendingVoice.current} ${text}`
        : text;
    }
  }

  useEffect(() => {
    if (tutor.status !== "idle" || !pendingVoice.current) return;
    const queued = pendingVoice.current;
    pendingVoice.current = null;
    tutor.send(queued);
  }, [tutor.status, tutor.send]);

  // The tutor's voice: read each new line as it streams onto the board.
  const spokenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Baseline: what's already on the board when voice turns on (or when a
    // different lesson opens) stays silent — only fresh lines get read.
    spokenRef.current = new Set(tutor.session.actions.map((action) => action.id));
  }, [tutor.session.id, voice.ttsOn]);
  useEffect(() => {
    if (!voice.ttsOn) return;
    for (const action of tutor.session.actions) {
      if (spokenRef.current.has(action.id)) continue;
      spokenRef.current.add(action.id);
      if (action.type === "say") voice.speak(action.text);
      else if (action.type === "ask_question") voice.speak(action.question);
    }
  }, [tutor.session.actions, voice.ttsOn, voice.speak]);

  // "Teach me this one" from the flashcards page lands here.
  useEffect(() => {
    if (!tutor.ready || tutor.status !== "idle") return;
    const raw = sessionStorage.getItem(TEACH_REQUEST_KEY);
    if (!raw) return;
    sessionStorage.removeItem(TEACH_REQUEST_KEY);
    try {
      const request = JSON.parse(raw) as { prompt: string; response: string; answer: string };
      tutor.send(buildQuizReviewMessage(request.prompt, request.response, request.answer));
    } catch {
      /* a malformed handoff is a dropped handoff */
    }
  }, [tutor.ready, tutor.status, tutor.send]);

  const busy = tutor.status === "thinking" || tutor.status === "teaching";
  const provider = getProvider(tutor.settings.providerId);
  const model = findModel(tutor.settings.providerId, tutor.settings.model);

  return (
    <div className="flex h-dvh flex-col bg-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2 sm:px-4">
        <Link href="/" className="shrink-0">
          <Logo size={24} />
        </Link>

        <span className="hidden min-w-0 flex-1 truncate text-sm font-bold text-muted sm:block">
          {tutor.session.title}
        </span>
        <span className="flex-1 sm:hidden" />

        {tutor.session.usage.turns > 0 ? (
          <span
            className="hidden shrink-0 text-[11px] font-semibold text-dim md:block"
            title={`${tutor.session.usage.inputTokens.toLocaleString()} in / ${tutor.session.usage.outputTokens.toLocaleString()} out`}
          >
            {tutor.session.usage.costUsd > 0
              ? `${formatCost(tutor.session.usage.costUsd)} this lesson`
              : `${(tutor.session.usage.inputTokens + tutor.session.usage.outputTokens).toLocaleString()} tokens`}
          </span>
        ) : null}

        <ThemeToggle />

        {voice.ttsSupported ? (
          <button
            type="button"
            onClick={voice.toggleTts}
            title={voice.ttsOn ? "Tutor voice: on" : "Tutor voice: off"}
            aria-label={voice.ttsOn ? "Tutor voice: on" : "Tutor voice: off"}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
              voice.ttsOn || voice.speaking
                ? "grad border-transparent text-white"
                : "border-line text-muted hover:text-fg"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M11 5 6 9H3v6h3l5 4V5Zm4.5 3.5a5 5 0 0 1 0 9m2.5-12a8.5 8.5 0 0 1 0 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
            tutor.hasKey
              ? "border-line text-muted hover:border-line-2 hover:text-fg"
              : "border-transparent grad text-white"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          {tutor.hasKey ? (
            <>
              <span className="hidden sm:inline">{provider.label}</span>
              <span className="font-mono">{model?.label ?? tutor.settings.model}</span>
            </>
          ) : (
            "Add your API key"
          )}
        </button>
      </header>

      {tutor.error ? (
        <Banner
          tone="error"
          title={tutor.error.message}
          detail={tutor.error.hint}
          onDismiss={tutor.dismissError}
        />
      ) : null}
      {tutor.notice ? (
        <Banner tone="info" title={tutor.notice} onDismiss={tutor.dismissNotice} />
      ) : null}

      <div className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[268px_minmax(0,1fr)_330px]">
        <div className={`min-h-0 ${mobileView === "material" ? "block" : "hidden"} lg:block`}>
          <Sidebar
            materials={tutor.materials}
            selectedIds={tutor.session.materialIds}
            sessions={tutor.sessions}
            currentSessionId={tutor.session.id}
            upload={tutor.upload}
            busy={busy}
            dueCount={tutor.dueCount}
            onAddFile={(file) => void tutor.addFile(file)}
            onAddText={(name, text) => void tutor.addPastedText(name, text)}
            onToggle={(id) => void tutor.toggleMaterial(id)}
            onRemove={(id) => void tutor.removeMaterial(id)}
            onStartLesson={(goal) => {
              setMobileView("board");
              void tutor.startLesson(tutor.session.materialIds, goal);
            }}
            onOpenSession={(id) => {
              setMobileView("board");
              void tutor.openSession(id);
            }}
            onDeleteSession={(id) => void tutor.removeSession(id)}
            onNewSession={tutor.startFresh}
            onOpenQuiz={() => router.push("/quiz")}
            onOpenReview={() => setShowReview(true)}
            onOpenProgress={() => setShowProgress(true)}
          />
        </div>

        <div className={`min-h-0 ${mobileView === "board" ? "block" : "hidden"} lg:block`}>
          <Whiteboard
            actions={tutor.session.actions}
            theme={tutor.session.boardTheme}
            plan={tutor.session.plan}
            status={tutor.status}
            onAnswer={tutor.answerBoardQuestion}
            onToggleTheme={tutor.toggleBoardTheme}
            onClear={tutor.wipeBoard}
            materialName={tutor.materialName}
            emptyState={
              <EmptyBoard
                hasKey={tutor.hasKey}
                hasMaterial={tutor.materials.length > 0}
                theme={tutor.session.boardTheme}
                onAddKey={() => setShowSettings(true)}
                onAsk={(prompt) => {
                  setMobileView("board");
                  tutor.send(prompt);
                }}
              />
            }
          />
        </div>

        <div className={`min-h-0 ${mobileView === "chat" ? "block" : "hidden"} lg:block`}>
          <ChatRail
            actions={tutor.session.actions}
            transcript={tutor.session.transcript}
            status={tutor.status}
            onSend={tutor.send}
            onStop={() => {
              voice.stopSpeaking();
              tutor.stop();
            }}
            disabled={!tutor.hasKey}
            micSupported={voice.micSupported}
            micOn={voice.micOn}
            speaking={voice.speaking}
            interim={voice.interim}
            micError={voice.micError}
            onToggleMic={voice.toggleMic}
          />
        </div>
      </div>

      <nav className="flex shrink-0 gap-1 border-t border-line p-1.5 lg:hidden">
        {(
          [
            ["material", "Material"],
            ["board", "Board"],
            ["chat", "Ask"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMobileView(value)}
            className={`flex-1 rounded-sm py-2 text-xs font-extrabold transition ${
              mobileView === value ? "bg-panel-3 text-fg" : "text-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {showSettings ? (
        <SettingsModal
          settings={tutor.settings}
          onChange={tutor.updateSettings}
          onKeysChanged={tutor.refreshKeys}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      {showReview ? (
        <ReviewModal
          queue={tutor.dueQueue}
          onAnswer={tutor.answerCard}
          onTeach={(card, response) => {
            setShowReview(false);
            setMobileView("board");
            tutor.teachCard(card, response);
          }}
          onClose={() => setShowReview(false)}
        />
      ) : null}

      {showProgress ? (
        <ProgressPanel
          materials={tutor.materials}
          cards={tutor.cards}
          attempts={tutor.attempts}
          onReview={() => {
            setShowProgress(false);
            setShowReview(true);
          }}
          onClose={() => setShowProgress(false)}
        />
      ) : null}
    </div>
  );
}

function Banner({
  tone,
  title,
  detail,
  onDismiss,
}: {
  tone: "error" | "info";
  title: string;
  detail?: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`flex shrink-0 items-start gap-3 border-b px-4 py-2.5 text-xs ${
        tone === "error"
          ? "border-pink/30 bg-pink/[.08] text-pink"
          : "border-cyan/25 bg-cyan/[.06] text-cyan"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        {detail ? <p className="mt-0.5 text-fg/60">{detail}</p> : null}
      </div>
      <button type="button" onClick={onDismiss} className="shrink-0 font-bold opacity-70">
        ✕
      </button>
    </div>
  );
}

const STARTERS = [
  "Teach me integration by parts from scratch",
  "Walk me through balancing redox equations",
  "Explain how a bill becomes a law, with a diagram",
];

function EmptyBoard({
  hasKey,
  hasMaterial,
  theme,
  onAddKey,
  onAsk,
}: {
  hasKey: boolean;
  hasMaterial: boolean;
  theme: "paper" | "chalk";
  onAddKey: () => void;
  onAsk: (prompt: string) => void;
}) {
  const paper = theme === "paper";
  return (
    <div className="mx-auto max-w-md text-center">
      <p className={`hand text-[32px] leading-tight ${paper ? "text-board-ink/80" : "text-white/80"}`}>
        {hasKey ? "Blank board." : "One thing first."}
      </p>
      <p className={`mt-2 text-sm leading-relaxed ${paper ? "text-black/45" : "text-white/45"}`}>
        {hasKey
          ? hasMaterial
            ? "Pick what to study on the left and hit Start the lesson — or just ask below."
            : "Upload notes on the left, or start with a question."
          : "Chalk runs on your own API key, so nothing here costs you a subscription. Paste one and the board wakes up."}
      </p>

      {hasKey ? (
        <div className="mt-5 flex flex-col items-center gap-1.5">
          {STARTERS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onAsk(prompt)}
              className={`hand rounded-full border px-4 py-1.5 text-[17px] transition ${
                paper
                  ? "border-black/10 bg-white/70 text-board-ink/80 hover:border-black/25"
                  : "border-white/15 bg-white/5 text-white/80 hover:border-white/35"
              }`}
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={onAddKey}
          className="mt-5 rounded-full grad px-6 py-2.5 text-sm font-extrabold text-white"
        >
          Add your API key
        </button>
      )}
    </div>
  );
}
