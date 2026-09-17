import { randomUUID } from "node:crypto";

import { authed, jsonBody } from "@/lib/server/handler";
import { EVENT_KINDS, type CalendarEvent, type EventKind } from "@/lib/calendar";
import { listBlocks, listEvents, putEvent } from "@/lib/server/repo";

export const GET = authed(async (user) => ({
  events: await listEvents(user.id),
  blocks: await listBlocks(user.id),
}));

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const startsAt = Number(body.startsAt);
  if (!title) throw new Error("An event needs a title.");
  if (!Number.isFinite(startsAt)) throw new Error("An event needs a date.");

  const kind = EVENT_KINDS.includes(body.kind as EventKind)
    ? (body.kind as EventKind)
    : "other";

  const event: CalendarEvent = {
    id: typeof body.id === "string" && body.id ? body.id : randomUUID(),
    courseId: typeof body.courseId === "string" ? body.courseId : undefined,
    kind,
    title: title.slice(0, 200),
    startsAt,
    endsAt: Number.isFinite(Number(body.endsAt)) ? Number(body.endsAt) : undefined,
    allDay: Boolean(body.allDay),
    location: typeof body.location === "string" ? body.location.slice(0, 200) : undefined,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : undefined,
    topics: Array.isArray(body.topics)
      ? (body.topics as unknown[]).map(String).filter(Boolean).slice(0, 40)
      : [],
    source: body.source === "syllabus" ? "syllabus" : "manual",
  };

  await putEvent(user.id, event);
  return { event };
});
