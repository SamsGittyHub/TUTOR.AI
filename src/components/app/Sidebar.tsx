"use client";

import Link from "next/link";

import { NAV_LINKS } from "@/lib/nav";
import { useLanguage } from "@/lib/language";

import { useRef, useState } from "react";
import type { Material, Session } from "@/lib/db";
import { formatCost } from "@/lib/providers";
import type { UploadState } from "@/lib/useTutor";

interface Props {
  materials: Material[];
  selectedIds: string[];
  sessions: Session[];
  currentSessionId: string;
  upload: UploadState | null;
  busy: boolean;
  dueCount: number;
  onAddFile: (file: File) => void;
  onAddText: (name: string, text: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onStartLesson: (goal: string) => void;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewSession: () => void;
  onOpenQuiz: () => void;
  onOpenExam: () => void;
  onOpenReview: () => void;
  onOpenProgress: () => void;
}

const KIND_ICON: Record<Material["kind"], string> = {
  pdf: "▤",
  docx: "❐",
  pptx: "▥",
  image: "◨",
  text: "≡",
  audio: "◍",
  video: "▶",
};

/** The board is where you already are, so it isn't offered here. */
const BOARD_LINKS = NAV_LINKS.filter((l) => l.href !== "/app");

export function Sidebar(props: Props) {
  const language = useLanguage();
  const [tab, setTab] = useState<"material" | "history">("material");
  const [goal, setGoal] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex shrink-0 gap-1 border-b border-line p-1.5">
        {(["material", "history"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex-1 rounded-sm px-3 py-1.5 text-[13.5px] font-semibold capitalize transition ${
              tab === value ? "bg-panel-3 text-fg" : "text-dim hover:text-muted"
            }`}
          >
            {value === "material"
              ? language.t("material.title")
              : language.t("material.pastLessons")}
          </button>
        ))}
      </div>

      {tab === "material" ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              for (const file of Array.from(event.dataTransfer.files)) props.onAddFile(file);
            }}
            className={`grad-border rounded-md border border-dashed p-4 text-center transition ${
              dragging ? "border-transparent bg-cyan/10" : "border-line-2 bg-panel-2"
            }`}
          >
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/*,audio/*,video/*"
              onChange={(event) => {
                for (const file of Array.from(event.target.files ?? [])) props.onAddFile(file);
                event.target.value = "";
              }}
            />
            {props.upload ? (
              <div>
                <p className="truncate text-[13.5px] font-bold">{props.upload.name}</p>
                <p className="mt-1 text-[14px] text-dim">{props.upload.stage}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full grad transition-all"
                    style={{ width: `${Math.round((props.upload.ratio ?? 0.4) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="text-[13.5px] font-bold text-muted">
                  {language.t("material.drop")}
                </p>
                <div className="mt-2.5 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="grad rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white"
                  >
                    {language.t("material.choose")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasting((v) => !v)}
                    className="rounded-full border border-line px-3.5 py-1.5 text-[13px] font-bold text-muted transition hover:text-fg"
                  >
                    {language.t("material.paste")}
                  </button>
                </div>
              </>
            )}
          </div>

          {pasting ? (
            <div className="rounded-md border border-line bg-panel-2 p-2">
              <textarea
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={5}
                placeholder={language.t("material.pastePlaceholder")}
                className="w-full resize-none bg-transparent p-1 text-[14px] outline-none placeholder:text-dim"
              />
              <button
                type="button"
                disabled={!pasted.trim()}
                onClick={() => {
                  props.onAddText(
                    `${pasted.trim().split(/\s+/).slice(0, 5).join(" ")}…`,
                    pasted.trim(),
                  );
                  setPasted("");
                  setPasting(false);
                }}
                className="mt-1 w-full rounded-full bg-panel-3 py-1.5 text-[13px] font-bold disabled:opacity-40"
              >
                Add to this lesson
              </button>
            </div>
          ) : null}

          {props.materials.length ? (
            <ul className="space-y-1.5">
              {props.materials.map((material) => {
                const selected = props.selectedIds.includes(material.id);
                return (
                  <li key={material.id}>
                    <div
                      className={`group flex items-start gap-2 rounded-md border p-2 transition ${
                        selected
                          ? "border-cyan/40 bg-cyan/[.06]"
                          : "border-line bg-panel-2 hover:border-line-2"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => props.onToggle(material.id)}
                        className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      >
                        <span
                          className={`mt-[1px] text-base leading-none ${selected ? "text-cyan" : "text-dim"}`}
                        >
                          {KIND_ICON[material.kind]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-bold">{material.name}</span>
                          <span className="block text-[12px] text-dim">
                            {material.chunkCount} chunk{material.chunkCount === 1 ? "" : "s"}
                            {material.unitCount ? ` · ${material.unitCount} ${material.kind === "pptx" ? "slides" : material.kind === "pdf" ? "pages" : "parts"}` : ""}
                            {material.images?.length ? " · has images" : ""}
                          </span>
                        </span>
                        <span
                          className={`mt-[2px] h-3.5 w-3.5 shrink-0 rounded-[4px] border ${
                            selected ? "grad border-transparent" : "border-line-2"
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onRemove(material.id)}
                        title={language.t("material.deleteFile")}
                        className="opacity-0 transition group-hover:opacity-100 hover:text-pink"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-1 text-[13px] leading-relaxed text-dim">
              {language.t("material.emptyHint")}
            </p>
          )}

          <div className="rounded-md border border-line bg-panel-2 p-2.5">
            <label className="mb-1.5 block text-[14px] font-semibold uppercase tracking-wide text-dim">
              {language.t("material.whatCover")}
            </label>
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") props.onStartLesson(goal);
              }}
              placeholder={language.t("material.goalPlaceholder")}
              className="w-full rounded-sm border border-line bg-ink px-2.5 py-1.5 text-[13.5px] outline-none focus:border-cyan/60"
            />
            <button
              type="button"
              disabled={props.busy}
              onClick={() => props.onStartLesson(goal)}
              className="mt-2 w-full rounded-full grad py-2 text-[13.5px] font-semibold text-white disabled:opacity-40"
            >
              {language.t("material.start")}
            </button>
            {props.dueCount > 0 ? (
              <button
                type="button"
                onClick={props.onOpenReview}
                className="mt-1.5 w-full rounded-full border border-cyan/40 bg-cyan/[.06] py-2 text-[13.5px] font-bold text-cyan transition hover:bg-cyan/[.12]"
              >
                Review {props.dueCount} due card{props.dueCount === 1 ? "" : "s"}
              </button>
            ) : null}

            {/* On the board the destinations live here rather than in the
                header: the board wants its full width, and this panel is where
                a student is already deciding what to do next. */}
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-dim">
                {language.t("nav.goTo")}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {BOARD_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="tx press rounded-full bg-[var(--tint)] px-3 py-2 text-center text-[13px] font-medium text-muted shadow-[inset_0_0_0_0.5px_var(--hairline)] hover:text-fg"
                  >
                    {language.t(link.key)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          <button
            type="button"
            onClick={props.onNewSession}
            className="w-full rounded-full border border-line py-2 text-[13.5px] font-bold text-muted transition hover:border-cyan/50 hover:text-fg"
          >
            + {language.t("board.newLesson")}
          </button>
          {props.sessions.length === 0 ? (
            <p className="px-1 pt-3 text-[13px] text-dim">
              {language.t("lessons.emptyHint")}
            </p>
          ) : (
            props.sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center gap-2 rounded-md border p-2 transition ${
                  session.id === props.currentSessionId
                    ? "border-cyan/40 bg-cyan/[.06]"
                    : "border-line bg-panel-2 hover:border-line-2"
                }`}
              >
                <button
                  type="button"
                  onClick={() => props.onOpenSession(session.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[13.5px] font-bold">{session.title}</span>
                  <span className="block text-[12px] text-dim">
                    {new Date(session.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    {" · "}
                    {session.actions.filter((a) => a.type !== "say" && a.type !== "done").length} cards
                    {session.usage.costUsd > 0 ? ` · ${formatCost(session.usage.costUsd)}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => props.onDeleteSession(session.id)}
                  className="opacity-0 transition group-hover:opacity-100 hover:text-pink"
                  title={language.t("lessons.delete")}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
