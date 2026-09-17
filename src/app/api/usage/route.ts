import { authed } from "@/lib/server/handler";
import { usageToday } from "@/lib/server/usage";

/**
 * What's left of today's free allowance.
 *
 * On a shared key every request is the operator's money, so there is a daily
 * cap — and until now the first a student knew of it was a 429 in the middle
 * of a lesson, which reads as the app being broken rather than as a limit
 * being reached. This is what the meter in the corner reads.
 */
export const GET = authed(async (user) => {
  const usage = await usageToday(user.id);
  return {
    used: usage.total,
    limit: usage.limit,
    remaining: usage.remaining,
    exceeded: usage.exceeded,
  };
});
