import "server-only";

import { query, queryOne } from "./db";
import { dailyTokenLimit } from "./beta-key";

/** Per-user, per-day metering for the shared beta key. */

export interface UsageToday {
  total: number;
  requests: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
}

/** UTC, so the reset moment is the same for everyone and easy to explain. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function usageToday(userId: string): Promise<UsageToday> {
  const row = await queryOne<{
    input_tokens: string;
    output_tokens: string;
    requests: number;
    daily_token_limit: number | null;
  }>(
    `select coalesce(u.input_tokens, 0)::text  as input_tokens,
            coalesce(u.output_tokens, 0)::text as output_tokens,
            coalesce(u.requests, 0)            as requests,
            usr.daily_token_limit
       from users usr
       left join usage_daily u on u.user_id = usr.id and u.day = $2
      where usr.id = $1`,
    [userId, today()],
  );

  const total = Number(row?.input_tokens ?? 0) + Number(row?.output_tokens ?? 0);
  const limit = row?.daily_token_limit ?? dailyTokenLimit();

  return {
    total,
    requests: row?.requests ?? 0,
    limit,
    remaining: Math.max(0, limit - total),
    exceeded: total >= limit,
  };
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

/** The message a capped tester sees. Kept in one place so it reads the same everywhere. */
export function limitMessage(usage: UsageToday): string {
  return `You've used today's free allowance (${usage.total.toLocaleString()} of ${usage.limit.toLocaleString()} tokens). It resets at midnight UTC.`;
}
