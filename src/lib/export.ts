import type { TutorAction } from "./actions";

/**
 * A finished lesson, as notes the student can keep.
 *
 * The board is a transient artifact — close the tab and a lesson you paid for
 * is gone. This turns the action log into Markdown, which is the one format
 * that pastes into Notion, Obsidian, a Google Doc, or a printer without
 * losing the equations.
 *
 * Pure functions, so the test runner can compile this standalone. Rendering
 * to a file is the caller's job.
 */

export interface ExportOptions {
  title: string;
  /** Epoch ms; omitted in tests for stable output. */
  date?: number;
  /** Resolve a material id to its display name for citations. */
  materialName?: (id: string) => string;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function citation(
  action: TutorAction,
  materialName?: (id: string) => string,
): string {
  if (!action.sourceRefs?.length) return "";
  const parts = action.sourceRefs.map((ref) => {
    const name = ref.materialId && materialName ? materialName(ref.materialId) : "";
    return [name, ref.locator].filter(Boolean).join(", ");
  });
  const unique = [...new Set(parts.filter(Boolean))];
  return unique.length ? `\n\n> Source: ${unique.join(" · ")}` : "";
}

/** One board action as a Markdown block, or "" when it doesn't belong in notes. */
export function actionToMarkdown(
  action: TutorAction,
  materialName?: (id: string) => string,
): string {
  const cite = citation(action, materialName);

  switch (action.type) {
    case "lesson_plan":
      return `## ${action.title}\n\n${action.steps
        .map((step, i) => `${i + 1}. ${step}`)
        .join("\n")}`;

    case "say":
      return action.text;

    case "write_text":
      if (action.style === "title") return `## ${action.text}${cite}`;
      if (action.style === "note") return `> ${action.text}${cite}`;
      return `${action.text}${cite}`;

    case "write_equation":
      return `$$\n${action.latex}\n$$${action.label ? `\n\n*${action.label}*` : ""}${cite}`;

    case "write_steps": {
      const heading = action.title ? `**${action.title}**\n\n` : "";
      const body = action.steps
        .map((step, i) => {
          const bits = [step.text, step.latex ? `$${step.latex}$` : "", step.note ? `— *${step.note}*` : ""]
            .filter(Boolean)
            .join(" ");
          return `${i + 1}. ${bits}`;
        })
        .join("\n");
      return `${heading}${body}${cite}`;
    }

    case "write_table": {
      const header = `| ${action.headers.map(escapeCell).join(" | ")} |`;
      const rule = `| ${action.headers.map(() => "---").join(" | ")} |`;
      const rows = action.rows
        .map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
        .join("\n");
      const heading = action.title ? `**${action.title}**\n\n` : "";
      return `${heading}${header}\n${rule}\n${rows}${cite}`;
    }

    case "draw_diagram": {
      // Mermaid, so the diagram survives as a diagram rather than a list.
      const shape = (id: string, label: string, kind: string) =>
        kind === "round" || kind === "circle"
          ? `${id}((${label}))`
          : kind === "diamond"
            ? `${id}{${label}}`
            : `${id}[${label}]`;
      const dir = action.layout === "row" ? "LR" : "TD";
      const nodes = action.nodes.map((n) => `  ${shape(n.id, n.label, n.shape)}`);
      const edges = action.edges.map(
        (e) =>
          `  ${e.from} ${e.dashed ? "-.->" : "-->"}${e.label ? `|${e.label}|` : ""} ${e.to}`,
      );
      const heading = action.title ? `**${action.title}**\n\n` : "";
      return `${heading}\`\`\`mermaid\nflowchart ${dir}\n${[...nodes, ...edges].join("\n")}\n\`\`\`${cite}`;
    }

    case "draw_plot": {
      const curves = action.curves.map((c) => `- \`${c.expr}\`${c.label ? ` — ${c.label}` : ""}`);
      const points = action.points.map(
        (p) => `- (${p.x}, ${p.y})${p.label ? ` — ${p.label}` : ""}`,
      );
      const heading = action.title ? `**${action.title}**\n\n` : "";
      return `${heading}Plot over x ∈ [${action.xRange[0]}, ${action.xRange[1]}]:\n${[
        ...curves,
        ...points,
      ].join("\n")}${cite}`;
    }

    case "show_image": {
      // Markdown image syntax, so it renders in a viewer that can still reach
      // the app and degrades to the alt text in one that can't.
      const alt = (action.caption || action.prompt).replace(/[[\]]/g, "");
      const body = action.src
        ? `![${alt}](${action.src})`
        : `*[a drawing of ${action.prompt}, which didn't finish]*`;
      const caption = action.caption ? `\n\n*${action.caption}*` : "";
      return `${body}${caption}${cite}`;
    }

    case "ask_question": {
      const choices = action.choices?.length
        ? `\n${action.choices.map((c) => `- ${c}`).join("\n")}`
        : "";
      const answer = action.answer ? `\n\n**Answer:** ${action.answer}` : "";
      const why = action.explanation ? `\n\n${action.explanation}` : "";
      return `**Check yourself:** ${action.question}${choices}${answer}${why}`;
    }

    // Board bookkeeping — meaningless once the board is a document. A
    // "remember" never belongs in an export either: it is the tutor's note to
    // itself about the student, not part of the lesson.
    case "highlight":
    case "erase":
    case "remember":
    case "done":
      return "";
  }
}

/** The whole lesson as one Markdown document. */
export function lessonToMarkdown(
  actions: TutorAction[],
  options: ExportOptions,
): string {
  const erased = new Set(
    actions.filter((a) => a.type === "erase").map((a) => a.targetId),
  );

  const body = actions
    // Something the tutor wiped was wrong or spent; it shouldn't reach the notes.
    .filter((action) => !erased.has(action.id))
    .map((action) => actionToMarkdown(action, options.materialName))
    .filter((block) => block.trim().length > 0)
    .join("\n\n");

  const date = options.date
    ? new Date(options.date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const header = `# ${options.title}${date ? `\n\n*${date}*` : ""}`;
  return `${header}\n\n${body}\n`;
}

/** Filename-safe slug for the download. */
export function exportFilename(title: string, extension = "md"): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lesson";
  return `${slug}.${extension}`;
}
