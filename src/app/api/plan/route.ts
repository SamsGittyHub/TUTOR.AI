import { randomUUID } from "node:crypto";

import { buildPlan } from "@/lib/planner";
import { authed, jsonBody } from "@/lib/server/handler";
import type { StudyBlock } from "@/lib/calendar";
import {
  listEvents,
  replaceBlocksForEvent,
  setBlockStatus,
} from "@/lib/server/repo";

/**
 * Generates (or regenerates) the study plan for one exam.
 *
 * The planner is pure and lives client-side too, but generating here means the
 * blocks land in Postgres in one round trip and every device sees the same
 * plan without replaying the generator.
 */
export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const eventId = String(body.eventId ?? "");
  if (!eventId) throw new Error("Which exam?");

  const event = (await listEvents(user.id)).find((e) => e.id === eventId);
  if (!event) throw new Error("That exam is gone.");

  const topics = event.topics.length ? event.topics : [event.title];
  const planned = buildPlan({
    examAt: event.startsAt,
    topics,
    minutesPerDay: Number(body.minutesPerDay) || undefined,
    blockMinutes: Number(body.blockMinutes) || undefined,
    now: Date.now(),
  });

  const blocks: StudyBlock[] = planned.map((b) => ({
    id: randomUUID(),
    eventId,
    courseId: event.courseId,
    title: b.title,
    topic: b.topic,
    startsAt: b.startsAt,
    minutes: b.minutes,
    materialIds: [],
    status: "planned",
  }));

  await replaceBlocksForEvent(user.id, eventId, blocks);
  return { blocks };
});

export const PATCH = authed(async (user, request) => {
  const body = await jsonBody(request);
  const id = String(body.id ?? "");
  const status = body.status;
  if (!id) throw new Error("Which block?");
  if (status !== "planned" && status !== "done" && status !== "skipped") {
    throw new Error("Unknown status.");
  }
  await setBlockStatus(user.id, id, status);
  return { ok: true };
});
