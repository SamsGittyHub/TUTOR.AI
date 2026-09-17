"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Where the student shows their work.
 *
 * The board was one-directional — the tutor wrote, the student typed. Real
 * tutoring is "show me what you tried", and a student who is stuck usually
 * can't describe their error in words; that's what being stuck is. They sketch
 * the attempt, the tutor reads it with the same vision path that reads photos
 * of handwritten notes, and marks up the line that went wrong.
 *
 * Pointer events rather than mouse/touch pairs, so pen pressure and stylus
 * input work on a tablet, which is where most of this will happen.
 */

interface Props {
  onSend: (dataUrl: string) => void;
  onClose: () => void;
}

type Stroke = { points: { x: number; y: number }[]; color: string; width: number };

const PEN_COLORS = [
  { id: "ink", css: "#16161a" },
  { id: "cyan", css: "#0789c9" },
  { id: "pink", css: "#e03e97" },
];

export function SketchPad({ onSend, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const [color, setColor] = useState(PEN_COLORS[0].css);
  const [erasing, setErasing] = useState(false);
  const [empty, setEmpty] = useState(true);

  // Redraw everything on resize — a canvas loses its bitmap when resized.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const redraw = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.fillStyle = "#fcfcfa";
      ctx.fillRect(0, 0, rect.width, rect.height);
      for (const stroke of strokes.current) paint(ctx, stroke);
    };

    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function paint(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) {
      // A tap should still leave a dot.
      const p = stroke.points[0];
      if (!p) return;
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function positionOf(event: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function down(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    strokes.current.push({
      points: [positionOf(event)],
      color: erasing ? "#fcfcfa" : color,
      width: erasing ? 24 : 2.5,
    });
    setEmpty(false);
  }

  function move(event: React.PointerEvent) {
    if (!drawing.current) return;
    const stroke = strokes.current.at(-1);
    if (!stroke) return;
    stroke.points.push(positionOf(event));
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paint(ctx, stroke);
  }

  function up() {
    drawing.current = false;
  }

  function undo() {
    strokes.current.pop();
    setEmpty(strokes.current.length === 0);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#fcfcfa";
    ctx.fillRect(0, 0, rect.width, rect.height);
    for (const stroke of strokes.current) paint(ctx, stroke);
  }

  function clear() {
    strokes.current = [];
    setEmpty(true);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#fcfcfa";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  function send() {
    const canvas = canvasRef.current;
    if (!canvas || empty) return;
    // JPEG at 0.85: handwriting survives it, and it's a third the tokens of PNG.
    onSend(canvas.toDataURL("image/jpeg", 0.85));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden surface rounded-md">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 className="mr-auto text-[13px] font-semibold text-fg">
            Show your work
          </h2>

          {PEN_COLORS.map((pen) => (
            <button
              key={pen.id}
              type="button"
              aria-label={`${pen.id} pen`}
              aria-pressed={!erasing && color === pen.css}
              onClick={() => {
                setColor(pen.css);
                setErasing(false);
              }}
              className={`h-6 w-6 rounded-full transition ${
                !erasing && color === pen.css
                  ? "ring-2 ring-fg ring-offset-2 ring-offset-panel"
                  : "opacity-70"
              }`}
              style={{ background: pen.css }}
            />
          ))}
          <button
            type="button"
            aria-pressed={erasing}
            onClick={() => setErasing((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition ${
              erasing ? "border-line-2 text-fg" : "border-line text-muted hover:text-fg"
            }`}
          >
            Eraser
          </button>
          <button
            type="button"
            onClick={undo}
            className="rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-muted transition hover:text-fg"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-muted transition hover:text-fg"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-3 py-1.5 text-[11.5px] font-bold text-muted transition hover:text-fg"
          >
            Cancel
          </button>
        </header>

        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          // Without this the browser pans the page instead of drawing.
          className="min-h-0 flex-1 touch-none bg-[#fcfcfa]"
        />

        <footer className="flex items-center gap-3 border-t border-line px-4 py-3">
          <p className="mr-auto text-[12px] text-dim">
            Sketch your attempt — the tutor reads it and marks up the line that
            went wrong.
          </p>
          <button
            type="button"
            onClick={send}
            disabled={empty}
            className="rounded-full grad px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            Send to the tutor
          </button>
        </footer>
      </div>
    </div>
  );
}
