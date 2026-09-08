"use client";

import { useMemo } from "react";
import type { PlotAction } from "@/lib/actions";
import { compileExpression } from "@/lib/expr";
import { inkColor, type BoardTheme } from "./ink";

const W = 520;
const H = 340;
const M = { top: 26, right: 22, bottom: 34, left: 44 };

interface Sample {
  /** Broken into segments so an asymptote doesn't draw a vertical line. */
  paths: string[];
  color: string;
  label?: string;
  min: number;
  max: number;
}

function niceTicks(min: number, max: number, target = 6): number[] {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [min];
  const rough = span / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step / 1000; t += step) {
    ticks.push(Math.abs(t) < step / 1000 ? 0 : Number(t.toFixed(6)));
  }
  return ticks;
}

function label(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) return value.toExponential(0);
  return String(Number(value.toFixed(2)));
}

interface Props {
  action: PlotAction;
  theme: BoardTheme;
}

export function Plot({ action, theme }: Props) {
  const stroke = theme === "chalk" ? "#f4f4ee" : "#16161a";
  const grid = theme === "chalk" ? "rgba(244,244,238,.13)" : "rgba(22,22,26,.10)";
  const axis = theme === "chalk" ? "rgba(244,244,238,.6)" : "rgba(22,22,26,.55)";

  const model = useMemo(() => {
    const [x0, x1] = action.xRange;
    const steps = 340;
    const raw = action.curves.map((curve) => {
      const fn = compileExpression(curve.expr);
      const points: ({ x: number; y: number } | null)[] = [];
      let min = Infinity;
      let max = -Infinity;
      if (fn) {
        for (let i = 0; i <= steps; i += 1) {
          const x = x0 + ((x1 - x0) * i) / steps;
          let y: number;
          try {
            y = fn(x);
          } catch {
            y = NaN;
          }
          if (Number.isFinite(y) && Math.abs(y) < 1e6) {
            points.push({ x, y });
            if (y < min) min = y;
            if (y > max) max = y;
          } else {
            points.push(null);
          }
        }
      }
      return { curve, points, min, max, ok: Boolean(fn) };
    });

    // Auto y-range from the data unless the model gave one, clipped so a single
    // spike near an asymptote doesn't flatten everything else.
    let [y0, y1] = action.yRange ?? [Infinity, -Infinity];
    if (!action.yRange) {
      const finite = raw
        .flatMap((r) => r.points.filter(Boolean) as { y: number }[])
        .map((p) => p.y)
        .sort((a, b) => a - b);
      const pointYs = action.points.map((p) => p.y);
      if (finite.length) {
        const lo = finite[Math.floor(finite.length * 0.02)];
        const hi = finite[Math.floor(finite.length * 0.98)];
        y0 = Math.min(lo, ...pointYs, 0);
        y1 = Math.max(hi, ...pointYs, 0);
      } else if (pointYs.length) {
        y0 = Math.min(...pointYs);
        y1 = Math.max(...pointYs);
      }
      if (!Number.isFinite(y0) || !Number.isFinite(y1) || y0 === y1) {
        y0 = -10;
        y1 = 10;
      }
      const pad = (y1 - y0) * 0.12;
      y0 -= pad;
      y1 += pad;
    }

    const sx = (x: number) => M.left + ((x - x0) / (x1 - x0)) * (W - M.left - M.right);
    const sy = (y: number) => H - M.bottom - ((y - y0) / (y1 - y0)) * (H - M.top - M.bottom);

    const samples: Sample[] = raw.map((r) => {
      const paths: string[] = [];
      let current = "";
      let previousY: number | null = null;
      for (const point of r.points) {
        if (!point || point.y < y0 - (y1 - y0) * 2 || point.y > y1 + (y1 - y0) * 2) {
          if (current) paths.push(current);
          current = "";
          previousY = null;
          continue;
        }
        // A jump bigger than the whole visible range is a discontinuity.
        if (previousY !== null && Math.abs(point.y - previousY) > (y1 - y0) * 1.5) {
          if (current) paths.push(current);
          current = "";
        }
        current += `${current ? "L" : "M"}${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`;
        previousY = point.y;
      }
      if (current) paths.push(current);
      return {
        paths,
        color: inkColor(r.curve.color, theme),
        label: r.ok ? r.curve.label : `${r.curve.label ?? r.curve.expr} (couldn't plot)`,
        min: r.min,
        max: r.max,
      };
    });

    return { samples, sx, sy, xTicks: niceTicks(x0, x1), yTicks: niceTicks(y0, y1), y0, y1 };
  }, [action, theme]);

  const zeroY = model.y0 <= 0 && model.y1 >= 0 ? model.sy(0) : null;
  const zeroX =
    action.xRange[0] <= 0 && action.xRange[1] >= 0 ? model.sx(0) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={action.title ?? "plot"}>
      {model.xTicks.map((tick) => (
        <line
          key={`gx${tick}`}
          x1={model.sx(tick)}
          y1={M.top}
          x2={model.sx(tick)}
          y2={H - M.bottom}
          stroke={grid}
          strokeWidth={1}
        />
      ))}
      {model.yTicks.map((tick) => (
        <line
          key={`gy${tick}`}
          x1={M.left}
          y1={model.sy(tick)}
          x2={W - M.right}
          y2={model.sy(tick)}
          stroke={grid}
          strokeWidth={1}
        />
      ))}

      {zeroY !== null ? (
        <line x1={M.left} y1={zeroY} x2={W - M.right} y2={zeroY} stroke={axis} strokeWidth={1.5} />
      ) : null}
      {zeroX !== null ? (
        <line x1={zeroX} y1={M.top} x2={zeroX} y2={H - M.bottom} stroke={axis} strokeWidth={1.5} />
      ) : null}

      {model.xTicks.map((tick) => (
        <text
          key={`tx${tick}`}
          x={model.sx(tick)}
          y={H - M.bottom + 16}
          textAnchor="middle"
          fontSize="11"
          className="hand"
          fill={axis}
        >
          {label(tick)}
        </text>
      ))}
      {model.yTicks.map((tick) => (
        <text
          key={`ty${tick}`}
          x={M.left - 8}
          y={model.sy(tick) + 4}
          textAnchor="end"
          fontSize="11"
          className="hand"
          fill={axis}
        >
          {label(tick)}
        </text>
      ))}

      {model.samples.map((sample, index) =>
        sample.paths.map((path, pathIndex) => (
          <path
            key={`${index}-${pathIndex}`}
            d={path}
            fill="none"
            stroke={sample.color}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-draw"
            style={{ "--len": 2200, "--dur": "900ms" } as React.CSSProperties}
          />
        )),
      )}

      {action.points.map((point, index) => (
        <g key={index}>
          <circle
            cx={model.sx(point.x)}
            cy={model.sy(point.y)}
            r={5}
            fill={inkColor(point.color, theme)}
          />
          {point.label ? (
            <text
              x={model.sx(point.x) + 9}
              y={model.sy(point.y) - 9}
              fontSize="13"
              className="hand"
              fill={inkColor(point.color, theme)}
            >
              {point.label}
            </text>
          ) : null}
        </g>
      ))}

      {action.xLabel ? (
        <text x={W - M.right} y={H - 6} textAnchor="end" fontSize="12" className="hand" fill={axis}>
          {action.xLabel}
        </text>
      ) : null}
      {action.yLabel ? (
        <text x={6} y={M.top - 10} fontSize="12" className="hand" fill={axis}>
          {action.yLabel}
        </text>
      ) : null}

      {model.samples.filter((s) => s.label).length ? (
        <g>
          {model.samples
            .filter((s) => s.label)
            .map((sample, index) => (
              <g key={index} transform={`translate(${M.left + 8}, ${M.top + 4 + index * 18})`}>
                <line x1={0} y1={0} x2={18} y2={0} stroke={sample.color} strokeWidth={2.4} />
                <text x={24} y={4} fontSize="12" className="hand" fill={stroke}>
                  {sample.label}
                </text>
              </g>
            ))}
        </g>
      ) : null}
    </svg>
  );
}
