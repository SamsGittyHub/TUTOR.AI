import { askedForPicture, pictureIsDue } from "./illustration-pace";
import { normalizeImageRequest, type ImageRequest } from "./board-image";
import { briefLearning, type LearningProfile } from "./learning";
import type { Material, MaterialChunk, QuizAttempt, Session } from "./db";
import { rankSubjects, type GradedPaper, type SubjectInput } from "./progress";
import { retrieve } from "./materials/retrieve";
import { isDue, type ReviewCard } from "./srs";

/**
 * What the live tutor knows about the student, and how it looks things up.
 *
 * Two halves, because they answer different problems:
 *
 *   - A briefing, folded into the session instructions. Small and always
 *     present, so the tutor opens the conversation already knowing which
 *     subjects exist, what's weak and what's due. Without it the first thing
 *     a student hears is a stranger asking what they're studying.
 *   - Tools, called mid-conversation. A term of uploaded material is far
 *     larger than any prompt, so the tutor searches it when a question needs
 *     it rather than carrying all of it all the time.
 *
 * Pure functions: the voice page holds the data and passes it in, which keeps
 * this testable without a session, a microphone or a network.
 */

export interface VoiceContext {
  materials: Material[];
  chunks: MaterialChunk[];
  sessions: Session[];
  courses: { id: string; name: string; color: string }[];
  cards: ReviewCard[];
  attempts: QuizAttempt[];
  papers?: GradedPaper[];
  now?: number;
  /**
   * Starts a drawing on the board.
   *
   * An image takes several seconds and this runs inside a spoken turn, so the
   * tool hands the request over and returns at once — the picture lands on the
   * board later, while the tutor is still talking. Injected rather than done
   * here so the tool routing stays a pure function.
   */
  drawImage?: (request: ImageRequest) => void;
  /** What earlier lessons established about how this person learns. */
  learning?: LearningProfile;
  /** Writes something new into that memory. */
  remember?: (note: string) => void;
  /**
   * How the drawings get paced, since a spoken conversation has no turn
   * boundary to count.
   *
   * A voice tutor with a drawing tool will use it on every single answer
   * given the chance: each tool call is decided on its own, with no sense of
   * how recently the last picture went up. The unit here is the student's own
   * questions — the thing they actually notice — rather than tutor turns,
   * which a realtime model splits unpredictably.
   */
  pacing?: {
    /** Student questions since the last picture; null if none has been drawn. */
    questionsSincePicture: number | null;
    /** Their most recent question, so asking to see something still works. */
    lastQuestion: string;
  };
}

/* -------------------------------------------------------------------------- */
/* The briefing                                                                */
/* -------------------------------------------------------------------------- */

const MAX_BRIEF_ITEMS = 8;

function subjectsOf(context: VoiceContext): SubjectInput[] {
  return context.courses.map((course) => ({
    id: course.id,
    name: course.name,
    color: course.color,
    materialIds: context.materials
      .filter((m) => m.courseId === course.id)
      .map((m) => m.id),
  }));
}

/**
 * A few lines of orientation, appended to the session instructions.
 *
 * Deliberately short. It's spoken context for a conversation, not a dossier —
 * anything longer is better fetched by a tool when it's actually needed.
 */
