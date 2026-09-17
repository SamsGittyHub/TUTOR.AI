"use client";

import { useCallback, useRef, useState } from "react";

import { normalizeAction, type TutorAction } from "./actions";

/**
 * A live speech-to-speech tutor session over WebRTC.
 *
 * The model talks and listens continuously; barge-in is handled by OpenAI's
 * own VAD rather than our mic-pausing hack in voice.ts. Board actions come
 * back over the data channel as JSON, through the same normalizeAction the
 * streaming path uses — so the whiteboard renders them without knowing which
 * transport they arrived on.
 */

export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "live"
  | "error";

export interface UseRealtimeOptions {
  /** Board actions the tutor emits mid-conversation. */
  onAction: (action: TutorAction) => void;
  /** Transcript lines, for the rail beside the board. */
  onTranscript: (role: "student" | "tutor", text: string) => void;
}

export function useRealtime({ onAction, onTranscript }: UseRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const actionRef = useRef(onAction);
  const transcriptRef = useRef(onTranscript);
  actionRef.current = onAction;
  transcriptRef.current = onTranscript;

  const stop = useCallback(() => {
    channelRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    channelRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    setStatus("idle");
    setSpeaking(false);
  }, []);

  const start = useCallback(
    async (apiKey: string, instructions: string) => {
      if (pcRef.current) return;
      setStatus("connecting");
      setError(null);

      try {
        const tokenResponse = await fetch("/api/realtime/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey, instructions }),
        });
        const tokenBody = await tokenResponse.json().catch(() => ({}));
        if (!tokenResponse.ok) throw new Error(tokenBody.error ?? "Couldn't start.");

        const ephemeral: string | undefined =
          tokenBody.session?.client_secret?.value;
        const model: string = tokenBody.session?.model ?? "gpt-4o-realtime-preview";
        if (!ephemeral) throw new Error("No session token came back.");

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        // The tutor's voice.
        const audio = new Audio();
        audio.autoplay = true;
        audioRef.current = audio;
        pc.ontrack = (event) => {
          audio.srcObject = event.streams[0];
        };

        // The student's mic.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const channel = pc.createDataChannel("oai-events");
        channelRef.current = channel;
        channel.onmessage = (event) => {
          let message: Record<string, unknown>;
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }
          handleEvent(message, actionRef.current, transcriptRef.current, setSpeaking);
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpResponse = await fetch(
          `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
          {
            method: "POST",
            body: offer.sdp,
            headers: {
              authorization: `Bearer ${ephemeral}`,
              "content-type": "application/sdp",
            },
          },
        );
        if (!sdpResponse.ok) throw new Error("The audio connection was refused.");

        await pc.setRemoteDescription({
          type: "answer",
          sdp: await sdpResponse.text(),
        });

        setStatus("live");
      } catch (e) {
        stop();
        setStatus("error");
        setError(e instanceof Error ? e.message : "Couldn't start live voice.");
      }
    },
    [stop],
  );

  return { status, error, speaking, start, stop };
}

/** Realtime emits many event types; these are the ones the board cares about. */
function handleEvent(
  message: Record<string, unknown>,
  onAction: (action: TutorAction) => void,
  onTranscript: (role: "student" | "tutor", text: string) => void,
  setSpeaking: (value: boolean) => void,
) {
  const type = String(message.type ?? "");

  if (type === "response.audio.delta") setSpeaking(true);
  if (type === "response.audio.done" || type === "response.done") setSpeaking(false);

  // What the student said.
  if (type === "conversation.item.input_audio_transcription.completed") {
    const text = String(message.transcript ?? "").trim();
    if (text) onTranscript("student", text);
  }

  // What the tutor said out loud.
  if (type === "response.audio_transcript.done") {
    const text = String(message.transcript ?? "").trim();
    if (text) onTranscript("tutor", text);
  }

  // Board actions ride the text channel as one JSON object per response.
  if (type === "response.text.done") {
    const raw = String(message.text ?? "").trim();
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const action = normalizeAction(JSON.parse(trimmed));
        if (action) onAction(action);
      } catch {
        // A half-formed object is not worth surfacing mid-conversation.
      }
    }
  }
}
