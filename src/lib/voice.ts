"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live tutor voice, built entirely on the browser: speechSynthesis for the
 * tutor's voice, SpeechRecognition for the student's. No keys, no server —
 * the same BYOK stance as everything else. Chrome and Edge ship both; other
 * browsers degrade to silent text mode.
 */

const VOICE_PREF_KEY = "chalk.voice.v1";

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/* Minimal shapes for the two spellings of the recognizer API. */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  length: number;
  0: SpeechAlternative;
}
interface SpeechEvent {
  resultIndex: number;
  results: { length: number } & Record<number, SpeechResult>;
}
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognizerCtor;
    webkitSpeechRecognition?: RecognizerCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function micSupported(): boolean {
  return recognizerCtor() !== null;
}

/** LaTeX and markdown read terribly; say "formula" and move on. */
function stripForSpeech(text: string): string {
  return text
    .replace(/\$[^$]+\$/g, " formula ")
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function speakText(text: string, rate = 1.05): void {
  if (!ttsSupported() || !text.trim()) return;
  const utterance = new SpeechSynthesisUtterance(stripForSpeech(text));
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeakingText(): void {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
}

export interface UseVoiceOptions {
  /** Final transcripts from the student's mic. */
  onTranscript: (text: string) => void;
}

/**
 * The voice loop for one lesson: read-aloud plus a live mic, coordinated so
 * the tutor never hears itself — the mic pauses while the tutor speaks and
 * resumes when the last queued utterance lands.
 */
export function useVoice({ onTranscript }: UseVoiceOptions) {
  const [ttsOn, setTtsOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);

  const micOnRef = useRef(false);
  const ttsOnRef = useRef(false);
  const speakingRef = useRef(false);
  const activeRef = useRef(0);
  const recRef = useRef<Recognizer | null>(null);
  const restartRef = useRef<number | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const startRec = useCallback(() => {
    const Ctor = recognizerCtor();
    if (!Ctor || !micOnRef.current || speakingRef.current) return;
    try {
      recRef.current?.abort();
    } catch {
      /* a dead recognizer is as good as none */
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    rec.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal && text) {
          if (!speakingRef.current) onTranscriptRef.current(text);
        } else {
          pending += text;
        }
      }
      setInterim(pending);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        micOnRef.current = false;
        setMicOn(false);
        setMicError("Microphone blocked — allow mic access in your browser.");
      }
      // "no-speech" and "aborted" just fall through to onend.
    };
    rec.onend = () => {
      setInterim("");
      if (restartRef.current !== null) window.clearTimeout(restartRef.current);
      restartRef.current = window.setTimeout(() => {
        restartRef.current = null;
        if (micOnRef.current && !speakingRef.current) {
          try {
            rec.start();
          } catch {
            /* already running */
          }
        }
      }, 250);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    stopSpeakingText();
    activeRef.current = 0;
    speakingRef.current = false;
    setSpeaking(false);
    if (micOnRef.current) startRec();
  }, [startRec]);

  /** Speak one line, pausing the mic for the duration. */
  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported() || !text.trim()) return;
      if (micOnRef.current) recRef.current?.abort();
      // Synchronously mark speaking: the mic's restart timer must see this
      // before the first utterance actually starts, or it hears the tutor.
      activeRef.current += 1;
      speakingRef.current = true;
      setSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(stripForSpeech(text));
      utterance.rate = 1.05;
      const settle = () => {
        activeRef.current = Math.max(0, activeRef.current - 1);
        if (activeRef.current === 0) {
          speakingRef.current = false;
          setSpeaking(false);
          if (micOnRef.current) startRec();
        }
      };
      utterance.onend = settle;
      utterance.onerror = settle;
      window.speechSynthesis.speak(utterance);
    },
    [startRec],
  );

  const toggleTts = useCallback(() => {
    const next = !ttsOnRef.current;
    ttsOnRef.current = next;
    setTtsOn(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(VOICE_PREF_KEY, next ? "on" : "off");
    }
    if (!next) stopSpeaking();
  }, [stopSpeaking]);

  const toggleMic = useCallback(() => {
    setMicError(null);
    if (micOnRef.current) {
      micOnRef.current = false;
      setMicOn(false);
      setInterim("");
      recRef.current?.abort();
      return;
    }
    if (!recognizerCtor()) {
      setMicError("This browser has no speech recognition. Chrome or Edge work.");
      return;
    }
    micOnRef.current = true;
    setMicOn(true);
    startRec();
  }, [startRec]);

  // Restore the voice preference once, client-side.
  useEffect(() => {
    if (ttsSupported() && localStorage.getItem(VOICE_PREF_KEY) === "on") {
      ttsOnRef.current = true;
      setTtsOn(true);
    }
  }, []);

  // Leaving the page (or losing the mic) must not leave the tutor talking.
  useEffect(() => {
    return () => {
      stopSpeakingText();
      if (restartRef.current !== null) window.clearTimeout(restartRef.current);
      recRef.current?.abort();
    };
  }, []);

  return {
    ttsOn,
    toggleTts,
    speak,
    stopSpeaking,
    speaking,
    ttsSupported: ttsSupported(),
    micOn,
    toggleMic,
    interim,
    micError,
    micSupported: recognizerCtor() !== null,
  };
}
