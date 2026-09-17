"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TutorAction } from "./actions";
import { handleRealtimeEvent, toolResultMessages } from "./realtime-events";

/**
 * A live speech-to-speech tutor session over WebRTC.
 *
 * The model works on audio directly rather than transcribing first, so
 * barge-in feels like interrupting a person instead of cancelling a playback —
 * turn detection is OpenAI's own VAD, not the mic-pausing hack in voice.ts.
 *
 * Board actions come back over the data channel as JSON and go through the
 * same normalizeAction the streaming path uses, so the whiteboard has no idea
 * which transport a card arrived on.
 *
 * GA interface: the SDP offer goes to /v1/realtime/calls, and the events are
 * the response.output_* names. The beta names are still recognised, because a
 * session opened against an older deployment shouldn't silently fall mute.
 */

export type RealtimeStatus = "idle" | "connecting" | "live" | "error";

export interface UseRealtimeOptions {
  /** Board actions the tutor emits mid-conversation. */
  onAction: (action: TutorAction) => void;
  /** Transcript lines, for the rail beside the board. */
  onTranscript: (role: "student" | "tutor", text: string) => void;
  /**
   * Answers a lookup the tutor made into the student's own work. Runs in the
   * browser, where the material already is — nothing round-trips to a server
   * mid-sentence.
   */
  runTool?: (name: string, args: Record<string, unknown>) => string;
}

export function useRealtime({
  onAction,
  onTranscript,
  runTool,
}: UseRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const actionRef = useRef(onAction);
  const transcriptRef = useRef(onTranscript);
  const toolRef = useRef(runTool);
  actionRef.current = onAction;
  transcriptRef.current = onTranscript;
  toolRef.current = runTool;

  const stop = useCallback(() => {
    channelRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    channelRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    setStatus("idle");
    setSpeaking(false);
  }, []);

  // A page left open with a live session keeps the microphone on.
  useEffect(() => stop, [stop]);

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

        const clientSecret: string | undefined = tokenBody.clientSecret;
        const model: string = tokenBody.model ?? "gpt-realtime-2.1";
        if (!clientSecret) throw new Error("No session credential came back.");

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        // The tutor's voice.
        const audio = new Audio();
        audio.autoplay = true;
        audioRef.current = audio;
        pc.ontrack = (event) => {
          audio.srcObject = event.streams[0];
        };

        // The student's mic. Asked for before the offer, because the offer has
        // to describe the track we intend to send.
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
          handleRealtimeEvent(message, {
            onAction: (action) => actionRef.current(action),
            onTranscript: (role, text) => transcriptRef.current(role, text),
            onSpeaking: setSpeaking,
            // Acknowledging a tool call matters: without an output item the
            // model waits on it and the conversation stalls mid-sentence.
            runTool: (name, args) =>
              toolRef.current?.(name, args) ?? `Unknown tool: ${name}`,
            onToolResult: (callId, output) => {
              if (channel.readyState !== "open") return;
              for (const message of toolResultMessages(callId, output)) {
                channel.send(message);
              }
            },
            onError: (detail) => transcriptRef.current("tutor", `[${detail}]`),
          });
        };

        // A dropped connection should read as ended, not as still live.
        pc.onconnectionstatechange = () => {
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setError("The connection dropped.");
            stop();
            setStatus("error");
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpResponse = await fetch(
          `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
          {
            method: "POST",
            body: offer.sdp,
            headers: {
              authorization: `Bearer ${clientSecret}`,
              "content-type": "application/sdp",
            },
          },
        );
        if (!sdpResponse.ok) {
          const detail = await sdpResponse.text().catch(() => "");
          throw new Error(
            `The audio connection was refused (${sdpResponse.status}). ${detail.slice(0, 160)}`,
          );
        }

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
