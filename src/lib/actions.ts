/**
 * The tutor-action schema.
 *
 * Every model — Claude, GPT, Gemini, whatever OpenRouter is fronting — is asked
 * to emit these objects and nothing else. The whiteboard renders them; the
 * session log stores them; quizzes reuse them. Keeping the vocabulary small is
 * deliberate: cheap models fall apart when a schema has thirty branches.
 */

export type PenColor = "ink" | "cyan" | "pink" | "amber" | "green" | "violet";

export const PEN_COLORS: PenColor[] = [
  "ink",
  "cyan",
  "pink",
  "amber",
  "green",
  "violet",
];

/** Where on the board a card came from in the user's own material. */
export interface SourceRef {
  /** Material id, or the empty string when the tutor spoke from general knowledge. */
  materialId: string;
  /** "page 4", "slide 12", "07:31" — whatever the extractor recorded. */
  locator: string;
  /** Short quote the tutor is leaning on, if it gave one. */
  quote?: string;
}

interface Common {
  id: string;
  sourceRefs?: SourceRef[];
}

/** Opening move: the roadmap, pinned above the board. */
export interface LessonPlanAction extends Common {
  type: "lesson_plan";
  title: string;
  steps: string[];
}

/** Narration. Goes in the chat rail, not on the board. */
export interface SayAction extends Common {
  type: "say";
  text: string;
}

export interface TextAction extends Common {
  type: "write_text";
  text: string;
  style: "title" | "body" | "note";
  color: PenColor;
}

export interface EquationAction extends Common {
  type: "write_equation";
  latex: string;
  label?: string;
  color: PenColor;
}

export interface StepItem {
  text?: string;
  latex?: string;
  note?: string;
}

export interface StepsAction extends Common {
  type: "write_steps";
  title?: string;
  steps: StepItem[];
  color: PenColor;
}

export interface TableAction extends Common {
  type: "write_table";
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface DiagramNode {
  id: string;
  label: string;
  shape: "box" | "round" | "circle" | "diamond";
  color: PenColor;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface DiagramAction extends Common {
  type: "draw_diagram";
  title?: string;
  layout: "flow" | "row" | "cycle" | "tree";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface PlotCurve {
  /** Expression in x, e.g. "sin(x)/x" or "x^2 - 3*x + 2". */
  expr: string;
  label?: string;
  color: PenColor;
}

export interface PlotPoint {
  x: number;
  y: number;
  label?: string;
  color: PenColor;
}

export interface PlotAction extends Common {
  type: "draw_plot";
  title?: string;
  xRange: [number, number];
  yRange?: [number, number];
  curves: PlotCurve[];
  points: PlotPoint[];
  xLabel?: string;
  yLabel?: string;
}

/** Marker over a card already on the board. */
export interface HighlightAction extends Common {
  type: "highlight";
  targetId: string;
  note?: string;
}

export interface EraseAction extends Common {
  type: "erase";
  targetId: string;
}

/** A check-for-understanding the student answers inline. */
export interface AskAction extends Common {
  type: "ask_question";
  question: string;
  choices?: string[];
  /** Index into `choices`, or free text when there are none. */
  answer?: string;
  explanation?: string;
}

/** End of turn. Carries the tutor's read on where the lesson is. */
export interface DoneAction extends Common {
  type: "done";
  stepIndex?: number;
  suggestions?: string[];
}

export type TutorAction =
  | LessonPlanAction
  | SayAction
  | TextAction
  | EquationAction
  | StepsAction
  | TableAction
  | DiagramAction
  | PlotAction
  | HighlightAction
  | EraseAction
  | AskAction
  | DoneAction;

export type BoardAction = Exclude<
  TutorAction,
  SayAction | HighlightAction | EraseAction | DoneAction | LessonPlanAction
>;

export const BOARD_TYPES = new Set([
  "write_text",
  "write_equation",
  "write_steps",
  "write_table",
  "draw_diagram",
  "draw_plot",
  "ask_question",
]);

export function isBoardAction(action: TutorAction): action is BoardAction {
  return BOARD_TYPES.has(action.type);
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

let counter = 0;
function nextId(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return fallback;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v)).filter((v) => v.length > 0);
}

function color(value: unknown, fallback: PenColor = "ink"): PenColor {
  const v = str(value).toLowerCase();
  if ((PEN_COLORS as string[]).includes(v)) return v as PenColor;
  // Models love inventing colors. Map the common near-misses.
  if (v === "blue" || v === "teal") return "cyan";
  if (v === "red" || v === "magenta" || v === "purple") return "pink";
  if (v === "orange" || v === "yellow" || v === "gold") return "amber";
  if (v === "black" || v === "dark" || v === "default") return "ink";
  return fallback;
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function refs(value: unknown): SourceRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((raw): SourceRef | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const locator = str(r.locator ?? r.page ?? r.slide ?? r.timestamp);
      const materialId = str(r.materialId ?? r.material_id);
      if (!locator && !materialId) return null;
      const quote = str(r.quote);
      return { materialId, locator, quote: quote || undefined };
    })
    .filter((r): r is SourceRef => r !== null);
  return out.length ? out : undefined;
}

/**
 * Turn whatever the model produced into a valid action, or null.
 *
 * This is intentionally forgiving — a cheap model that writes `{"type":"text",
 * "content":"..."}` still gets its card on the board rather than a red error.
 */
export function normalizeAction(raw: unknown): TutorAction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rawType = str(r.type ?? r.action ?? r.kind)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const id = str(r.id) || nextId(rawType || "act");
  const sourceRefs = refs(r.sourceRefs ?? r.source_refs ?? r.sources);
  const base = { id, sourceRefs };

