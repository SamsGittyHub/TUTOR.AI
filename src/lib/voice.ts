"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The typed board's voice, in both directions.
 *
 * This used to be the browser's own speechSynthesis and SpeechRecognition:
 * free, but a robot reading in Chrome and Edge and silence everywhere else,
 * with no idea what language the lesson was in. It now runs on the same two
 * models the live session uses — gpt-4o-mini-tts out, gpt-realtime-whisper in
 * — so the typed board sounds like the spoken one and works in any browser
 * that can record audio.
 *
 * The coordination problem is unchanged and still the hard part: the tutor
 * must never hear itself. The microphone is closed while a clip plays and
 * reopened when the queue empties.
 */

import { BETA, BETA_STT_MODEL } from "./beta";
import { loadKeys } from "./keys";
import {
  advanceListening,
  IDLE_LISTENING,
  levelOf,
  stripForSpeech,
  worthSpeaking,
  type ListenState,
} from "./speech";
import { readStored, VOICE_PREF } from "./storage-keys";

const VOICE_PREF_KEY = VOICE_PREF;

/** Audio playback is the only requirement, so effectively always. */
export function ttsSupported(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

export function micSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/* -------------------------------------------------------------------------- */
/* Speaking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Long enough for a slow clip, short enough that the tutor doesn't go mute.
 *
 * This is the whole reason the tutor used to stop talking and stay stopped.
 * A request with no deadline can hang, and the queue below advances only when
 * one settles — so a single hung clip left the "speaking" flag raised
 * permanently, every later line queueing silently behind it and the
 * microphone never reopening. Nothing recovered it short of toggling voice
 * off and on again, which is exactly how it presented: sometimes fine,
 * sometimes mute for the rest of the lesson.
 */
const SPEECH_TIMEOUT_MS = 20_000;

async function fetchSpeech(text: string, signal: AbortSignal): Promise<Blob | null> {
  const timeout = new AbortController();
  const expired = setTimeout(() => timeout.abort(), SPEECH_TIMEOUT_MS);
  const stop = () => timeout.abort();
  signal.addEventListener("abort", stop);
  try {
    const response = await fetch("/api/speech", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        apiKey: BETA ? undefined : (loadKeys().openai ?? ""),
      }),
      signal: timeout.signal,
    });
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    // Including the timeout. Null means "no clip", which the caller already
    // knows how to carry on from; a throw here would skip a line instead.
    return null;
  } finally {
    clearTimeout(expired);
    signal.removeEventListener("abort", stop);
  }
}

/**
 * The browser's own reader, kept only as a fallback.
 *
 * If the voice endpoint is unreachable — no key on the server, a dead network
 * — a robotic tutor is still better than a silent one for someone who turned
 * read-aloud on deliberately.
 */
function speakLocally(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}

