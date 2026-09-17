"use client";

import type { TutorAction } from "./actions";
import { attachImages, boardToBlocks } from "./board-doc";
import { packDocx } from "./docx";
import { exportFilename } from "./export";

/**
 * Turning a lesson's board into a file.
 *
 * Everything runs in the browser against a real rendered board, so equations,
 * diagrams and plots come out exactly as the student saw them — rebuilding
 * KaTeX output or SVG layout in a PDF writer would drift from the screen
 * immediately.
 *
 * html-to-image and jsPDF are both loaded lazily: a student who never exports
 * shouldn't download a PDF writer.
 */

export type BoardFormat = "png" | "jpeg" | "pdf" | "docx";

export const FORMAT_LABEL: Record<BoardFormat, string> = {
  png: "PNG image",
  jpeg: "JPEG image",
  pdf: "PDF",
  docx: "Word (.docx)",
};

/** The board is light; a transparent PNG over a dark page would be unreadable. */
const PAPER = "#fcfcfa";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function rasterise(
  node: HTMLElement,
  format: "png" | "jpeg",
  scale = 2,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const { toPng, toJpeg } = await import("html-to-image");
  const width = node.scrollWidth;
  const height = node.scrollHeight;

  const options = {
    backgroundColor: PAPER,
    pixelRatio: scale,
    width,
    height,
    // The node is positioned off-screen for measurement; neutralise that in
    // the capture or the image comes out blank.
    style: { transform: "none", left: "0", top: "0", position: "static" },
    cacheBust: true,
  } as const;

  const dataUrl =
    format === "png" ? await toPng(node, options) : await toJpeg(node, { ...options, quality: 0.94 });
  return { dataUrl, width, height };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function exportImage(node: HTMLElement, title: string, format: "png" | "jpeg") {
  const { dataUrl } = await rasterise(node, format);
  const response = await fetch(dataUrl);
  download(await response.blob(), exportFilename(title, format === "png" ? "png" : "jpg"));
}

/**
 * A4 portrait, the board scaled to the page width and sliced down its length.
 *
 * Slicing rather than scaling the whole board onto one page: a long lesson
 * shrunk to fit A4 is unreadable, and a student printing revision notes wants
 * them legible more than they want them on one sheet.
 */
async function exportPdf(node: HTMLElement, title: string) {
  const { dataUrl, width, height } = await rasterise(node, "jpeg", 2);
  const { jsPDF } = await import("jspdf");

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const margin = 10;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const drawW = pageW - margin * 2;
  const drawH = (height / width) * drawW;
  const usableH = pageH - margin * 2;

  let remaining = drawH;
  let offset = 0;
  while (remaining > 0.5) {
    // Each page shows a window onto the same tall image by shifting it up.
    pdf.addImage(dataUrl, "JPEG", margin, margin - offset, drawW, drawH, undefined, "FAST");
    remaining -= usableH;
    offset += usableH;
    if (remaining > 0.5) pdf.addPage();
  }

  pdf.setProperties({ title });
  download(pdf.output("blob"), exportFilename(title, "pdf"));
}

/**
 * A Word document: real text for everything written, pictures only for the
 * diagrams and plots that genuinely are pictures.
 */
async function exportDocx(
  actions: TutorAction[],
  node: HTMLElement,
  title: string,
  date: number | undefined,
  materialName: (id: string) => string,
) {
  // Only cards actually present in the rendered board can be rasterised.
  const visual = actions.filter(
    (a) => a.type === "draw_diagram" || a.type === "draw_plot",
  );
  const rasterisable = new Set(
    visual.filter((a) => node.querySelector(`[data-action-id="${a.id}"]`)).map((a) => a.id),
  );

  const { blocks, pending } = boardToBlocks(actions, {
    title,
    date,
    materialName,
    rasterisable,
  });

  const { toPng } = await import("html-to-image");
  const rendered: { data: Uint8Array; widthPx: number; heightPx: number }[] = [];

  for (const item of pending) {
    const card = node.querySelector<HTMLElement>(`[data-action-id="${item.actionId}"]`);
    if (!card) {
      rendered.push({ data: new Uint8Array(), widthPx: 0, heightPx: 0 });
      continue;
    }
    try {
      const dataUrl = await toPng(card, {
        backgroundColor: PAPER,
        pixelRatio: 2,
        cacheBust: true,
      });
      // Cap the printed width so a wide diagram still fits an A4 text column.
      const widthPx = Math.min(card.scrollWidth, 620);
      const heightPx = Math.round((card.scrollHeight / card.scrollWidth) * widthPx);
      rendered.push({ data: dataUrlToBytes(dataUrl), widthPx, heightPx });
    } catch {
      rendered.push({ data: new Uint8Array(), widthPx: 0, heightPx: 0 });
    }
  }

  download(await packDocx(attachImages(blocks, rendered)), exportFilename(title, "docx"));
}

export interface ExportBoardRequest {
  format: BoardFormat;
  actions: TutorAction[];
  node: HTMLElement;
  title: string;
  date?: number;
  materialName?: (id: string) => string;
}

export async function exportBoard(request: ExportBoardRequest): Promise<void> {
  const { format, node, title } = request;
  switch (format) {
    case "png":
    case "jpeg":
      return exportImage(node, title, format);
    case "pdf":
      return exportPdf(node, title);
    case "docx":
      return exportDocx(
        request.actions,
        node,
        title,
        request.date,
        request.materialName ?? (() => "material"),
      );
  }
}
