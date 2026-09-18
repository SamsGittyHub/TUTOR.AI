import { normalizeAction, type TutorAction } from "./actions";

/**
 * Reading the Realtime data channel.
 *
 * Split out from useRealtime so it can be tested without a browser, a
 * microphone or a live session — which matters more here than usual, because
 * GA renamed most of these events and the failure mode of getting a name wrong
 * is a session that connects, sounds fine, and silently never draws anything.
 *
 * That failure actually happened, which is why the matching below is as wide
 * as it is: a tool call is recognised from three different events, its
 * arguments are accepted in four shapes, and a JSON line that turns up in the
 * spoken transcript is drawn rather than dropped. Each of those is a model
 * doing something slightly different from the documented happy path, and each
 * of them used to mean a blank whiteboard.
 */

export interface RealtimeHandlers {
  onAction: (action: TutorAction) => void;
  onTranscript: (role: "student" | "tutor", text: string) => void;
  onSpeaking: (speaking: boolean) => void;
  /**
   * Answers a tool call. Must always be called, or the model waits on the
   * output item and the turn stalls mid-sentence.
   */
  onToolResult: (callId: string, output: string) => void;
  /**
   * Runs a tool the tutor called to look something up. Returns what it should
   * hear back. Board cards are handled here too, via onAction.
   */
  runTool?: (name: string, args: Record<string, unknown>) => string;
  /**
   * Call ids already answered. The same call arrives on more than one event,
   * and running a tool twice would draw the card twice.
   */
  seenCalls?: Set<string>;
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

/* -------------------------------------------------------------------------- */
/* Board actions                                                               */
/* -------------------------------------------------------------------------- */

/** JSON if it parses, the value itself if it's already an object, else null. */
function loose(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Every board action in one tool call's arguments.
 *
 * The argument may be a single object, an array of them, a JSON string of
 * either, or several objects one per line — and may arrive under `actions`,
 * `action` or `cards`. Models send all of these. Insisting on one shape is how
 * a board ends up empty while the tutor talks happily over it.
 */
function actionsFromToolCall(rawArguments: unknown): TutorAction[] {
  const args = loose(rawArguments);
  if (!args || typeof args !== "object") return [];

  const record = args as Record<string, unknown>;
  const raw = record.actions ?? record.action ?? record.cards ?? record.card;

  const candidates: unknown[] = [];
  const consider = (value: unknown) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) consider(item);
      return;
    }
    if (typeof value === "string") {
      // One object, or several separated by newlines — the same shape the
      // typed tutor streams, which is what these models reach for.
      const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) {
        const parsed = loose(value);
        if (parsed) consider(parsed);
        return;
      }
      for (const line of lines) {
        const parsed = loose(line);
        if (parsed) consider(parsed);
      }
      return;
    }
    candidates.push(value);
  };
  consider(raw);

  return candidates
    .map((c) => normalizeAction(c))
    .filter((a): a is TutorAction => a !== null);
}

/** Board actions from a block of text — the pre-tool-call arrangement. */
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

/** Speech with any JSON the model read out loud stripped back out of it. */
export function spokenOnly(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("{"))
    .join("\n")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Tool calls                                                                  */
/* -------------------------------------------------------------------------- */

interface ToolCall {
  name: string;
  callId: string;
  args: unknown;
}

/**
 * Tool calls carried by one event.
 *
 * Three events can carry them: the arguments-done event, the output-item-done
 * event, and the final response.done with the whole output array. Which of
 * those a given model sends is not something to bet a blank whiteboard on, so
 * all three are read and the duplicates filtered out by call id.
 */
