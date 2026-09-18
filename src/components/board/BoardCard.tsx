"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardAction, SourceRef } from "@/lib/actions";
import { Diagram } from "./Diagram";
import { Equation } from "./Equation";
import { Plot } from "./Plot";
import { inkColor, tiltFor, type BoardTheme } from "./ink";

interface Props {
  action: BoardAction;
  theme: BoardTheme;
  highlighted?: string;
  onAnswer: (question: string, answer: string) => void;
  materialName: (id: string) => string;
}

/** Generation takes tens of seconds; back off rather than hammering the route. */
const RETRY_DELAYS = [1500, 2500, 4000, 6000, 8000, 10000, 12000, 15000];

export function BoardCard({ action, theme, highlighted, onAnswer, materialName }: Props) {
  const paper = theme === "paper";
  const bodyInk = paper ? "text-board-ink" : "text-[#f4f4ee]";
  const subtle = paper ? "text-black/45" : "text-white/45";

  return (
    <article
      id={`card-${action.id}`}
      // The exporter finds diagrams and plots by this, to rasterise them
      // individually for a Word document.
      data-action-id={action.id}
      className={`card-in relative rounded-md px-5 py-4 sm:px-7 sm:py-6 ${
        highlighted
          ? paper
            ? "bg-pink/[.06] ring-2 ring-pink/40"
            : "bg-white/[.06] ring-2 ring-pink/40"
          : ""
      }`}
      style={{ "--tilt": tiltFor(action.id) } as React.CSSProperties}
    >
      <Body action={action} theme={theme} bodyInk={bodyInk} subtle={subtle} onAnswer={onAnswer} />

      {highlighted ? (
        <p className="hand mt-3 text-[15px] text-pink">↑ {highlighted}</p>
      ) : null}

      {action.sourceRefs?.length ? (
        <Sources refs={action.sourceRefs} subtle={subtle} materialName={materialName} />
      ) : null}
    </article>
  );
}

function Sources({
  refs,
  subtle,
  materialName,
}: {
  refs: SourceRef[];
  subtle: string;
  materialName: (id: string) => string;
}) {
  return (
    <p className={`mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold ${subtle}`}>
      {refs.map((ref, index) => (
        <span key={index} className="inline-flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M4 2h5l3 3v9H4V2z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          {materialName(ref.materialId)} · {ref.locator}
        </span>
      ))}
    </p>
  );
}

