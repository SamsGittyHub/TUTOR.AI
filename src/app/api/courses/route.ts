import { randomUUID } from "node:crypto";

import { authed, jsonBody } from "@/lib/server/handler";
import { listCourses, putCourse, type Course } from "@/lib/server/repo";

export const GET = authed(async (user) => ({
  courses: await listCourses(user.id),
}));

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new Error("A course needs a name.");
  const course: Course = {
    id: typeof body.id === "string" && body.id ? body.id : randomUUID(),
    name: name.slice(0, 120),
    term: typeof body.term === "string" ? body.term.slice(0, 60) : undefined,
    color: typeof body.color === "string" ? body.color : "cyan",
    createdAt: Date.now(),
  };
  await putCourse(user.id, course);
  return { course };
});
