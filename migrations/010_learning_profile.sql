-- What each student, specifically, learns from.
--
-- One row per account, not per lesson: the point is a tutor that remembers how
-- teaching you went last term, so the memory has to outlive any one session.
--
-- Kept as jsonb rather than columns because the shape is a record of findings
-- and will grow — new card types, new kinds of observation — and none of it is
-- ever queried across users. It is personal data about how someone thinks, so
-- it is scoped to the account and deleted with it.

create table learning_profiles (
  user_id    text primary key references users(id) on delete cascade,
  profile    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
