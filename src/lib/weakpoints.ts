import type { TutorAction } from "./actions";
import type { QuizAttempt, Session, TranscriptEntry } from "./db";
import type { ReviewCard } from "./srs";

/**
 * What a student is actually weak at, read off their own lessons.
 *
 * A generic practice exam covers the syllabus evenly. The interesting signal is
 * already sitting in the transcript: the places a student interrupted, said
 * "wait", asked the same thing twice, or missed the card three times. This
 * module turns that history into weighted topics so the exam spends its
 * questions where they're worth spending.
 *
 * Pure functions only — same constraint as srs.ts and planner.ts.
 */

/** Phrases that mean "I'm lost", as opposed to ordinary conversation. */
const CONFUSION_MARKERS = [
  "wait",
  "i don't get",
  "i dont get",
  "i don't understand",
  "i dont understand",
  "confused",
  "explain that again",
  "explain again",
  "say that again",
  "why does",
  "why did",
  "where did",
  "how did you",
  "how come",
  "what do you mean",
  "lost",
  "stuck",
  "not following",
  "huh",
  "again please",
  "one more time",
];

export interface WeakPoint {
  /** The lesson-plan step or card topic this is about. */
  topic: string;
  /** Higher means weaker — spend more of the exam here. */
  weight: number;
  /** Why it scored: shown to the student so the exam isn't a black box. */
  reasons: string[];
  materialIds: string[];
}

/** True when a student turn reads as confusion rather than conversation. */
export function isConfusion(text: string): boolean {
  const lower = text.toLowerCase();
  return CONFUSION_MARKERS.some((marker) => lower.includes(marker));
}

/** Question marks and confusion markers, counted per student turn. */
export function confusionScore(transcript: TranscriptEntry[]): number {
  let score = 0;
  for (const entry of transcript) {
    if (entry.role !== "student") continue;
    if (isConfusion(entry.text)) score += 2;
    else if (entry.text.includes("?")) score += 1;
  }
  return score;
}

/**
 * The topics a lesson covered.
 *
 * The lesson plan is the best source — the model already broke the lesson into
 * named steps. Board titles are the fallback for lessons that never got one.
 */
export function topicsOf(session: Session): string[] {
  const planSteps = session.plan?.steps ?? [];
  if (planSteps.length) return planSteps.map((s) => s.trim()).filter(Boolean);

  const titles = session.actions
    .map((action: TutorAction) =>
      action.type === "write_text" && action.style === "title"
        ? action.text
        : action.type === "write_steps" || action.type === "draw_diagram"
          ? (action.title ?? "")
          : "",
    )
    .map((t) => t.trim())
    .filter(Boolean);

  const unique = [...new Set(titles)];
  return unique.length ? unique : [session.title];
}

/**
 * Which lesson-plan step the student was on when they got confused.
 *
 * `done` actions carry stepIndex, so walking the action log in order tells us
 * which step each stretch of transcript belongs to. Without that every
 * interruption would smear evenly across the lesson.
 */
export function confusionByStep(session: Session): Map<number, number> {
  const out = new Map<number, number>();
  const steps = session.plan?.steps ?? [];
  if (!steps.length) return out;

  // Board actions carry no timestamp, so pair the Nth "done" with the Nth
  // stretch of student turns — coarse, but it tracks the lesson's own pacing.
  const doneIndices = session.actions
    .filter((a): a is Extract<TutorAction, { type: "done" }> => a.type === "done")
    .map((a) => a.stepIndex)
    .filter((i): i is number => typeof i === "number");

  const studentTurns = session.transcript.filter((t) => t.role === "student");
  if (!studentTurns.length) return out;

  studentTurns.forEach((turn, i) => {
    const step = doneIndices[Math.min(i, doneIndices.length - 1)] ?? 0;
    const add = isConfusion(turn.text) ? 2 : turn.text.includes("?") ? 1 : 0;
    if (add) out.set(step, (out.get(step) ?? 0) + add);
  });
  return out;
}

export interface WeakPointInput {
  sessions: Session[];
  cards: ReviewCard[];
  attempts: QuizAttempt[];
}

