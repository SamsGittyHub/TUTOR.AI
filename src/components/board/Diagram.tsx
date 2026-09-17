"use client";

import { useMemo } from "react";
import { unescapeBreaks, type DiagramAction, type DiagramNode } from "@/lib/actions";
import { inkColor, type BoardTheme } from "./ink";

interface Placed {
  node: DiagramNode;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
}

const CHAR_W = 7.4;
const LINE_H = 18;
const PAD_X = 22;
const PAD_Y = 16;
const MAX_CHARS = 20;
/** Edge labels sit in the gap between two nodes, so they wrap much sooner. */
const EDGE_CHARS = 14;

/** Greedy wrap of one paragraph, at most `maxLines` lines. */
function wrapOne(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current.length) current = word;
    else if (current.length + word.length + 1 <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines - 1 && current.length > maxChars) {
      current = `${current.slice(0, maxChars - 1)}…`;
      break;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/**
 * A label's own line breaks are honoured before any wrapping.
 *
 * Models write two-line node labels — a name, then a qualifier — and the break
 * is the whole point of the layout. Splitting only on whitespace turned that
 * into one long run, which is why "P: n x n" and "full matrix" ended up on the
 * same line with a stray escape between them.
 */
function wrap(label: string): string[] {
  // Also unescaped here, not only in normalizeAction: lessons saved before
  // that fix replay their stored text verbatim, so a board a student already
  // has would keep showing the literal escape forever.
  const paragraphs = unescapeBreaks(label)
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length <= 1) {
    return wrapOne(label.trim(), MAX_CHARS, 3);
  }
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (lines.length >= 3) break;
    lines.push(...wrapOne(paragraph, MAX_CHARS, 3 - lines.length));
  }
  return lines.slice(0, 3);
}

function measure(node: DiagramNode): { w: number; h: number; lines: string[] } {
  const lines = wrap(node.label);
  const longest = Math.max(...lines.map((l) => l.length), 4);
  let w = Math.round(longest * CHAR_W) + PAD_X * 2;
  let h = lines.length * LINE_H + PAD_Y * 2;
  if (node.shape === "circle") {
    const size = Math.max(w, h, 74);
    w = size;
    h = size;
  }
  if (node.shape === "diamond") {
    w += 28;
    h += 18;
  }
  return { w: Math.min(w, 260), h, lines };
}

/**
 * Four layouts, no dependency.
 *
 * A real graph library would place these better, but it would also ship 90 KB
 * to draw six boxes and an arrow. Diagrams from a tutor are small by nature —
 * the constraint is what keeps them legible.
 */
function layout(action: DiagramAction): {
  placed: Placed[];
  width: number;
  height: number;
} {
  const measured = action.nodes.map((node) => ({ node, ...measure(node) }));

  // Labelled edges need room to sit in. The widest wrapped label decides how
  // much: without this a row layout packs nodes 44px apart and the labels
  // overlap each other across the middle node.
  const labelWidth = Math.max(
    0,
    ...action.edges
      .filter((e) => e.label)
      .map(
        (e) =>
          Math.max(
            ...wrapOne(unescapeBreaks(e.label!), EDGE_CHARS, 2).map(
              (l) => l.length,
            ),
          ) *
          CHAR_W,
      ),
  );
  const gapY = Math.max(62, labelWidth ? 74 : 62);
  const gapX = Math.max(44, Math.round(labelWidth) + 26);

  if (action.layout === "row") {
    let x = 0;
    const height = Math.max(...measured.map((m) => m.h));
    const placed = measured.map((m) => {
      const item: Placed = { ...m, x, y: (height - m.h) / 2 };
      x += m.w + gapX;
      return item;
    });
    return { placed, width: Math.max(x - gapX, 1), height };
  }

  if (action.layout === "cycle") {
    const count = measured.length;
    const maxW = Math.max(...measured.map((m) => m.w));
    const radius = Math.max(120, (count * (maxW + 30)) / (2 * Math.PI));
    const size = radius * 2 + maxW + 40;
    const placed = measured.map((m, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      return {
        ...m,
        x: size / 2 + Math.cos(angle) * radius - m.w / 2,
        y: size / 2 + Math.sin(angle) * radius - m.h / 2,
      };
    });
    return { placed, width: size, height: size };
  }

  if (action.layout === "tree") {
    // Level by BFS from every node that nothing points at.
    const incoming = new Map<string, number>();
    for (const node of action.nodes) incoming.set(node.id, 0);
    for (const edge of action.edges)
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);

    const level = new Map<string, number>();
    const queue = action.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
    for (const id of queue) level.set(id, 0);
    if (!queue.length && action.nodes.length) {
      level.set(action.nodes[0].id, 0);
      queue.push(action.nodes[0].id);
    }
    while (queue.length) {
      const id = queue.shift() as string;
      const depth = level.get(id) ?? 0;
      for (const edge of action.edges.filter((e) => e.from === id)) {
        if (level.has(edge.to)) continue;
        level.set(edge.to, depth + 1);
        queue.push(edge.to);
      }
    }
    for (const m of measured) if (!level.has(m.node.id)) level.set(m.node.id, 0);

    const rows = new Map<number, typeof measured>();
    for (const m of measured) {
      const depth = level.get(m.node.id) ?? 0;
      rows.set(depth, [...(rows.get(depth) ?? []), m]);
    }

    const rowWidths = [...rows.entries()].map(([depth, items]) => ({
      depth,
      width: items.reduce((sum, i) => sum + i.w, 0) + gapX * (items.length - 1),
    }));
    const width = Math.max(...rowWidths.map((r) => r.width), 1);

    const placed: Placed[] = [];
    let y = 0;
    for (const depth of [...rows.keys()].sort((a, b) => a - b)) {
      const items = rows.get(depth) as typeof measured;
      const rowWidth = items.reduce((sum, i) => sum + i.w, 0) + gapX * (items.length - 1);
      let x = (width - rowWidth) / 2;
      const rowHeight = Math.max(...items.map((i) => i.h));
      for (const item of items) {
        placed.push({ ...item, x, y: y + (rowHeight - item.h) / 2 });
        x += item.w + gapX;
      }
      y += rowHeight + gapY;
    }
    return { placed, width, height: Math.max(y - gapY, 1) };
  }

  // flow: one column, centered
  const width = Math.max(...measured.map((m) => m.w));
  let y = 0;
  const placed = measured.map((m) => {
    const item: Placed = { ...m, x: (width - m.w) / 2, y };
    y += m.h + gapY;
    return item;
  });
  return { placed, width, height: Math.max(y - gapY, 1) };
}

