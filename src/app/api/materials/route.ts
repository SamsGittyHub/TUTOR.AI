import { authed, jsonBody } from "@/lib/server/handler";
import { listMaterials, putMaterial } from "@/lib/server/repo";
import type { Material, MaterialChunk } from "@/lib/db";

export const GET = authed(async (user) => ({
  materials: await listMaterials(user.id),
}));

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const material = body.material as Material | undefined;
  const chunks = (body.chunks ?? []) as MaterialChunk[];
  if (!material?.id) throw new Error("A material is required.");
  await putMaterial(user.id, material, chunks, body.courseId as string | null);
  return { ok: true };
});
