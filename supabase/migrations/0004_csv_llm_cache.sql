-- Deterministic cache for LLM-assisted CSV parsing responses.
--
-- Keyed by sha256(normalized_input + ':' + schema_version). Cross-tenant
-- safe because the cached values are either column-header mappings or
-- supervisor-name resolutions (both work on structural inputs, not
-- sensitive employee data).
--
-- Shared across all orgs on purpose: re-uploads of the same file and
-- common header shapes hit the cache immediately, making the LLM
-- fallback deterministic, zero-cost, and near-instant on the hot path.

create table if not exists csv_llm_cache (
  key text primary key,
  kind text not null check (kind in ('header_mapping', 'supervisor_resolution')),
  request jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists csv_llm_cache_kind_idx on csv_llm_cache (kind);
create index if not exists csv_llm_cache_created_idx on csv_llm_cache (created_at desc);

-- No RLS: cache is service-role only. The parser runs server-side via
-- the admin client, never exposed to end users directly.
