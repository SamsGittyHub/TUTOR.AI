-- TUTOR AI, server-authoritative.
--
-- Postgres is the source of truth; the browser keeps a cache. Every table that
-- holds student work hangs off users(id) with ON DELETE CASCADE, so "delete my
-- account" is one statement and leaves nothing behind — the same deletion
-- guarantee the IndexedDB build got for free by never having a server.
--
-- Ids are text rather than uuid: the client already mints ids for materials,
-- chunks and board actions, and letting those survive the round trip keeps the
-- cache and the server talking about the same objects.

create extension if not exists pgcrypto;

/* -------------------------------------------------------------------------- */
/* Accounts                                                                     */
/* -------------------------------------------------------------------------- */

create table users (
  id            text primary key,
  email         text not null,
  email_lower   text not null generated always as (lower(email)) stored,
  password_hash text not null,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index users_email_lower_key on users (email_lower);

-- Opaque session tokens. Only the SHA-256 of the token is stored, so a dump of
-- this table cannot be replayed against the app.
create table auth_sessions (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  token_hash bytea not null,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index auth_sessions_token_hash_key on auth_sessions (token_hash);
create index auth_sessions_user_id_idx on auth_sessions (user_id);
create index auth_sessions_expires_at_idx on auth_sessions (expires_at);

/* -------------------------------------------------------------------------- */
/* Courses — the grouping materials never had                                   */
/* -------------------------------------------------------------------------- */

create table courses (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  name       text not null,
  term       text,
  color      text not null default 'cyan',
  created_at timestamptz not null default now()
);

create index courses_user_id_idx on courses (user_id);

/* -------------------------------------------------------------------------- */
/* Material                                                                     */
/* -------------------------------------------------------------------------- */

create table materials (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  course_id   text references courses(id) on delete set null,
  name        text not null,
  kind        text not null check (kind in ('pdf','docx','pptx','image','text','audio','video')),
  size_bytes  bigint not null default 0,
  char_count  integer not null default 0,
  chunk_count integer not null default 0,
  unit_count  integer,
  preview     text not null default '',
  note        text,
  -- Path on the Railway volume. Null when the original was not retained.
  storage_path text,
  created_at  timestamptz not null default now()
);

create index materials_user_id_idx on materials (user_id);
create index materials_course_id_idx on materials (course_id);

create table material_chunks (
  id          text primary key,
  material_id text not null references materials(id) on delete cascade,
  locator     text not null,
  text        text not null,
  order_index integer not null
);

create index material_chunks_material_id_idx on material_chunks (material_id, order_index);
-- Lexical search stays server-side too, so retrieval works on a cold device
-- before the cache has warmed.
create index material_chunks_fts_idx on material_chunks using gin (to_tsvector('english', text));

create table material_images (
  id          text primary key,
  material_id text not null references materials(id) on delete cascade,
  locator     text not null,
  media_type  text not null,
  storage_path text not null
);

create index material_images_material_id_idx on material_images (material_id);

/* -------------------------------------------------------------------------- */
/* Lessons                                                                      */
/* -------------------------------------------------------------------------- */

-- Board actions and transcript are jsonb: they are an append-only log the
-- client replays verbatim, never something the server queries into.
create table lessons (
  id           text primary key,
  user_id      text not null references users(id) on delete cascade,
  course_id    text references courses(id) on delete set null,
  title        text not null default 'Untitled lesson',
  plan         jsonb,
  actions      jsonb not null default '[]'::jsonb,
  transcript   jsonb not null default '[]'::jsonb,
  usage        jsonb not null default '{}'::jsonb,
  material_ids text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index lessons_user_id_idx on lessons (user_id, updated_at desc);

/* -------------------------------------------------------------------------- */
/* Practice & retention                                                         */
/* -------------------------------------------------------------------------- */

create table review_cards (
  id            text primary key,
  user_id       text not null references users(id) on delete cascade,
  material_id   text references materials(id) on delete cascade,
  prompt        text not null,
  answer        text not null,
  explanation   text,
  source_locator text,
  -- SM-2-lite state, mirroring src/lib/srs.ts
  due_at        timestamptz not null,
  interval_days real not null default 0,
  ease          real not null default 2.5,
  reps          integer not null default 0,
  lapses        integer not null default 0,
  last_result   text check (last_result in ('hit','miss')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index review_cards_due_idx on review_cards (user_id, due_at);
create index review_cards_material_idx on review_cards (material_id);

create table quiz_attempts (
  id           text primary key,
  user_id      text not null references users(id) on delete cascade,
  lesson_id    text references lessons(id) on delete set null,
  title        text not null,
  material_ids text[] not null default '{}',
  score        integer not null,
  total        integer not null,
  created_at   timestamptz not null default now()
);

create index quiz_attempts_user_idx on quiz_attempts (user_id, created_at desc);

/* -------------------------------------------------------------------------- */
/* Calendar & study planning                                                    */
/* -------------------------------------------------------------------------- */

-- The syllabus a student uploaded, plus whatever the model pulled out of it.
create table syllabi (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  course_id   text not null references courses(id) on delete cascade,
  material_id text references materials(id) on delete set null,
  parsed      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index syllabi_course_idx on syllabi (course_id);

create table calendar_events (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  course_id  text references courses(id) on delete cascade,
  kind       text not null check (kind in ('exam','assignment','class','reading','other')),
  title      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  all_day    boolean not null default false,
  location   text,
  notes      text,
  -- Topics this event covers, used to aim the study plan at the right chunks.
  topics     text[] not null default '{}',
  source     text not null default 'manual' check (source in ('manual','syllabus')),
  created_at timestamptz not null default now()
);

create index calendar_events_user_start_idx on calendar_events (user_id, starts_at);
create index calendar_events_course_idx on calendar_events (course_id);

-- One scheduled sitting. The plan is a list of these, generated backwards from
-- an exam date and re-generated whenever the exam or material changes.
create table study_blocks (
  id           text primary key,
  user_id      text not null references users(id) on delete cascade,
  event_id     text references calendar_events(id) on delete cascade,
  course_id    text references courses(id) on delete cascade,
  title        text not null,
  topic        text,
  starts_at    timestamptz not null,
  minutes      integer not null default 45,
  material_ids text[] not null default '{}',
  status       text not null default 'planned' check (status in ('planned','done','skipped')),
  created_at   timestamptz not null default now()
);

create index study_blocks_user_start_idx on study_blocks (user_id, starts_at);
create index study_blocks_event_idx on study_blocks (event_id);
