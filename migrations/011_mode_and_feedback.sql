-- Two additions, both about what happens after a lesson.

-- How a lesson was taught. A spoken lesson reopened on the typed board is a
-- different lesson from the one the student remembers having, so Lessons needs
-- to know where to send them back to. Defaulted, because every existing row
-- was typed.
alter table lessons add column mode text not null default 'typed';

-- Beta feedback, straight from the app.
--
-- The whole point of the free beta is hearing what breaks, and until now there
-- was no way to say so from inside the thing that broke. The route and lesson
-- are captured with the message because "it didn't work" without them costs a
-- round trip to become useful.
create table feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    text references users(id) on delete set null,
  message    text not null,
  path       text,
  lesson_id  text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index feedback_created_at_idx on feedback (created_at desc);