export function buildBriefing(context: VoiceContext): string {
  const now = context.now ?? Date.now();
  const ranked = rankSubjects(
    subjectsOf(context),
    context.attempts,
    context.cards,
    now,
    context.papers ?? [],
  );

  const lines: string[] = [];

  if (ranked.length) {
    lines.push(
      "Subjects: " +
        ranked
          .slice(0, MAX_BRIEF_ITEMS)
          .map((s) =>
            s.confident
              ? `${s.name} (${s.label.toLowerCase()}, ${s.mastery}%)`
              : `${s.name} (too early to say)`,
          )
          .join(", "),
    );

    const ranks = ranked.filter((s) => s.confident);
    if (ranks.length > 1) {
      lines.push(
        `Strongest right now: ${ranks[0].name}. Weakest: ${ranks[ranks.length - 1].name}.`,
      );
    }
  }

  const unfiled = context.materials.filter((m) => !m.courseId);
  if (unfiled.length) {
    lines.push(
      `Material not filed under a subject: ${unfiled
        .slice(0, MAX_BRIEF_ITEMS)
        .map((m) => m.name)
        .join(", ")}`,
    );
  }

  const recent = [...context.sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
  if (recent.length) {
    lines.push(`Recent lessons: ${recent.map((s) => s.title).join(", ")}`);
  }

  const learned = context.learning ? briefLearning(context.learning) : "";
  if (learned) lines.push(`How they learn: ${learned}`);

  const due = context.cards.filter((c) => isDue(c, now)).length;
  if (due) {
    lines.push(
      due === 1
        ? "1 review card is due today."
        : `${due} review cards are due today.`,
    );
  }

  const lapsing = [...context.cards]
    .filter((c) => c.lapses > 0)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 5);
  if (lapsing.length) {
    lines.push(
      "Keeps forgetting: " + lapsing.map((c) => c.prompt.slice(0, 60)).join("; "),
    );
  }

  if (!lines.length) {
    return `\n\n## This student\n\nThey haven't uploaded anything or been taught a lesson yet. Ask what they're studying and start there.`;
  }

  return `\n\n## This student

${lines.join("\n")}

That's a summary. Use search_material whenever a question touches something
they uploaded — quote their own notes rather than teaching from general
knowledge, and say which file it came from.`;
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

/** Declarations sent to the Realtime session. */
export const VOICE_TOOLS = [
  {
    type: "function" as const,
    name: "write_on_board",
    description:
      "Write on the whiteboard the student is looking at. Send as many cards in one call as the point needs — a title, the working, a diagram and a summary table can all go up together. Call this constantly while you talk; never say the JSON out loud.",
    parameters: {
      type: "object",
      properties: {
        actions: {
          type: "string",
          description:
            'The cards to write: one board action as a JSON object per line, in the order they should appear. For example:\n{"type":"write_text","id":"t1","text":"Ohm\'s law","style":"title","color":"ink"}\n{"type":"write_equation","id":"e1","latex":"V = IR","color":"cyan"}\nSee the board schema in your instructions for every card type.',
        },
      },
      required: ["actions"],
    },
  },
  {
    type: "function" as const,
    name: "draw_image",
    description:
      "Draw a picture on the whiteboard — an illustration, a labelled cross-section, an apparatus setup, a map, anything the board's shapes and equations can't show. Takes a few seconds and appears on its own, so keep talking after you call it. Save it for the things that genuinely need seeing rather than illustrating every answer: roughly one explanation in three, or whenever the student asks to see something.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "What to draw, described fully: the subject, the parts that must be visible, and what each should be labelled. 'A labelled cross-section of a leaf showing cuticle, palisade mesophyll, spongy mesophyll, stomata and guard cells' — not 'a leaf'.",
        },
        caption: {
          type: "string",
          description: "Short line to write under the picture on the board.",
        },
        style: {
          type: "string",
          enum: ["diagram", "sketch", "realistic"],
          description:
            "diagram for a clean labelled figure (the usual choice), sketch for a hand-drawn marker look, realistic for a photograph of a real object.",
        },
        shape: {
          type: "string",
          enum: ["square", "wide", "tall"],
          description: "wide by default; tall for something upright like a tower or a column.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    type: "function" as const,
    name: "remember_this",
    description:
      "Write down something you worked out about how this student learns, kept between lessons. One short, specific sentence about what helps or what trips them up — 'needs the units written beside every number', not 'is a visual learner'. Only when you've seen it more than once. Never mention that you're doing it.",
    parameters: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description: "The observation, in one sentence.",
        },
      },
      required: ["note"],
    },
  },
  {
    type: "function" as const,
    name: "search_material",
    description:
      "Search everything the student has uploaded — notes, slides, PDFs, lecture transcripts — and get back the passages that match, with the file and page they came from. Use this whenever a question touches their own course material.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to look for, in the student's own words.",
        },
        subject: {
          type: "string",
          description:
            "Optional subject name to search within, e.g. 'Chemistry'. Omit to search everything.",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function" as const,
    name: "get_progress",
    description:
      "How the student is doing: subjects ranked strongest to weakest, quiz accuracy, cards due, and what they keep forgetting.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "list_lessons",
    description:
      "Past lessons this student has been taught, newest first, with what each covered.",
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Optional subject name to filter by.",
        },
      },
    },
  },
];

const MAX_EXCERPT_CHARS = 2400;

function findCourse(context: VoiceContext, name?: string) {
  if (!name) return undefined;
  const wanted = name.trim().toLowerCase();
  return context.courses.find((c) => c.name.toLowerCase() === wanted)
    ?? context.courses.find((c) => c.name.toLowerCase().includes(wanted));
}