function toolCallsIn(message: Record<string, unknown>): ToolCall[] {
  const type = String(message.type ?? "");
  const out: ToolCall[] = [];

  const fromItem = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const item = raw as Record<string, unknown>;
    const kind = String(item.type ?? "");
    if (kind !== "function_call" && kind !== "tool_call") return;
    const name = String(item.name ?? "");
    if (!name) return;
    out.push({
      name,
      callId: String(item.call_id ?? item.id ?? ""),
      args: item.arguments ?? item.args ?? "{}",
    });
  };

  if (type === "response.function_call_arguments.done") {
    const name = String(message.name ?? "");
    if (name) {
      out.push({
        name,
        callId: String(message.call_id ?? message.item_id ?? ""),
        args: message.arguments ?? "{}",
      });
    }
  }

  if (type === "response.output_item.done" || type === "conversation.item.created") {
    fromItem(message.item);
  }

  if (type === "response.done") {
    const response = message.response as { output?: unknown } | undefined;
    if (Array.isArray(response?.output)) {
      for (const item of response.output) fromItem(item);
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

  // What the tutor said out loud. If it read a card aloud despite being told
  // not to, put the card on the board and keep it out of the transcript —
  // better a drawn card and clean speech than neither.
  if (TUTOR_TRANSCRIPT.has(type)) {
    const raw = String(message.transcript ?? "");
    for (const action of actionsFromText(raw)) handlers.onAction(action);
    const spoken = spokenOnly(raw);
    if (spoken) handlers.onTranscript("tutor", spoken);
  }

  for (const call of toolCallsIn(message)) {
    // The same call arrives on more than one event; drawing it twice is worse
    // than the redundancy that buys.
    const key = call.callId || `${call.name}:${String(call.args)}`;
    if (handlers.seenCalls?.has(key)) continue;
    handlers.seenCalls?.add(key);

    let output = "ok";
    if (call.name === "write_on_board") {
      const actions = actionsFromToolCall(call.args);
      for (const action of actions) handlers.onAction(action);
      output = actions.length
        ? `Written on the board (${actions.length} card${actions.length === 1 ? "" : "s"}).`
        : "None of those cards were usable — check the shape and send them again.";
    } else if (handlers.runTool) {
      const parsed = loose(call.args);
      output =
        parsed && typeof parsed === "object"
          ? handlers.runTool(call.name, parsed as Record<string, unknown>)
          : "That lookup failed — the arguments weren't readable.";
    }

    // Answered even for a tool we don't know: an unanswered call stalls the
    // conversation, and silence is a worse outcome than a useless answer.
    if (call.callId) handlers.onToolResult(call.callId, output);
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

/**
 * The message that answers a tool call, plus the nudge to carry on.
 *
 * The output item alone doesn't resume the turn — without response.create the
 * tutor goes quiet after looking something up, which reads as the call having
 * failed.
 */
export function toolResultMessages(callId: string, output: string): string[] {
  return [
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output,
      },
    }),
    JSON.stringify({ type: "response.create" }),
  ];
}

/**
 * Installs the tutor's instructions and tools on a live session.
 *
 * Sent over the data channel the moment it opens rather than relied on from
 * the minted client secret: whatever that endpoint does or doesn't carry
 * through, a session.update is configuration the model definitely has. A
 * session missing this talks perfectly well and never touches the board, which
 * is exactly how it presented.
 */
/**
 * How hard the student has to try before the tutor treats it as an interruption.
 *
 * The defaults are tuned for someone alone at a desk with a headset. A student
 * works in a kitchen, a library, a room with a television on, and on the
 * laptop speakers rather than headphones — and every one of those makes the
 * tutor stop mid-sentence, because the detector cannot tell a housemate, or
 * the tutor's own voice coming back out of the speakers, from the student
 * deciding to cut in.
 *
 * So: a higher bar to start hearing speech at all, and a longer pause before
 * a turn is called finished, so an "um" mid-thought doesn't hand the turn
 * back. Interruption itself stays on — talking over the tutor is the whole
 * point of live voice, and this only changes how sure it has to be.
 */
export const LISTENING = {
  type: "server_vad",
  /** 0.5 by default; this is a noticeably louder bar than a room's hum. */
  threshold: 0.75,
  /** Keep the run-up, so a raised first syllable isn't clipped off. */
  prefix_padding_ms: 300,
  /** 500 by default — long enough to mistake thinking for finishing. */
  silence_duration_ms: 800,
} as const;

/**
 * Audio input settings, shared by the minted session and the update that
 * follows it so the two can't disagree about how sensitive the mic is.
 */
export const AUDIO_INPUT = {
  // Suppresses steady background — a fan, traffic, a room's hum — before the
  // detector above ever sees it.
  noise_reduction: { type: "near_field" },
  turn_detection: LISTENING,
} as const;

/**
 * Stops the tutor talking, now.
 *
 * Pausing can't just mute the speaker: the model would carry on generating
 * into a muted element, which the student pays for by the second and then
 * comes back to find already finished. Cancelling ends the turn instead, so
 * "pause" means what it says.
 */
export function responseCancelMessage(): string {
  return JSON.stringify({ type: "response.cancel" });
}

/**
 * Throws away whatever the microphone had half-heard.
 *
 * Sent when coming back, so a syllable caught on the way to the pause button
 * isn't waiting to be treated as the first word of the next question.
 */
export function inputBufferClearMessage(): string {
  return JSON.stringify({ type: "input_audio_buffer.clear" });
}

export function sessionUpdateMessage(
  instructions: string,
  tools: unknown[],
): string {
  return JSON.stringify({
    type: "session.update",
    session: {
      type: "realtime",
      instructions,
      tools,
      tool_choice: "auto",
      audio: { input: AUDIO_INPUT },
    },
  });
}
