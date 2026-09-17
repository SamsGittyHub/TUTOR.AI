/**
 * Calendar types shared by the server repository and the client.
 *
 * They live here rather than in server/repo.ts because that module is
 * `server-only` — importing it from a client component throws at module load,
 * and a type-only import surviving a refactor into a value import is the kind
 * of break that only shows up in the browser.
 */

export type EventKind = "exam" | "assignment" | "class" | "reading" | "other";

export const EVENT_KINDS: EventKind[] = [
  "exam",
  "assignment",
  "class",
  "reading",
  "other",
];

export interface CalendarEvent {
  id: string;
  courseId?: string;
  kind: EventKind;
  title: string;
  startsAt: number;
  endsAt?: number;
  allDay: boolean;
  location?: string;
  notes?: string;
  topics: string[];
  source: "manual" | "syllabus";
}

export interface StudyBlock {
  id: string;
  eventId?: string;
  courseId?: string;
  title: string;
  topic?: string;
  startsAt: number;
  minutes: number;
  materialIds: string[];
  status: "planned" | "done" | "skipped";
}
