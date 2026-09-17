-- Align the schema with the types the client actually round-trips.
--
-- 001 was written from the PRD; these are the corrections from reading
-- src/lib/srs.ts and src/lib/db.ts. A card belongs to however many materials
-- the quiz drew on (not one), carries its choices, and dedupes on a normalized
-- prompt so regenerating a near-identical quiz reschedules rather than piles up.

alter table review_cards drop column material_id;

alter table review_cards
  add column prompt_key   text not null,
  add column material_ids text[] not null default '{}',
  add column choices      text[];

-- The dedupe key is per-student, not global.
create unique index review_cards_user_prompt_key on review_cards (user_id, prompt_key);
create index review_cards_material_ids_idx on review_cards using gin (material_ids);

-- A lesson remembers which model taught it and how the board looked, so
-- resuming on another device doesn't silently switch either.
alter table lessons
  add column provider_id text not null default 'anthropic',
  add column model       text not null default '',
  add column board_theme text not null default 'paper'
    check (board_theme in ('paper','chalk'));