function Body({
  action,
  theme,
  bodyInk,
  subtle,
  onAnswer,
}: {
  action: BoardAction;
  theme: BoardTheme;
  bodyInk: string;
  subtle: string;
  onAnswer: (question: string, answer: string) => void;
}) {
  switch (action.type) {
    case "write_text": {
      const color = inkColor(action.color, theme);
      if (action.style === "title") {
        return (
          <h3 className="hand text-[30px] leading-tight sm:text-[36px]" style={{ color }}>
            {action.text}
            <span
              className="mt-2 block h-[3px] w-24 rounded-full opacity-60"
              style={{ background: color }}
            />
          </h3>
        );
      }
      if (action.style === "note") {
        return (
          <p className={`hand text-[18px] italic ${subtle}`} style={{ color }}>
            {action.text}
          </p>
        );
      }
      return (
        <p className={`hand whitespace-pre-wrap text-[21px] leading-[1.55] ${bodyInk}`} style={{ color }}>
          {action.text}
        </p>
      );
    }

    case "write_equation":
      return (
        <div className="text-center" style={{ color: inkColor(action.color, theme) }}>
          <Equation latex={action.latex} />
          {action.label ? <p className={`hand mt-1 text-[15px] ${subtle}`}>{action.label}</p> : null}
        </div>
      );

    case "write_steps":
      return (
        <div>
          {action.title ? (
            <h4 className="hand mb-3 text-[24px]" style={{ color: inkColor(action.color, theme) }}>
              {action.title}
            </h4>
          ) : null}
          <ol className="space-y-3">
            {action.steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span
                  className="hand mt-[3px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
                  style={{
                    color: inkColor(action.color, theme),
                    boxShadow: `inset 0 0 0 1.6px ${inkColor(action.color, theme)}`,
                  }}
                >
                  {index + 1}
                </span>
                <div className={`min-w-0 flex-1 ${bodyInk}`}>
                  {step.text ? <p className="hand text-[20px] leading-snug">{step.text}</p> : null}
                  {step.latex ? (
                    <div className="eq-left my-1 overflow-x-auto">
                      <Equation latex={step.latex} />
                    </div>
                  ) : null}
                  {step.note ? <p className={`hand text-[16px] ${subtle}`}>{step.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      );

    case "write_table":
      return (
        <div>
          {action.title ? <h4 className={`hand mb-2 text-[23px] ${bodyInk}`}>{action.title}</h4> : null}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  {action.headers.map((header, index) => (
                    <th
                      key={index}
                      className={`hand border-b-2 px-3 py-2 text-[17px] ${bodyInk}`}
                      style={{ borderColor: inkColor("cyan", theme) }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {action.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={`hand border-b px-3 py-2 text-[18px] ${bodyInk}`}
                        style={{
                          borderColor: theme === "paper" ? "rgba(0,0,0,.10)" : "rgba(255,255,255,.12)",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case "draw_diagram":
      return (
        <div>
          {action.title ? <h4 className={`hand mb-2 text-[23px] ${bodyInk}`}>{action.title}</h4> : null}
          <Diagram action={action} theme={theme} />
        </div>
      );

    case "draw_plot":
      return (
        <div>
          {action.title ? <h4 className={`hand mb-1 text-[23px] ${bodyInk}`}>{action.title}</h4> : null}
          <Plot action={action} theme={theme} />
        </div>
      );

    case "show_image":
      return <ImageCard action={action} theme={theme} bodyInk={bodyInk} subtle={subtle} />;

    case "ask_question":
      return <AskCard action={action} theme={theme} bodyInk={bodyInk} subtle={subtle} onAnswer={onAnswer} />;
  }
}

/**
 * A generated picture, in three states.
 *
 * The drawing takes a few seconds and the tutor keeps talking through them, so
 * the card goes up immediately saying what is coming. Reserving the space up
 * front also stops the board jumping under the student when the image lands.
 */
function ImageCard({
  action,
  theme,
  bodyInk,
  subtle,
}: {
  action: Extract<BoardAction, { type: "show_image" }>;
  theme: BoardTheme;
  bodyInk: string;
  subtle: string;
}) {
  const frame = theme === "paper" ? "border-black/10" : "border-white/15";
  const ratio =
    action.width && action.height ? `${action.width} / ${action.height}` : "3 / 2";

  /*
   * The card knows its URL before the picture exists, so a 404 here means
   * "not generated yet", not "broken". Retry on a slowing interval until it
   * appears — which also means a lesson reopened while a drawing was still
   * running picks it up rather than showing a permanent gap.
   */
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const retry = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (retry.current !== null) window.clearTimeout(retry.current);
    },
    [],
  );

  const onError = () => {
    if (attempt >= RETRY_DELAYS.length) {
      setGaveUp(true);
      return;
    }
    retry.current = window.setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAYS[attempt]);
  };

  const failed = action.error || gaveUp;
  const waiting = !loaded && !failed;

  return (
    <figure>
      <div className="relative" style={{ aspectRatio: ratio }}>
        {action.src && !action.error ? (
          // A plain img: the source is behind the session cookie, and the
          // intrinsic size is whatever the image model returned.
          <img
            key={attempt}
            src={attempt ? `${action.src}?retry=${attempt}` : action.src}
            alt={action.caption || action.prompt}
            onLoad={() => setLoaded(true)}
            onError={onError}
            className={`h-full w-full rounded-sm border ${frame} bg-white transition-opacity ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null}

        {waiting || failed ? (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed ${frame} px-6`}
          >
            {waiting ? (
              <span className="flex gap-1.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-2 w-2 animate-pulse rounded-full bg-current opacity-40"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </span>
            ) : null}
            <p className={`hand max-w-sm text-center text-[17px] ${subtle}`}>
              {failed
                ? action.error || "That drawing didn't finish."
                : `drawing ${action.prompt}…`}
            </p>
          </div>
        ) : null}
      </div>

      {action.caption ? (
        <figcaption className={`hand mt-2 text-center text-[17px] ${bodyInk} opacity-80`}>
          {action.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function AskCard({
  action,
  theme,
  bodyInk,
  subtle,
  onAnswer,
}: {
  action: Extract<BoardAction, { type: "ask_question" }>;
  theme: BoardTheme;
  bodyInk: string;
  subtle: string;
  onAnswer: (question: string, answer: string) => void;
}) {
  const [answered, setAnswered] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const submit = (value: string) => {
    if (answered || !value.trim()) return;
    setAnswered(value);
    onAnswer(action.question, value);
  };

  const border = theme === "paper" ? "border-black/15" : "border-white/20";

  return (
    <div className={`rounded-md border-2 border-dashed ${border} p-4`}>
      <p className={`hand mb-3 text-[21px] leading-snug ${bodyInk}`}>
        <span className="mr-2 rounded-full px-2 py-[2px] text-[12px] font-bold tracking-wide text-white grad align-middle">
          YOUR TURN
        </span>
        {action.question}
      </p>

      {action.choices ? (
        <div className="flex flex-wrap gap-2">
          {action.choices.map((choice, index) => {
            const picked = answered === choice;
            return (
              <button
                key={index}
                type="button"
                disabled={Boolean(answered)}
                onClick={() => submit(choice)}
                className={`hand rounded-full px-4 py-2 text-[17px] transition ${
                  picked
                    ? "grad text-white"
                    : theme === "paper"
                      ? "bg-black/[.05] text-board-ink hover:bg-black/[.09] disabled:opacity-40"
                      : "bg-white/10 text-[#f4f4ee] hover:bg-white/20 disabled:opacity-40"
                }`}
              >
                <span className="mr-2 font-bold opacity-50">
                  {String.fromCharCode(65 + index)}
                </span>
                {choice}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
          className="flex gap-2"
        >
          <input
            value={answered ?? draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={Boolean(answered)}
            placeholder="Type your answer…"
            className={`hand min-w-0 flex-1 rounded-full border px-4 py-2 text-[18px] outline-none ${
              theme === "paper"
                ? "border-black/15 bg-white text-board-ink focus:border-cyan"
                : "border-white/20 bg-white/5 text-[#f4f4ee] focus:border-cyan"
            }`}
          />
          <button
            type="submit"
            disabled={Boolean(answered)}
            className="grad rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Check
          </button>
        </form>
      )}

      {answered ? (
        <p className={`hand mt-3 text-[16px] ${subtle}`}>Sent to your tutor — hang on.</p>
      ) : null}
    </div>
  );
}
