-- A separate, additive IELTS collection. Existing CEFR bank IDs and learner
-- notebook/review data are unchanged.
create table if not exists public.ielts_vocabulary_entries (
  source_key text primary key,
  term text not null check (char_length(term) between 1 and 200),
  normalized_term text not null unique,
  definition_en text not null,
  pos_raw text not null,
  pattern text not null default '',
  examples text[] not null check (cardinality(examples) >= 1),
  topic text not null,
  band_level text check (band_level in ('1','2','3','4','5','6','7+')),
  band_method text not null default 'unassessed'
    check (band_method in ('unassessed','suggested','editor_reviewed')),
  band_score real,
  band_model text not null default '',
  content_status text not null default 'source_unreviewed'
    check (content_status in ('source_unreviewed','editor_reviewed')),
  published boolean not null default false,
  source_archive_sha256 text not null check (source_archive_sha256 ~ '^[0-9a-f]{64}$'),
  source_file text not null,
  source_row integer not null check (source_row > 0),
  source_row_sha256 text not null check (source_row_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ielts_band_method_consistency check
    ((band_level is null and band_method = 'unassessed')
      or (band_level is not null and band_method <> 'unassessed'))
);

create index if not exists ielts_vocab_topic_term_idx
  on public.ielts_vocabulary_entries (topic, term, source_key) where published;
create index if not exists ielts_vocab_band_term_idx
  on public.ielts_vocabulary_entries (band_level, term, source_key) where published;
create index if not exists ielts_vocab_term_idx
  on public.ielts_vocabulary_entries (term, source_key) where published;

alter table public.ielts_vocabulary_entries enable row level security;
create policy ielts_vocab_learner_read on public.ielts_vocabulary_entries
  for select to authenticated using (published or (select public.is_admin()));
create policy ielts_vocab_admin_insert on public.ielts_vocabulary_entries
  for insert to authenticated with check ((select public.is_admin()));
create policy ielts_vocab_admin_update on public.ielts_vocabulary_entries
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy ielts_vocab_admin_delete on public.ielts_vocabulary_entries
  for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.ielts_vocabulary_entries to authenticated;

-- Keep the older level RPC intact for callers that still use it. This version
-- filters the same live source collection by its actual CEFR field.
create or replace function public.list_vocabulary_study_by_cefr(
  p_query text default '', p_cefr text default '', p_topic text default '',
  p_page integer default 0, p_page_size integer default 20
)
returns table (
  source_id text, headword text, pos text, cefr text, study_lane text,
  topics text[], source_definition_en text, source_example_en text,
  source_name text, source_url text, definition_source_url text,
  meaning_vi text, meaning_options text[], meaning_status text,
  meaning_source text, meaning_source_url text, source_ipa text,
  total_count bigint
)
language sql stable security definer
set search_path = ''
as $$
  select b.source_id, b.headword, b.pos, b.cefr, b.study_lane, b.topics,
    b.source_definition_en, b.source_example_en, b.source_name, b.source_url,
    b.definition_source_url,
    case when b.published then b.meaning_vi else b.auto_meaning_vi end,
    case when b.published then array[b.meaning_vi] else b.auto_meaning_options end,
    case when b.published then 'editor_reviewed' else b.auto_meaning_status end,
    case when b.published then 'IeltsWithHarry editorial' else b.auto_meaning_source end,
    case when b.published then '' else b.auto_meaning_source_url end,
    b.source_ipa, count(*) over() as total_count
  from public.vocabulary_bank_entries b
  where auth.uid() is not null and b.student_visible
    and (coalesce(p_query, '') = '' or b.headword ilike '%' || p_query || '%')
    and (coalesce(p_cefr, '') = '' or b.cefr = p_cefr)
    and (coalesce(p_topic, '') = '' or p_topic = any(b.topics))
  order by b.headword, b.source_id
  limit least(100, greatest(1, coalesce(p_page_size, 20)))
  offset greatest(0, coalesce(p_page, 0)) * least(100, greatest(1, coalesce(p_page_size, 20)));
$$;
revoke all on function public.list_vocabulary_study_by_cefr(text,text,text,integer,integer) from public;
grant execute on function public.list_vocabulary_study_by_cefr(text,text,text,integer,integer) to authenticated;