/**
 * Ranks topics across the chosen lessons.
 *
 * Three signals, deliberately explainable:
 *   - confusion in the transcript, attributed to the lesson step it happened on
 *   - review cards that have lapsed (forgotten after being learned)
 *   - quiz attempts scored below 70% on the same material
 */
export function findWeakPoints(input: WeakPointInput): WeakPoint[] {
  const byTopic = new Map<string, WeakPoint>();

  const bump = (
    topic: string,
    weight: number,
    reason: string,
    materialIds: string[],
  ) => {
    const key = topic.trim();
    if (!key) return;
    const existing = byTopic.get(key.toLowerCase());
    if (existing) {
      existing.weight += weight;
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      for (const id of materialIds) {
        if (!existing.materialIds.includes(id)) existing.materialIds.push(id);
      }
      return;
    }
    byTopic.set(key.toLowerCase(), {
      topic: key,
      weight,
      reasons: [reason],
      materialIds: [...materialIds],
    });
  };

  for (const session of input.sessions) {
    const topics = topicsOf(session);
    const perStep = confusionByStep(session);

    if (perStep.size) {
      for (const [stepIndex, score] of perStep) {
        const topic = topics[stepIndex] ?? topics[0];
        if (topic) {
          bump(
            topic,
            score,
            `you interrupted ${score > 3 ? "repeatedly" : "here"} during "${session.title}"`,
            session.materialIds,
          );
        }
      }
    } else {
      // No plan to attribute against — spread the lesson's confusion evenly.
      const total = confusionScore(session.transcript);
      if (total) {
        const share = total / topics.length;
        for (const topic of topics) {
          bump(topic, share, `questions during "${session.title}"`, session.materialIds);
        }
      }
    }

    // Every covered topic gets a floor, so an exam still spans the material.
    for (const topic of topics) {
      bump(topic, 0.5, `covered in "${session.title}"`, session.materialIds);
    }
  }

  const sessionMaterials = new Set(
    input.sessions.flatMap((session) => session.materialIds),
  );

  for (const card of input.cards) {
    if (!card.lapses) continue;
    if (card.materialIds.length && !card.materialIds.some((id) => sessionMaterials.has(id))) {
      continue;
    }
    bump(
      card.prompt.slice(0, 80),
      card.lapses * 2,
      `forgotten ${card.lapses} time${card.lapses === 1 ? "" : "s"} in review`,
      card.materialIds,
    );
  }

  for (const attempt of input.attempts) {
    if (!attempt.total) continue;
    const ratio = attempt.score / attempt.total;
    if (ratio >= 0.7) continue;
    if (!attempt.materialIds.some((id) => sessionMaterials.has(id))) continue;
    bump(
      attempt.title,
      (1 - ratio) * 4,
      `scored ${attempt.score}/${attempt.total} on this quiz`,
      attempt.materialIds,
    );
  }

  return [...byTopic.values()].sort(
    (a, b) => b.weight - a.weight || a.topic.localeCompare(b.topic),
  );
}

/**
 * Splits a question budget across weak points, proportional to weight.
 *
 * Every topic returned gets at least one question — an exam that silently
 * skips a topic the student picked is worse than a slightly uneven one.
 */
export function allocateQuestions(
  weakPoints: WeakPoint[],
  total: number,
): { topic: string; count: number; reasons: string[] }[] {
  if (!weakPoints.length || total <= 0) return [];

  const take = weakPoints.slice(0, total);
  const sum = take.reduce((s, w) => s + w.weight, 0) || 1;

  const allocated = take.map((w) => ({
    topic: w.topic,
    reasons: w.reasons,
    count: Math.max(1, Math.floor((w.weight / sum) * total)),
  }));

  // Floors and rounding drift; settle the difference on the weakest topics.
  let drift = total - allocated.reduce((s, a) => s + a.count, 0);
  for (let i = 0; drift !== 0 && i < allocated.length * 4; i += 1) {
    const at = allocated[i % allocated.length];
    if (drift > 0) {
      at.count += 1;
      drift -= 1;
    } else if (at.count > 1) {
      at.count -= 1;
      drift += 1;
    }
  }
  return allocated;
}
