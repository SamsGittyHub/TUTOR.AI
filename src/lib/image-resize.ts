/**
 * Downscaling a photo before it becomes vision-model input.
 *
 * A phone camera photo of a page of handwriting is routinely 3000–4000px
 * wide — many times more resolution than reading handwriting needs, and
 * vision tokens scale with pixel count. This runs before the bytes ever
 * reach a request, so every future lesson turn that cites the photo (it's
 * resent on each turn that touches it) pays the smaller cost, not just the
 * upload.
 *
 * A ceiling generous enough that handwriting and small print stay legible —
 * this is source material, not a thumbnail — while cutting the common case
 * (a modern phone photo) by a large factor. Never upscales: a smaller photo
 * is returned untouched.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function downscaleImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) {
    bitmap.close?.();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  return blob ?? file;
}
