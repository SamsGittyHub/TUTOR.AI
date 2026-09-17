import { destroyCurrentSession } from "@/lib/server/auth";

export async function POST() {
  await destroyCurrentSession();
  return Response.json({ ok: true });
}
