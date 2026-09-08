"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ChatRail } from "@/components/app/ChatRail";
import { QuizPanel } from "@/components/app/QuizPanel";
import { SettingsModal } from "@/components/app/SettingsModal";
import { Sidebar } from "@/components/app/Sidebar";
import { Whiteboard } from "@/components/board/Whiteboard";
import { findModel, formatCost, getProvider } from "@/lib/providers";
import { useTutor } from "@/lib/useTutor";

type MobileView = "material" | "board" | "chat";

export default function AppPage() {
  const tutor = useTutor();
  const [showSettings, setShowSettings] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("board");

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

        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
            tutor.hasKey
              ? "border-line text-muted hover:border-line-2 hover:text-white"
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
            onOpenQuiz={() => setShowQuiz(true)}
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
            onStop={tutor.stop}
            disabled={!tutor.hasKey}
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
              mobileView === value ? "bg-panel-3 text-white" : "text-dim"
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

      {showQuiz ? (
        <QuizPanel
          quiz={tutor.session.quiz}
          busy={tutor.quizBusy}
          hasMaterial={tutor.session.materialIds.length > 0}
          onGenerate={(topic, count) => void tutor.makeQuiz(topic, count)}
          onAnswer={tutor.answerQuiz}
          onReview={(question) => {
            setShowQuiz(false);
            setMobileView("board");
            tutor.reviewQuestion(question);
          }}
          onClose={() => {
            setShowQuiz(false);
            if (tutor.session.quiz?.finished) tutor.closeQuiz();
          }}
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
        {detail ? <p className="mt-0.5 text-white/60">{detail}</p> : null}
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