  switch (rawType) {
    case "lesson_plan":
    case "plan": {
      const steps = strArray(r.steps ?? r.outline ?? r.items);
      if (!steps.length) return null;
      return {
        ...base,
        type: "lesson_plan",
        title: str(r.title, "Lesson plan"),
        steps,
      };
    }

    case "say":
    case "speak":
    case "narrate": {
      const text = str(r.text ?? r.content ?? r.message);
      if (!text.trim()) return null;
      return { ...base, type: "say", text };
    }

    case "write_text":
    case "text":
    case "write": {
      const text = str(r.text ?? r.content ?? r.value);
      if (!text.trim()) return null;
      const rawStyle = str(r.style).toLowerCase();
      const style =
        rawStyle === "title" || rawStyle === "heading"
          ? "title"
          : rawStyle === "note" || rawStyle === "caption"
            ? "note"
            : "body";
      return { ...base, type: "write_text", text, style, color: color(r.color) };
    }

    case "write_equation":
    case "equation":
    case "math": {
      const latex = str(r.latex ?? r.equation ?? r.text ?? r.content);
      if (!latex.trim()) return null;
      return {
        ...base,
        type: "write_equation",
        latex: latex.trim(),
        label: str(r.label) || undefined,
        color: color(r.color, "cyan"),
      };
    }

    case "write_steps":
    case "steps":
    case "solution": {
      const rawSteps = Array.isArray(r.steps) ? r.steps : [];
      const steps: StepItem[] = rawSteps
        .map((s): StepItem => {
          if (typeof s === "string") return { text: s };
          if (!s || typeof s !== "object") return {};
          const o = s as Record<string, unknown>;
          return {
            text: str(o.text ?? o.description ?? o.content) || undefined,
            latex: str(o.latex ?? o.equation ?? o.math) || undefined,
            note: str(o.note ?? o.reason ?? o.why) || undefined,
          };
        })
        .filter((s) => s.text || s.latex || s.note);
      if (!steps.length) return null;
      return {
        ...base,
        type: "write_steps",
        title: str(r.title) || undefined,
        steps,
        color: color(r.color),
      };
    }

    case "write_table":
    case "table": {
      const headers = strArray(r.headers ?? r.columns);
      const rawRows = Array.isArray(r.rows) ? r.rows : [];
      const rows = rawRows
        .map((row) => (Array.isArray(row) ? row.map((c) => str(c)) : []))
        .filter((row) => row.length > 0);
      if (!headers.length || !rows.length) return null;
      return {
        ...base,
        type: "write_table",
        title: str(r.title) || undefined,
        headers,
        rows,
      };
    }

    case "draw_diagram":
    case "diagram":
    case "graph": {
      const rawNodes = Array.isArray(r.nodes) ? r.nodes : [];
      const nodes: DiagramNode[] = rawNodes
        .map((n, i): DiagramNode | null => {
          if (typeof n === "string") {
            return {
              id: `n${i + 1}`,
              label: n,
              shape: "box",
              color: "ink",
            };
          }
          if (!n || typeof n !== "object") return null;
          const o = n as Record<string, unknown>;
          const label = str(o.label ?? o.text ?? o.name ?? o.id);
          if (!label) return null;
          const shapeRaw = str(o.shape).toLowerCase();
          const shape: DiagramNode["shape"] =
            shapeRaw === "circle"
              ? "circle"
              : shapeRaw === "diamond" || shapeRaw === "decision"
                ? "diamond"
                : shapeRaw === "round" || shapeRaw === "pill"
                  ? "round"
                  : "box";
          return {
            id: str(o.id) || `n${i + 1}`,
            label,
            shape,
            color: color(o.color),
          };
        })
        .filter((n): n is DiagramNode => n !== null);
      if (!nodes.length) return null;

      const known = new Set(nodes.map((n) => n.id));
      const rawEdges = Array.isArray(r.edges ?? r.links) ? (r.edges ?? r.links) : [];
      const edges: DiagramEdge[] = (rawEdges as unknown[])
        .map((e): DiagramEdge | null => {
          if (!e || typeof e !== "object") return null;
          const o = e as Record<string, unknown>;
          const from = str(o.from ?? o.source ?? o.a);
          const to = str(o.to ?? o.target ?? o.b);
          if (!known.has(from) || !known.has(to)) return null;
          return {
            from,
            to,
            label: str(o.label ?? o.text) || undefined,
            dashed: Boolean(o.dashed),
          };
        })
        .filter((e): e is DiagramEdge => e !== null);

      const layoutRaw = str(r.layout).toLowerCase();
      const layout: DiagramAction["layout"] =
        layoutRaw === "row" || layoutRaw === "horizontal"
          ? "row"
          : layoutRaw === "cycle" || layoutRaw === "circular"
            ? "cycle"
            : layoutRaw === "tree" || layoutRaw === "hierarchy"
              ? "tree"
              : "flow";

      return {
        ...base,
        type: "draw_diagram",
        title: str(r.title) || undefined,
        layout,
        nodes,
        edges,
      };
    }

    case "draw_plot":
    case "plot":
    case "chart": {
      const rawCurves = Array.isArray(r.curves ?? r.functions)
        ? (r.curves ?? r.functions)
        : [];
      const curves: PlotCurve[] = (rawCurves as unknown[])
        .map((c, i): PlotCurve | null => {
          if (typeof c === "string") {
            return { expr: c, color: i === 0 ? "cyan" : "pink" };
          }
          if (!c || typeof c !== "object") return null;
          const o = c as Record<string, unknown>;
          const expr = str(o.expr ?? o.fn ?? o.equation ?? o.y);
          if (!expr) return null;
          return {
            expr,
            label: str(o.label) || undefined,
            color: color(o.color, i === 0 ? "cyan" : "pink"),
          };
        })
        .filter((c): c is PlotCurve => c !== null);

      const rawPoints = Array.isArray(r.points) ? r.points : [];
      const points: PlotPoint[] = rawPoints
        .map((p): PlotPoint | null => {
          if (!p || typeof p !== "object") return null;
          const o = p as Record<string, unknown>;
          if (o.x === undefined || o.y === undefined) return null;
          return {
            x: num(o.x, 0),
            y: num(o.y, 0),
            label: str(o.label) || undefined,
            color: color(o.color, "pink"),
          };
        })
        .filter((p): p is PlotPoint => p !== null);

      if (!curves.length && !points.length) return null;

      const xr = Array.isArray(r.xRange ?? r.x_range)
        ? (r.xRange ?? r.x_range)
        : null;
      const yr = Array.isArray(r.yRange ?? r.y_range)
        ? (r.yRange ?? r.y_range)
        : null;
      const xRange: [number, number] = xr
        ? [num((xr as unknown[])[0], -10), num((xr as unknown[])[1], 10)]
        : [-10, 10];
      const yRange = yr
        ? ([num((yr as unknown[])[0], -10), num((yr as unknown[])[1], 10)] as [
            number,
            number,
          ])
        : undefined;

      return {
        ...base,
        type: "draw_plot",
        title: str(r.title) || undefined,
        xRange: xRange[0] < xRange[1] ? xRange : [-10, 10],
        yRange: yRange && yRange[0] < yRange[1] ? yRange : undefined,
        curves,
        points,
        xLabel: str(r.xLabel ?? r.x_label) || undefined,
        yLabel: str(r.yLabel ?? r.y_label) || undefined,
      };
    }

    case "highlight":
    case "circle":
    case "underline": {
      const targetId = str(r.targetId ?? r.target_id ?? r.target);
      if (!targetId) return null;
      return {
        ...base,
        type: "highlight",
        targetId,
        note: str(r.note ?? r.text) || undefined,
      };
    }

    case "erase":
    case "clear": {
      const targetId = str(r.targetId ?? r.target_id ?? r.target);
      if (!targetId) return null;
      return { ...base, type: "erase", targetId };
    }

    case "ask_question":
    case "ask":
    case "question":
    case "check": {
      const question = str(r.question ?? r.text ?? r.prompt);
      if (!question.trim()) return null;
      const choices = strArray(r.choices ?? r.options);
      return {
        ...base,
        type: "ask_question",
        question,
        choices: choices.length >= 2 ? choices : undefined,
        answer: str(r.answer ?? r.correct) || undefined,
        explanation: str(r.explanation ?? r.why) || undefined,
      };
    }

    case "done":
    case "end":
    case "finish": {
      return {
        ...base,
        type: "done",
        stepIndex:
          r.stepIndex === undefined && r.step_index === undefined
            ? undefined
            : num(r.stepIndex ?? r.step_index, 0),
        suggestions: strArray(r.suggestions ?? r.next).slice(0, 4),
      };
    }

    default:
      return null;
  }
}

