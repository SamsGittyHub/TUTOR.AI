import { normalizeAction, type TutorAction } from "./actions";

/**
 * Reading the Realtime data channel.
 *
 * Split out from useRealtime so it can be tested without a browser, a
 * microphone or a live session — which matters more here than usual, because
 * GA renamed most of these events and the failure mode of getting a name wrong
 * is a session that connects, sounds fine, and silently never draws anything.
 *
 * Both the GA names and the beta ones are matched. The cost is a few string
 * comparisons; the benefit is that a session opened against an older
 * deployment doesn't fall mute.
 */

export interface RealtimeHandlers {
  onAction: (action: TutorAction) => void;
  onTranscript: (role: "student" | "tutor", text: string) => void;
  onSpeaking: (speaking: boolean) => void;
  /** Tool calls must be answered or the model waits and the turn stalls. */
  onToolResult: (callId: string) => void;
  onError?: (message: string) => void;
}

const SPEAKING_START = new Set([
  "response.output_audio.delta",
  "response.audio.delta",
]);

const SPEAKING_END = new Set([
  "response.output_audio.done",
  "response.audio.done",
  "response.done",
]);

const TUTOR_TRANSCRIPT = new Set([
  "response.output_audio_transcript.done",
  "response.audio_transcript.done",
]);

const TEXT_DONE = new Set(["response.output_text.done", "response.text.done"]);

/** Pulls board actions out of one `write_on_board` tool call. */
function actionsFromToolCall(message: Record<string, unknown>): TutorAction[] {
  try {
    const args = JSON.parse(String(message.arguments ?? "{}")) as {
      action?: unknown;
    };
    // The argument is documented as a JSON string, but a model will sometimes
    // send the object directly. Accept both rather than dropping the card.
    const raw =
      typeof args.action === "string" ? JSON.parse(args.action) : args.action;
    const action = normalizeAction(raw);
    return action ? [action] : [];
  } catch {
    return [];
  }
}

/** Pulls board actions out of a text turn — the pre-tool-call arrangement. */
function actionsFromText(text: string): TutorAction[] {
  const out: TutorAction[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const action = normalizeAction(JSON.parse(trimmed));
      if (action) out.push(action);
    } catch {
      // A half-formed object isn't worth surfacing mid-conversation.
    }
  }
  return out;
}

export function handleRealtimeEvent(
  message: Record<string, unknown>,
  handlers: RealtimeHandlers,
): void {
  const type = String(message.type ?? "");

  if (SPEAKING_START.has(type)) handlers.onSpeaking(true);
  if (SPEAKING_END.has(type)) handlers.onSpeaking(false);

  // What the student said.
  if (type === "conversation.item.input_audio_transcription.completed") {
    const text = String(message.transcript ?? "").trim();
    if (text) handlers.onTranscript("student", text);
  }

  // What the tutor said out loud.
  if (TUTOR_TRANSCRIPT.has(type)) {
    const text = String(message.transcript ?? "").trim();
    if (text) handlers.onTranscript("tutor", text);
  }

  // Board cards arrive as a tool call while the tutor talks.
  if (type === "response.function_call_arguments.done") {
    if (String(message.name ?? "") === "write_on_board") {
      for (const action of actionsFromToolCall(message)) handlers.onAction(action);
    }
    const callId = String(message.call_id ?? "");
    // Answered even for a tool we don't know: an unanswered call stalls the
    // conversation, and silence is a worse outcome than a useless ack.
    if (callId) handlers.onToolResult(callId);
  }

  if (TEXT_DONE.has(type)) {
    for (const action of actionsFromText(String(message.text ?? ""))) {
      handlers.onAction(action);
    }
  }

  // The server's own errors are the most useful thing it sends when a session
  // connects but produces nothing.
  if (type === "error") {
    const detail = message.error as { message?: string } | undefined;
    if (detail?.message) handlers.onError?.(detail.message);
  }
}

/** The message that answers a tool call. */
export function toolResultMessage(callId: string): string {
  return JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: '{"ok":true}',
    },
  });
}
