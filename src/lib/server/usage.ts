import "server-only";

import { query } from "./db";

/**
 * Per-user, per-day spend, recorded but not enforced.
 *
 * The beta has no usage cap — the product is meant to be used until a student
 * has actually learned the thing, and rationing that on a token count works
 * against the point of the app. This is the operator's own ledger: run
 *
 *   select user_id, day, input_tokens, output_tokens, requests
 *     from usage_daily order by day desc, input_tokens + output_tokens desc;
 *
 * to see what the shared key is actually costing, without any of it reaching
 * a student as a limit or a warning.
 */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await query(
    `insert into usage_daily (user_id, day, input_tokens, output_tokens, requests)
     values ($1, $2, $3, $4, 1)
     on conflict (user_id, day) do update set
       input_tokens  = usage_daily.input_tokens  + excluded.input_tokens,
       output_tokens = usage_daily.output_tokens + excluded.output_tokens,
       requests      = usage_daily.requests + 1,
       updated_at    = now()`,
    [userId, today(), Math.max(0, inputTokens), Math.max(0, outputTokens)],
  );
}
