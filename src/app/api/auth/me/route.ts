import { currentUser } from "@/lib/server/auth";

export async function GET() {
  const user = await currentUser();
  return Response.json({ user });
}
