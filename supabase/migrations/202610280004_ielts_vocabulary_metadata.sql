-- Phase 4: preserve source text and make its language and review metadata explicit.
alter table public.ielts_vocabulary_entries
  add column definition_vi text,
  add column pos_standard text,
  add column cefr_level text check (cefr_level in ('A1','A2','B1','B2','C1','C2')),
  add column learning_stage text,
  add column learning_priority smallint check (learning_priority between 1 and 5),
  add column qa_flags text[] not null default '{}',
  add column qa_model text,
  add column qa_checked_at timestamptz;

update public.ielts_vocabulary_entries
set definition_vi = definition_en,
    pos_standard = case pos_raw
      when 'Danh từ' then 'noun'
      when 'Cụm danh từ' then 'noun_phrase'
      when 'Động từ' then 'verb'
      when 'Tính từ' then 'adjective'
      when 'Cụm tính từ' then 'adjective_phrase'
      when 'Cụm động từ' then 'verb_phrase'
      when 'Thành ngữ' then 'idiom'
      when 'Cụm giới từ' then 'prepositional_phrase'
    end;

alter table public.ielts_vocabulary_entries
  alter column definition_vi set not null,
  alter column pos_standard set not null,
  add constraint ielts_vocab_pos_standard_check check (pos_standard in (
    'noun','noun_phrase','verb','adjective','adjective_phrase',
    'verb_phrase','idiom','prepositional_phrase')),
  add constraint ielts_vocab_qa_flags_check check (qa_flags <@ array[
    'example_contains_nine','term_not_literal_in_examples',
    'duplicate_example_within_row','example_reused_across_rows',
    'short_definition']::text[]);

comment on column public.ielts_vocabulary_entries.definition_en is
  'Legacy name: contains the source CSV Definition, which is Vietnamese. Use definition_vi in new code.';
comment on column public.ielts_vocabulary_entries.definition_vi is
  'Vietnamese meaning copied exactly from the owner-provided CSV; not editor reviewed.';
comment on column public.ielts_vocabulary_entries.cefr_level is
  'Nullable until an editor has evidence for a CEFR assignment. Independent of estimated IELTS band.';
comment on column public.ielts_vocabulary_entries.qa_flags is
  'Heuristic review leads, not confirmed content errors.';

-- One service-role-only batch endpoint prevents 5,000 individual writes. Each
-- batch fails atomically if a source row changed or was editor reviewed.
create or replace function public.apply_ielts_vocabulary_qa_batch(p_rows jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  expected_count integer;
  changed_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Expected an array';
  end if;
  expected_count := jsonb_array_length(p_rows);
  if expected_count < 1 or expected_count > 100 then
    raise exception 'Batch size outside 1..100';
  end if;

  with input as (
    select * from jsonb_to_recordset(p_rows) as x(
      source_key text, source_row_sha256 text, qa_flags text[])
  )
  select count(*) into changed_count from input i
  join public.ielts_vocabulary_entries e using (source_key)
  where e.source_row_sha256 = i.source_row_sha256
    and e.content_status = 'source_unreviewed';
  if changed_count <> expected_count then
    raise exception 'Missing, duplicate, changed or reviewed source row';
  end if;

  with input as (
    select * from jsonb_to_recordset(p_rows) as x(
      source_key text, source_row_sha256 text, qa_flags text[])
  )
  update public.ielts_vocabulary_entries e
  set qa_flags = i.qa_flags,
      qa_model = 'source-heuristics-v1',
      qa_checked_at = now()
  from input i
  where e.source_key = i.source_key
    and e.source_row_sha256 = i.source_row_sha256
    and e.content_status = 'source_unreviewed'
    and (e.qa_flags is distinct from i.qa_flags or e.qa_model is distinct from 'source-heuristics-v1');
  return expected_count;
end;
$$;
revoke all on function public.apply_ielts_vocabulary_qa_batch(jsonb) from public, anon, authenticated;
grant execute on function public.apply_ielts_vocabulary_qa_batch(jsonb) to service_role;
