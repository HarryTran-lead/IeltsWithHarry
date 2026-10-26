-- A reference word can be visible to learners before its bilingual sense is
-- reviewed. Editorial publication still requires the existing meaning guard.
alter table public.vocabulary_bank_entries
  add column student_visible boolean not null default false;

update public.vocabulary_bank_entries
set student_visible = true
where source_id like 'cefrj-%' or source_id like 'octanove-%';

create index vocabulary_bank_student_visible_level_word_idx
  on public.vocabulary_bank_entries (student_visible, study_lane, headword);

create or replace function public.list_vocabulary_reference_by_level(
  p_query text default '',
  p_level text default '',
  p_topic text default '',
  p_page integer default 0
)
returns table (
  source_id text,
  headword text,
  pos text,
  cefr text,
  study_lane text,
  topics text[],
  source_definition_en text,
  source_example_en text,
  source_name text,
  source_url text,
  definition_source_url text,
  total_count bigint
)
language sql stable security definer
set search_path = ''
as $$
  select b.source_id, b.headword, b.pos, b.cefr, b.study_lane, b.topics,
    b.source_definition_en, b.source_example_en, b.source_name, b.source_url,
    b.definition_source_url, count(*) over() as total_count
  from public.vocabulary_bank_entries b
  where auth.uid() is not null
    and b.student_visible
    and (coalesce(p_query, '') = '' or b.headword ilike '%' || p_query || '%')
    and (coalesce(p_level, '') = '' or b.study_lane = p_level)
    and (coalesce(p_topic, '') = '' or p_topic = any(b.topics))
  order by b.headword, b.source_id
  limit 20 offset greatest(0, coalesce(p_page, 0)) * 20;
$$;

revoke all on function public.list_vocabulary_reference_by_level(text, text, text, integer) from public;
grant execute on function public.list_vocabulary_reference_by_level(text, text, text, integer) to authenticated;
