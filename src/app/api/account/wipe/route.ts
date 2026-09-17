import { authed } from "@/lib/server/handler";
import { wipeEverything } from "@/lib/server/repo";

export const POST = authed(async (user) => {
  await wipeEverything(user.id);
  return { ok: true };
});