/** Plain-text rendering of an action, for transcripts fed back to the model. */
export function actionToText(action: TutorAction): string {
  switch (action.type) {
    case "lesson_plan":
      return `[plan:${action.id}] ${action.title}: ${action.steps.join(" | ")}`;
    case "say":
      return action.text;
    case "write_text":
      return `[board:${action.id}] ${action.text}`;
    case "write_equation":
      return `[board:${action.id}] $$${action.latex}$$`;
    case "write_steps":
      return `[board:${action.id}] ${action.title ?? "Steps"}: ${action.steps
        .map((s, i) => `${i + 1}. ${s.text ?? ""} ${s.latex ? `$${s.latex}$` : ""}`)
        .join(" ")}`;
    case "write_table":
      return `[board:${action.id}] table(${action.headers.join(", ")}) x${action.rows.length}`;
    case "draw_diagram":
      return `[board:${action.id}] diagram ${action.title ?? ""} nodes: ${action.nodes
        .map((n) => n.label)
        .join(", ")}`;
    case "draw_plot":
      return `[board:${action.id}] plot ${action.curves.map((c) => c.expr).join(", ")}`;
    case "highlight":
      return `[highlighted ${action.targetId}]`;
    case "erase":
      return `[erased ${action.targetId}]`;
    case "ask_question":
      return `[board:${action.id}] Q: ${action.question}${
        action.choices ? ` (${action.choices.join(" / ")})` : ""
      }`;
    case "done":
      return "[end of turn]";
  }
}
