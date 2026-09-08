"use client";

import type { Material, MaterialChunk, MaterialImage, MaterialKind } from "../db";
import { chunkUnits, type SourceUnit } from "./chunk";

/**
 * Turns an uploaded file into text units plus (where useful) page images.
 *
 * All of it runs in the browser: pdf.js, mammoth, and JSZip are pulled in
 * lazily so a student who only ever pastes text never downloads a PDF parser.
 * Audio and video are the one exception — transcription needs a model, so they
 * borrow the OpenAI key if there is one.
 */

export interface ExtractProgress {
  (stage: string, ratio?: number): void;
}

export interface ExtractInput {
  file: File;
  /** Used only for audio/video transcription. */
  openaiKey?: string;
  onProgress?: ExtractProgress;
  signal?: AbortSignal;
}

export interface ExtractResult {
  material: Material;
  chunks: MaterialChunk[];
}

export class ExtractionError extends Error {}

const IMAGE_TYPES = /^image\//;
const AUDIO_TYPES = /^(audio|video)\//;

export function kindForFile(file: File): MaterialKind {
  const name = file.name.toLowerCase();
  if (IMAGE_TYPES.test(file.type) || /\.(png|jpe?g|gif|webp|heic)$/.test(name))
    return "image";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pptx")) return "pptx";
  if (file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/.test(name))
    return "video";
  if (AUDIO_TYPES.test(file.type) || /\.(mp3|m4a|wav|ogg|flac)$/.test(name))
    return "audio";
  return "text";
}

function newId(): string {
  return `m_${crypto.randomUUID().slice(0, 8)}`;
}

async function toBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/* --- PDF ----------------------------------------------------------------- */

async function extractPdf(
  input: ExtractInput,
): Promise<{ units: SourceUnit[]; images: MaterialImage[]; unitCount: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await input.file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const units: SourceUnit[] = [];
  const images: MaterialImage[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    if (input.signal?.aborted) throw new ExtractionError("Cancelled");
    input.onProgress?.(`Reading page ${pageNumber} of ${doc.numPages}`, pageNumber / doc.numPages);

    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length >= 20) {
      units.push({ locator: `page ${pageNumber}`, text });
    } else if (images.length < 8) {
      // A scan or a slide deck exported as pictures. Rasterize it so a vision
      // model can still read the page.
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(viewport.width, 1400);
      canvas.height = Math.round((canvas.width / viewport.width) * viewport.height);
      const context = canvas.getContext("2d");
      if (context) {
        const scaled = page.getViewport({ scale: canvas.width / page.getViewport({ scale: 1 }).width });
        await page.render({ canvasContext: context, viewport: scaled }).promise;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.72),
        );
        if (blob) {
          images.push({
            locator: `page ${pageNumber}`,
            mediaType: "image/jpeg",
            base64: await toBase64(blob),
          });
          units.push({
            locator: `page ${pageNumber}`,
            text: `[Page ${pageNumber} has no selectable text — attached as an image.]`,
          });
        }
      }
    }
    page.cleanup();
  }

  return { units, images, unitCount: doc.numPages };
}

/* --- DOCX / PPTX --------------------------------------------------------- */

async function extractDocx(input: ExtractInput): Promise<SourceUnit[]> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await input.file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value.trim();
  if (!text) throw new ExtractionError("That .docx had no readable text in it.");
  // Word has no pages until it's laid out, so section headings do the work.
  return text
    .split(/\n{2,}/)
    .reduce<SourceUnit[]>((units, paragraph, index) => {
      units.push({ locator: `section ${Math.floor(index / 8) + 1}`, text: paragraph });
      return units;
    }, []);
}

async function extractPptx(input: ExtractInput): Promise<{ units: SourceUnit[]; count: number }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await input.file.arrayBuffer());

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return na - nb;
    });

  if (!slideFiles.length) throw new ExtractionError("No slides found in that .pptx.");

  const units: SourceUnit[] = [];
  for (let i = 0; i < slideFiles.length; i += 1) {
    input.onProgress?.(`Reading slide ${i + 1} of ${slideFiles.length}`, (i + 1) / slideFiles.length);
    const xml = await zip.files[slideFiles[i]].async("string");
    // <a:t> holds every run of visible text; <a:p> boundaries become lines.
    const paragraphs = xml.split(/<a:p[\s>]/).map((block) => {
      const runs = [...block.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]));
      return runs.join("").trim();
    });
    const text = paragraphs.filter(Boolean).join("\n");
    if (text) units.push({ locator: `slide ${i + 1}`, text });
  }
  return { units, count: slideFiles.length };
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/* --- audio & video ------------------------------------------------------- */

