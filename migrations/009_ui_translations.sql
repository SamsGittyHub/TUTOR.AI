-- Machine-translated interface strings, one row per locale.
--
-- Hand-written translations don't scale to 182 languages, and shipping an
-- English interface to someone who picked Yoruba isn't "supporting" it. So the
-- English dictionary is the source of truth and every other locale is
-- translated once, by the model, and cached here for everyone — not per user.
--
-- `source_hash` is the hash of the English dictionary a row was translated
-- from. When a string is added or reworded the hash changes and the row is
-- regenerated, so a locale can never drift into being half-stale.

create table ui_translations (
  locale      text primary key,
  dict        jsonb not null,
  source_hash text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