export function speakText(text: string): void {
  if (!worthSpeaking(text)) return;
  const controller = new AbortController();
  void fetchSpeech(stripForSpeech(text), controller.signal).then((blob) => {
    if (!blob) {
      speakLocally(stripForSpeech(text));
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    void audio.play().catch(() => URL.revokeObjectURL(url));
  });
}

export function stopSpeakingText(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/* -------------------------------------------------------------------------- */
/* The loop                                                                    */
/* -------------------------------------------------------------------------- */

export interface UseVoiceOptions {
  /** Finished utterances from the student's microphone. */
  onTranscript: (text: string) => void;
}

export function useVoice({ onTranscript }: UseVoiceOptions) {
  const [ttsOn, setTtsOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  // Capability probes read `window`, so the server and the first client render
  // must both see "unsupported" or React throws the whole subtree away.
  const [mounted, setMounted] = useState(false);

  const micOnRef = useRef(false);
  const ttsOnRef = useRef(false);
  const speakingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  /* --- playing the tutor's voice ---------------------------------------- */

  const queue = useRef<string[]>([]);
  const playing = useRef<HTMLAudioElement | null>(null);
  const fetching = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);

  const releaseUrl = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  };

  // Declared as a ref so the queue can call the next step without the two
  // callbacks having to reference each other.
  const pump = useRef<() => void>(() => {});

  const finishSpeaking = useCallback(() => {
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  pump.current = () => {
    const next = queue.current.shift();
    if (next === undefined) {
      finishSpeaking();
      return;
    }

    const controller = new AbortController();
    fetching.current = controller;

    void fetchSpeech(next, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        if (!blob) {
          // Fall back, and keep the queue moving rather than stalling on it.
          speakLocally(next);
          pump.current();
          return;
        }
        releaseUrl();
        const url = URL.createObjectURL(blob);
        objectUrl.current = url;
        const audio = new Audio(url);
        playing.current = audio;
        /*
         * Exactly once. All three of these can fire for one clip — a rejected
         * play() followed by an error event, say — and each extra call shifts
         * another line off the queue, so a double fire silently swallowed the
         * sentence after the one that failed.
         */
        let stepped = false;
        const step = () => {
          if (stepped) return;
          stepped = true;
          playing.current = null;
          releaseUrl();
          pump.current();
        };
        audio.onended = step;
        audio.onerror = step;
        void audio.play().catch(step);
      })
      .catch(() => {
        if (!controller.signal.aborted) pump.current();
      });
  };

  const stopSpeaking = useCallback(() => {
    queue.current = [];
    fetching.current?.abort();
    fetching.current = null;
    playing.current?.pause();
    playing.current = null;
    releaseUrl();
    stopSpeakingText();
    finishSpeaking();
  }, [finishSpeaking]);

  /** Queue one line. The microphone stays shut until the queue drains. */
  const speak = useCallback(
    (text: string) => {
      if (!worthSpeaking(text)) return;
      queue.current.push(stripForSpeech(text));
      if (speakingRef.current) return;
      speakingRef.current = true;
      setSpeaking(true);
      pump.current();
    },
    [],
  );

  /* --- listening to the student ------------------------------------------ */

  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recorded = useRef<Blob[]>([]);
  const listenState = useRef<ListenState>(IDLE_LISTENING);
  const keepClip = useRef(true);

  const transcribe = useCallback(async (clip: Blob) => {
    setInterim("thinking…");
    try {
      const form = new FormData();
      form.append("file", clip, "utterance.webm");
      form.append("model", BETA_STT_MODEL);
      form.append("response_format", "json");

      const response = BETA
        ? await fetch("/api/transcribe", { method: "POST", body: form })
        : await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { authorization: `Bearer ${loadKeys().openai ?? ""}` },
            body: form,
          });

      if (!response.ok) {
        setMicError("Couldn't make out that recording.");
        return;
      }
      const body = (await response.json()) as { text?: string };
      const text = (body.text ?? "").trim();
      if (text) onTranscriptRef.current(text);
    } catch {
      setMicError("Couldn't reach the transcriber.");
    } finally {
      setInterim("");
    }
  }, []);

  const stopListening = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (recorder.current?.state === "recording") {
      keepClip.current = false;
      recorder.current.stop();
    }
    recorder.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    listenState.current = IDLE_LISTENING;
    setInterim("");
  }, []);

  const startListening = useCallback(async () => {
    if (stream.current) return;
    const captured = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    stream.current = captured;

    const audioContext = new AudioContext();
    context.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(captured).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const begin = () => {
      recorded.current = [];
      keepClip.current = true;
      const rec = new MediaRecorder(captured);
      rec.ondataavailable = (event) => {
        if (event.data.size) recorded.current.push(event.data);
      };
      rec.onstop = () => {
        const clip = new Blob(recorded.current, { type: rec.mimeType || "audio/webm" });
        recorded.current = [];
        if (keepClip.current && clip.size) void transcribe(clip);
      };
      recorder.current = rec;
      rec.start();
      setInterim("listening…");
    };

    const tick = () => {
      if (!micOnRef.current) return;
      frame.current = requestAnimationFrame(tick);

      // The tutor's own voice must never be treated as the student speaking.
      // If it starts mid-recording, throw the clip away rather than letting
      // the tutor transcribe itself and answer its own question.
      if (speakingRef.current) {
        if (recorder.current?.state === "recording") {
          keepClip.current = false;
          recorder.current.stop();
          recorder.current = null;
          listenState.current = IDLE_LISTENING;
          setInterim("");
        }
        return;
      }

      analyser.getFloatTimeDomainData(samples);
      const { state, action } = advanceListening(
        listenState.current,
        levelOf(samples),
        performance.now(),
      );
      listenState.current = state;

      if (action === "start") begin();
      if (action === "stop" || action === "discard") {
        keepClip.current = action === "stop";
        if (recorder.current?.state === "recording") recorder.current.stop();
        recorder.current = null;
        setInterim(action === "stop" ? "thinking…" : "");
      }
    };
    frame.current = requestAnimationFrame(tick);
  }, [transcribe]);

  const toggleMic = useCallback(() => {
    setMicError(null);
    if (micOnRef.current) {
      micOnRef.current = false;
      setMicOn(false);
      stopListening();
      return;
    }
    if (!micSupported()) {
      setMicError("This browser can't record audio.");
      return;
    }
    micOnRef.current = true;
    setMicOn(true);
    void startListening().catch(() => {
      micOnRef.current = false;
      setMicOn(false);
      setMicError("Microphone blocked — allow mic access in your browser.");
    });
  }, [startListening, stopListening]);

  const toggleTts = useCallback(() => {
    const next = !ttsOnRef.current;
    ttsOnRef.current = next;
    setTtsOn(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(VOICE_PREF_KEY, next ? "on" : "off");
    }
    if (!next) stopSpeaking();
  }, [stopSpeaking]);

  // Restore the voice preference once, client-side.
  useEffect(() => {
    setMounted(true);
    if (ttsSupported() && readStored(localStorage, VOICE_PREF_KEY) === "on") {
      ttsOnRef.current = true;
      setTtsOn(true);
    }
  }, []);

  // Leaving the page must not leave the tutor talking or the mic light on.
  useEffect(() => {
    return () => {
      stopSpeaking();
      micOnRef.current = false;
      stopListening();
    };
  }, [stopSpeaking, stopListening]);

  return {
    ttsOn,
    toggleTts,
    speak,
    stopSpeaking,
    speaking,
    ttsSupported: mounted && ttsSupported(),
    micOn,
    toggleMic,
    interim,
    micError,
    micSupported: mounted && micSupported(),
  };
}
