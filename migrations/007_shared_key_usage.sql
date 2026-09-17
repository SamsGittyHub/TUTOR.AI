-- Usage accounting for the shared-key beta.
--
-- While students bring their own key, spending is their problem. On one shared
-- key it is the operator's, and a single enthusiastic tester can burn a budget
-- in an afternoon — so every proxied call is metered per user per day and
-- refused past a cap.
--
-- Rows are keyed by local-UTC day: cheap to write, trivial to read back for
-- "you've used X of Y today", and self-expiring in the sense that old rows are
-- never consulted.

create table usage_daily (
  user_id       text not null references users(id) on delete cascade,
  day           date not null,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  requests      integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, day)
);

create index usage_daily_day_idx on usage_daily (day);

-- Lets a tester be given more room without a redeploy. Null means "the default".
alter table users
  add column daily_token_limit integer;
