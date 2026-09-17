-- Marked exams the student photographs and asks the tutor to go through.
--
-- `pages` and `review` are jsonb: both are produced once and replayed, never
-- queried into. Page images live on the volume like any other upload, so the
-- row holds paths rather than bytes and deleting a review takes its directory
-- with it.

create table exam_reviews (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  course_id  text references courses(id) on delete set null,
  title      text not null,
  -- [{ locator, storagePath, mediaType }]
  pages      jsonb not null default '[]'::jsonb,
  -- The structured review; null while it's still being read.
  review     jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exam_reviews_user_idx on exam_reviews (user_id, created_at desc);
