-- Practice exams.
--
-- The paper itself is jsonb: it's generated once and replayed verbatim, never
-- queried into. Responses and the grade live alongside it so a half-finished
-- exam survives closing the tab, and so "what did I get wrong last time" is
-- answerable on any device.

create table practice_exams (
  id           text primary key,
  user_id      text not null references users(id) on delete cascade,
  title        text not null,
  session_ids  text[] not null default '{}',
  material_ids text[] not null default '{}',
  minutes      integer not null default 60,
  paper        jsonb not null,
  focus        jsonb not null default '[]'::jsonb,
  responses    jsonb not null default '{}'::jsonb,
  -- Null until submitted; set once and kept, so progress can chart attempts.
  result       jsonb,
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index practice_exams_user_idx on practice_exams (user_id, created_at desc);
