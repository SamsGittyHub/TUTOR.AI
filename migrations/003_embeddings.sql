-- Vectors for semantic retrieval.
--
-- Stored as real[] rather than pgvector: Railway's Postgres image may not have
-- the extension, and a course's worth of chunks is a few hundred rows — cosine
-- in JS over that is sub-millisecond. If this ever needs an index, that's the
-- moment to reach for pgvector, not before.
--
-- embedding_model records which model produced the vector, because vectors
-- from different models are not comparable and a silent mix would quietly
-- ruin retrieval.

alter table material_chunks
  add column embedding       real[],
  add column embedding_model text;

create index material_chunks_unembedded_idx
  on material_chunks (material_id)
  where embedding is null;
