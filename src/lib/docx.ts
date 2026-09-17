/**
 * A minimal .docx writer.
 *
 * A Word document is a zip of XML, and the alternative — emitting HTML with a
 * .doc extension — produces a file Word opens with a warning and Pages refuses
 * entirely. This writes real OOXML: a few hundred lines, no dependency beyond
 * the JSZip already here for reading .pptx.
 *
 * Formatting is direct rather than style-based (bold runs instead of a
 * "Heading 1" style) so there's no styles.xml to keep in sync — the document
 * renders identically in Word, Pages and Google Docs.
 *
 * The XML builders are pure and unit-tested; only `packDocx` touches JSZip.
 */

export interface DocxImage {
  /** PNG bytes. */
  data: Uint8Array;
  widthPx: number;
  heightPx: number;
  caption?: string;
}

export type DocxBlock =
  | { kind: "heading"; text: string; level: 1 | 2 }
  | { kind: "paragraph"; text: string; italic?: boolean }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbered"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "mono"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "image"; image: DocxImage }
  | { kind: "spacer" };

/** XML text escaping. Ampersand first, or the others get double-escaped. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Half-points: Word sizes text in them, so 11pt is 22. */
const sz = (points: number) => Math.round(points * 2);

/** English Metric Units — 914400 per inch, and Word images are sized in them. */
export function pxToEmu(px: number): number {
  return Math.round((px / 96) * 914400);
}

function run(text: string, opts: { b?: boolean; i?: boolean; mono?: boolean; size?: number; color?: string } = {}): string {
  const props = [
    opts.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : "",
    opts.b ? "<w:b/>" : "",
    opts.i ? "<w:i/>" : "",
    opts.color ? `<w:color w:val="${opts.color}"/>` : "",
    opts.size ? `<w:sz w:val="${sz(opts.size)}"/>` : "",
  ].join("");
  // xml:space preserve, or Word eats leading and trailing spaces.
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(inner: string, opts: { spacingAfter?: number; indent?: number; border?: boolean } = {}): string {
  const props = [
    opts.spacingAfter !== undefined ? `<w:spacing w:after="${opts.spacingAfter}"/>` : "",
    opts.indent ? `<w:ind w:left="${opts.indent}"/>` : "",
    opts.border
      ? '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C7C7CC"/></w:pBdr>'
      : "",
  ].join("");
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${inner}</w:p>`;
}

function imageXml(id: number, image: DocxImage): string {
  const cx = pxToEmu(image.widthPx);
  const cy = pxToEmu(image.heightPx);
  return (
    `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Board ${id}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="Board ${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId${100 + id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

function tableXml(headers: string[], rows: string[][]): string {
  const cell = (text: string, header: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${
      header ? '<w:shd w:val="clear" w:fill="F2F2F2"/>' : ""
    }</w:tcPr>${para(run(text, { b: header, size: 10 }), { spacingAfter: 0 })}</w:tc>`;

  const head = `<w:tr>${headers.map((h) => cell(h, true)).join("")}</w:tr>`;
  const body = rows
    .map(
      (row) =>
        `<w:tr>${headers
          .map((_, i) => cell(row[i] ?? "", false))
          .join("")}</w:tr>`,
    )
    .join("");

  return (
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="D9D9D9"/>`)
      .join("") +
    `</w:tblBorders></w:tblPr>${head}${body}</w:tbl>` +
    para("", { spacingAfter: 120 })
  );
}

/** Turns blocks into the body of word/document.xml. */
export function blocksToXml(blocks: DocxBlock[]): string {
  let imageId = 0;
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        parts.push(
          para(run(block.text, { b: true, size: block.level === 1 ? 20 : 14 }), {
            spacingAfter: block.level === 1 ? 240 : 120,
          }),
        );
        break;
      case "paragraph":
        parts.push(
          para(run(block.text, { i: block.italic, size: 11 }), { spacingAfter: 120 }),
        );
        break;
      case "quote":
        parts.push(
          para(run(block.text, { i: true, size: 10, color: "5B5B60" }), {
            spacingAfter: 120,
            indent: 360,
            border: true,
          }),
        );
        break;
      case "mono":
        parts.push(
          para(run(block.text, { mono: true, size: 10 }), { spacingAfter: 120 }),
        );
        break;
      case "bullets":
        for (const item of block.items) {
          parts.push(
            para(run(`• ${item}`, { size: 11 }), { spacingAfter: 60, indent: 360 }),
          );
        }
        break;
      case "numbered":
        block.items.forEach((item, i) => {
          parts.push(
            para(run(`${i + 1}.  ${item}`, { size: 11 }), {
              spacingAfter: 60,
              indent: 360,
            }),
          );
        });
        break;
      case "table":
        parts.push(tableXml(block.headers, block.rows));
        break;
      case "image":
        imageId += 1;
        parts.push(imageXml(imageId, block.image));
        if (block.image.caption) {
          parts.push(
            para(run(block.image.caption, { i: true, size: 9, color: "5B5B60" }), {
              spacingAfter: 160,
            }),
          );
        }
        break;
      case "spacer":
        parts.push(para("", { spacingAfter: 160 }));
        break;
    }
  }
  return parts.join("");
}

export function documentXml(blocks: DocxBlock[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ` +
    `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<w:body>${blocksToXml(blocks)}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>` +
    `</w:body></w:document>`
  );
}

export function contentTypesXml(imageCount: number): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    (imageCount ? `<Default Extension="png" ContentType="image/png"/>` : "") +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`
  );
}

export function rootRelsXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`
  );
}

/** One relationship per image; ids must match those emitted in imageXml. */
export function documentRelsXml(imageCount: number): string {
  const rels = Array.from({ length: imageCount }, (_, i) => {
    const id = i + 1;
    return `<Relationship Id="rId${100 + id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${id}.png"/>`;
  }).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
  );
}

/** Zips the parts into a .docx. JSZip is loaded lazily, as elsewhere. */
export async function packDocx(blocks: DocxBlock[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const images = blocks.filter(
    (b): b is Extract<DocxBlock, { kind: "image" }> => b.kind === "image",
  );

  zip.file("[Content_Types].xml", contentTypesXml(images.length));
  zip.folder("_rels")!.file(".rels", rootRelsXml());
  const word = zip.folder("word")!;
  word.file("document.xml", documentXml(blocks));
  word.folder("_rels")!.file("document.xml.rels", documentRelsXml(images.length));

  if (images.length) {
    const media = word.folder("media")!;
    images.forEach((block, i) => {
      media.file(`image${i + 1}.png`, block.image.data);
    });
  }

  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}
