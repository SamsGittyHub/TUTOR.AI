"use client";

import { useCallback, useEffect, useState } from "react";

import type { CalendarEvent, StudyBlock } from "./calendar";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body as T;
}

export function useCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api<{ events: CalendarEvent[]; blocks: StudyBlock[] }>("/events");
      setEvents(data.events);
      setBlocks(data.blocks);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addEvent = useCallback(
    async (event: Partial<CalendarEvent>) => {
      await api("/events", { method: "POST", body: JSON.stringify(event) });
      await reload();
    },
    [reload],
  );

  const removeEvent = useCallback(
    async (id: string) => {
      await api(`/events/${encodeURIComponent(id)}`, { method: "DELETE" });
      await reload();
    },
    [reload],
  );

  const generatePlan = useCallback(
    async (eventId: string, minutesPerDay: number) => {
      await api("/plan", {
        method: "POST",
        body: JSON.stringify({ eventId, minutesPerDay }),
      });
      await reload();
    },
    [reload],
  );

  const setStatus = useCallback(
    async (id: string, status: StudyBlock["status"]) => {
      // Optimistic: ticking a block off should feel instant.
      setBlocks((list) =>
        list.map((b) => (b.id === id ? { ...b, status } : b)),
      );
      await api("/plan", { method: "PATCH", body: JSON.stringify({ id, status }) });
    },
    [],
  );

  return {
    events,
    blocks,
    loading,
    error,
    reload,
    addEvent,
    removeEvent,
    generatePlan,
    setStatus,
  };
}