/** Where an edge should leave a box, aimed at the other box's center. */
function anchor(from: Placed, to: Placed): { x: number; y: number } {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const tx = to.x + to.w / 2;
  const ty = to.y + to.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = from.w / 2 + 6;
  const halfH = from.h / 2 + 6;
  const scale = Math.min(
    dx === 0 ? Infinity : halfW / Math.abs(dx),
    dy === 0 ? Infinity : halfH / Math.abs(dy),
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

interface Props {
  action: DiagramAction;
  theme: BoardTheme;
}

export function Diagram({ action, theme }: Props) {
  const { placed, width, height } = useMemo(() => layout(action), [action]);
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const stroke = theme === "chalk" ? "#f4f4ee" : "#16161a";
  const faint = theme === "chalk" ? "rgba(244,244,238,.55)" : "rgba(22,22,26,.55)";
  const paper = theme === "chalk" ? "#14211c" : "#fcfcfa";
  const pad = 26;
  const markerId = `arrow-${action.id}`;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
      className="w-full"
      style={{ maxHeight: Math.min(height + pad * 2, 620) }}
      role="img"
      aria-label={action.title ?? "diagram"}
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill={faint} />
        </marker>
      </defs>

      {action.edges.map((edge, index) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const start = anchor(from, to);
        const end = anchor(to, from);
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const length = Math.hypot(end.x - start.x, end.y - start.y);

        return (
          <g key={`${edge.from}-${edge.to}-${index}`}>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={faint}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeDasharray={edge.dashed ? "6 6" : undefined}
              markerEnd={`url(#${markerId})`}
              className={edge.dashed ? undefined : "stroke-draw"}
              style={
                edge.dashed
                  ? undefined
                  : ({
                      "--len": length,
                      "--dur": `${Math.min(680, 260 + length)}ms`,
                    } as React.CSSProperties)
              }
            />
            {edge.label ? (
              /*
               * Wrapped, and stacked upward from the line.
               *
               * A long label centred on a short edge overruns both nodes, and
               * on a row layout two of them grow toward each other until they
               * overlap in the middle — which is what "compressed model" and
               * "multiply by transpose" were doing. Wrapping keeps each label
               * inside roughly its own span.
               */
              <text
                x={midX}
                y={
                  midY -
                  8 -
                  (wrapOne(unescapeBreaks(edge.label), EDGE_CHARS, 2).length - 1) *
                    13
                }
                textAnchor="middle"
                className="hand"
                fontSize="13"
                fill={faint}
                stroke={paper}
                strokeWidth="5"
                paintOrder="stroke"
              >
                {wrapOne(unescapeBreaks(edge.label), EDGE_CHARS, 2).map((line, i) => (
                  <tspan key={i} x={midX} dy={i === 0 ? 0 : 13}>
                    {line}
                  </tspan>
                ))}
              </text>
            ) : null}
          </g>
        );
      })}

      {placed.map((item, index) => {
        const color = inkColor(item.node.color, theme);
        const cx = item.x + item.w / 2;
        const cy = item.y + item.h / 2;
        const delay = `${index * 70}ms`;
        return (
          <g key={item.node.id} style={{ animationDelay: delay }}>
            {item.node.shape === "circle" ? (
              <circle
                cx={cx}
                cy={cy}
                r={item.w / 2}
                fill="none"
                stroke={color}
                strokeWidth={2}
              />
            ) : item.node.shape === "diamond" ? (
              <polygon
                points={`${cx},${item.y} ${item.x + item.w},${cy} ${cx},${item.y + item.h} ${item.x},${cy}`}
                fill="none"
                stroke={color}
                strokeWidth={2}
              />
            ) : (
              <rect
                x={item.x}
                y={item.y}
                width={item.w}
                height={item.h}
                rx={item.node.shape === "round" ? item.h / 2 : 10}
                fill="none"
                stroke={color}
                strokeWidth={2}
              />
            )}
            {item.lines.map((line, lineIndex) => (
              <text
                key={lineIndex}
                x={cx}
                y={cy - ((item.lines.length - 1) * LINE_H) / 2 + lineIndex * LINE_H + 5}
                textAnchor="middle"
                className="hand"
                fontSize="16"
                fill={item.node.color === "ink" ? stroke : color}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
