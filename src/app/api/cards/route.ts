import { authed, jsonBody } from "@/lib/server/handler";
import { listCards, putCard } from "@/lib/server/repo";
import type { ReviewCard } from "@/lib/srs";

export const GET = authed(async (user) => ({ cards: await listCards(user.id) }));

export const POST = authed(async (user, request) => {
  const body = await jsonBody(request);
  const card = body.card as ReviewCard | undefined;
  if (!card?.id) throw new Error("A card is required.");
  await putCard(user.id, card);
  return { ok: true };
});
