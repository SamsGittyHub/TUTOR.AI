-- Provider API keys, stored per account.
--
-- Until now a key lived only in the browser, which meant re-pasting it on
-- every device and after every cache clear. Keeping it server-side is what the
-- PRD asked for ("encrypted at rest, never logged"), and the tradeoff is now
-- real: we hold the ciphertext, so the encryption key must live outside the
-- database, in TUTOR_AI_KEY_SECRET.
--
-- AES-256-GCM, one random nonce per row. `hint` is the masked tail ("…4f2a")
-- so the UI can show which key is stored without decrypting anything.

create table user_api_keys (
  user_id     text not null references users(id) on delete cascade,
  provider_id text not null,
  ciphertext  bytea not null,
  nonce       bytea not null,
  auth_tag    bytea not null,
  hint        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, provider_id)
);

-- Opting out on a shared machine: when false, the key is never sent to us.
alter table users
  add column sync_keys boolean not null default true;
