import { authed, jsonBody } from "@/lib/server/handler";
import { saveEmbeddings } from "@/lib/server/repo";

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const model = typeof body.model === "string" ? body.model : "";
  const raw = Array.isArray(body.vectors) ? body.vectors : [];
  if (!model) throw new Error("Which embedding model?");

  const vectors = raw
    .map((entry) => entry as { chunkId?: unknown; embedding?: unknown })
    .filter(
      (entry): entry is { chunkId: string; embedding: number[] } =>
        typeof entry.chunkId === "string" &&
        Array.isArray(entry.embedding) &&
        entry.embedding.length > 0 &&
        entry.embedding.every((n) => typeof n === "number" && Number.isFinite(n)),
    );

  return { written: await saveEmbeddings(user.id, model, vectors) };
});