interface TranscriptSegment {
  start: number;
  text: string;
}

async function transcribe(input: ExtractInput): Promise<SourceUnit[]> {
  if (!input.openaiKey) {
    throw new ExtractionError(
      "Lecture recordings need an OpenAI key for transcription — add one in Settings, then re-upload.",
    );
  }
  if (input.file.size > 25 * 1024 * 1024) {
    throw new ExtractionError(
      `That file is ${(input.file.size / 1024 / 1024).toFixed(0)} MB. The transcription endpoint caps at 25 MB — trim it or export audio only.`,
    );
  }

  input.onProgress?.("Transcribing — this takes about a minute per 10 minutes of audio");

  const form = new FormData();
  form.append("file", input.file);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${input.openaiKey}` },
    body: form,
    signal: input.signal,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ExtractionError(`Transcription failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    text?: string;
    segments?: TranscriptSegment[];
  };

  if (payload.segments?.length) {
    // Group segments into ~90-second blocks so citations land on a timestamp
    // the student can actually scrub to.
    const units: SourceUnit[] = [];
    let bucketStart = payload.segments[0].start;
    let buffer = "";
    for (const segment of payload.segments) {
      if (segment.start - bucketStart > 90 && buffer) {
        units.push({ locator: timecode(bucketStart), text: buffer.trim() });
        bucketStart = segment.start;
        buffer = "";
      }
      buffer += ` ${segment.text.trim()}`;
    }
    if (buffer.trim()) units.push({ locator: timecode(bucketStart), text: buffer.trim() });
    return units;
  }

  if (payload.text) return [{ locator: "00:00", text: payload.text }];
  throw new ExtractionError("Transcription came back empty.");
}

function timecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* --- entry point --------------------------------------------------------- */

export async function extractMaterial(input: ExtractInput): Promise<ExtractResult> {
  const kind = kindForFile(input.file);
  const id = newId();
  let units: SourceUnit[] = [];
  let images: MaterialImage[] | undefined;
  let unitCount: number | undefined;
  let note: string | undefined;

  switch (kind) {
    case "pdf": {
      const result = await extractPdf(input);
      units = result.units;
      images = result.images.length ? result.images : undefined;
      unitCount = result.unitCount;
      if (images) note = `${images.length} page(s) came through as images — a vision model will read them.`;
      break;
    }
    case "docx":
      input.onProgress?.("Reading document");
      units = await extractDocx(input);
      break;
    case "pptx": {
      const result = await extractPptx(input);
      units = result.units;
      unitCount = result.count;
      break;
    }
    case "image": {
      input.onProgress?.("Preparing image");
      images = [
        {
          locator: input.file.name,
          mediaType: input.file.type || "image/png",
          base64: await toBase64(input.file),
        },
      ];
      units = [
        {
          locator: input.file.name,
          text: `[Photo of notes: ${input.file.name}. Attached to the conversation for the tutor to read directly.]`,
        },
      ];
      note = "Needs a vision-capable model.";
      break;
    }
    case "audio":
    case "video":
      units = await transcribe(input);
      unitCount = units.length;
      break;
    case "text":
    default: {
      input.onProgress?.("Reading text");
      const text = await input.file.text();
      if (!text.trim()) throw new ExtractionError("That file was empty.");
      units = [{ locator: input.file.name, text }];
      break;
    }
  }

  if (!units.length) throw new ExtractionError("Nothing readable came out of that file.");

  const chunks = chunkUnits(id, units);
  const charCount = units.reduce((sum, u) => sum + u.text.length, 0);
  const preview = units
    .map((u) => u.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 260);

  const material: Material = {
    id,
    name: input.file.name,
    kind,
    createdAt: Date.now(),
    sizeBytes: input.file.size,
    charCount,
    chunkCount: chunks.length,
    preview,
    unitCount,
    images,
    note,
  };

  return { material, chunks };
}

/** Pasted text takes the same path without a File wrapper. */
export function materialFromText(name: string, text: string): ExtractResult {
  const id = newId();
  const units: SourceUnit[] = [{ locator: "pasted", text }];
  const chunks = chunkUnits(id, units);
  return {
    material: {
      id,
      name,
      kind: "text",
      createdAt: Date.now(),
      sizeBytes: new Blob([text]).size,
      charCount: text.length,
      chunkCount: chunks.length,
      preview: text.replace(/\s+/g, " ").slice(0, 260),
    },
    chunks,
  };
}
