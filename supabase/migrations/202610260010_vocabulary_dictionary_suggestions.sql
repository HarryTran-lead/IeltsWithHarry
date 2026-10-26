-- Dictionary suggestions are visible to learners but are never editorial approval.
alter table public.vocabulary_bank_entries
  add column auto_meaning_vi text not null default '',
  add column auto_meaning_options text[] not null default '{}',
  add column auto_meaning_status text not null default 'missing',
  add column auto_meaning_source text not null default '',
  add column auto_meaning_source_url text not null default '',
  add column auto_meaning_gloss_en text not null default '',
  add column source_ipa text not null default '';

create function public.list_vocabulary_study_by_level(
  p_query text default '', p_level text default '', p_topic text default '',
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
    and (coalesce(p_level, '') = '' or b.study_lane = p_level)
    and (coalesce(p_topic, '') = '' or p_topic = any(b.topics))
  order by b.headword, b.source_id
  limit least(100, greatest(1, coalesce(p_page_size, 20)))
  offset greatest(0, coalesce(p_page, 0)) * least(100, greatest(1, coalesce(p_page_size, 20)));
$$;

revoke all on function public.list_vocabulary_study_by_level(text,text,text,integer,integer) from public;
grant execute on function public.list_vocabulary_study_by_level(text,text,text,integer,integer) to authenticated;