/**
 * Runs one tool and returns what the model should hear back.
 *
 * Plain prose rather than JSON: this goes into a spoken conversation, and a
 * model handed a nested object will sometimes read the field names out.
 */
export function runVoiceTool(
  name: string,
  args: Record<string, unknown>,
  context: VoiceContext,
): string {
  const now = context.now ?? Date.now();

  if (name === "draw_image") {
    const request = normalizeImageRequest(args);
    if ("error" in request) return request.error;
    if (!context.drawImage) return "The board can't take a drawing right now.";

    /*
     * Paced exactly as the typed board is. Refused in words rather than
     * silently ignored: the model is mid-sentence waiting on a tool result,
     * and telling it why keeps it talking instead of leaving a gap where it
     * expected a picture to be announced.
     */
    const pacing = context.pacing;
    const wanted = pacing ? askedForPicture(pacing.lastQuestion) : true;
    if (pacing && !wanted && !pictureIsDue(pacing.questionsSincePicture)) {
      return "Not this one — there's been a picture recently, so explain this with words and the board's own shapes. Don't mention that you considered drawing.";
    }

    context.drawImage(request);
    // Said back to a model that is mid-sentence: it needs to know the picture
    // is coming without waiting for it, and to keep the student's attention on
    // the board rather than on a pause.
    return `Drawing it now — the picture appears on the board in a few seconds. Keep talking while it comes up, then walk them through what they're looking at.`;
  }

  if (name === "remember_this") {
    const note = String(args.note ?? "").replace(/\s+/g, " ").trim();
    if (note.length < 8) return "That's too vague to be worth remembering.";
    if (!context.remember) return "There's nowhere to keep that right now.";
    context.remember(note);
    return "Noted for next time. Don't mention it — carry on.";
  }

  if (name === "search_material") {
    const query = String(args.query ?? "").trim();
    if (!query) return "No query given.";

    const course = findCourse(context, args.subject as string | undefined);
    const allowed = course
      ? new Set(
          context.materials
            .filter((m) => m.courseId === course.id)
            .map((m) => m.id),
        )
      : null;

    const pool = allowed
      ? context.chunks.filter((c) => allowed.has(c.materialId))
      : context.chunks;

    if (!pool.length) {
      return course
        ? `Nothing is filed under ${course.name} yet.`
        : "They haven't uploaded any material yet.";
    }

    const result = retrieve(pool, query, MAX_EXCERPT_CHARS);
    if (!result.chunks.length) return "Nothing in their material matches that.";

    const nameOf = (id: string) =>
      context.materials.find((m) => m.id === id)?.name ?? "their notes";

    return result.chunks
      .map((chunk) => {
        // A plain text file has no pages, so its locator is the filename —
        // "From notes.txt, notes.txt" is the tutor reading a bug out loud.
        const file = nameOf(chunk.materialId);
        const where =
          chunk.locator && chunk.locator !== file ? `${file}, ${chunk.locator}` : file;
        return `From ${where}:\n${chunk.text}`;
      })
      .join("\n\n");
  }

  if (name === "get_progress") {
    const ranked = rankSubjects(
      subjectsOf(context),
      context.attempts,
      context.cards,
      now,
      context.papers ?? [],
    );
    if (!ranked.length) return "No subjects set up yet, so there's nothing ranked.";

    const lines = ranked.map((s) =>
      s.confident
        ? `${s.name}: ${s.label.toLowerCase()}, ${s.mastery}% — ${s.correct} of ${s.answered} answered right${s.dueNow ? `, ${s.dueNow} due` : ""}`
        : `${s.name}: only ${s.answered} questions answered so far, too early to rank`,
    );

    const due = context.cards.filter((c) => isDue(c, now)).length;
    if (due) lines.push(`${due} review cards are due today in total.`);
    return lines.join("\n");
  }

  if (name === "list_lessons") {
    const course = findCourse(context, args.subject as string | undefined);
    const list = [...context.sessions]
      .filter((s) => !course || s.courseId === course.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 15);

    if (!list.length) {
      return course
        ? `No lessons filed under ${course.name} yet.`
        : "They haven't been taught any lessons yet.";
    }

    return list
      .map((session) => {
        const when = new Date(session.updatedAt).toLocaleDateString();
        const covered = session.plan?.steps?.length
          ? ` — covered ${session.plan.steps.join(", ")}`
          : "";
        return `${session.title} (${when})${covered}`;
      })
      .join("\n");
  }

  return `Unknown tool: ${name}`;
}
