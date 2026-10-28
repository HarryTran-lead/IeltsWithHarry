-- Phase 5 release: keep the source CSV labels and the learning curriculum distinct.
alter table public.ielts_vocabulary_entries
  add column content_origin text not null default 'source_csv'
    check (content_origin in ('source_csv','owner_authorized_editorial')),
  add column collocations text[] not null default '{}',
  add column skill_tags text[] not null default '{}';

alter table public.ielts_vocabulary_entries drop constraint ielts_vocabulary_entries_content_status_check;
alter table public.ielts_vocabulary_entries add constraint ielts_vocabulary_entries_content_status_check
  check (content_status in ('source_unreviewed','editor_reviewed','owner_authorized_review'));

alter table public.ielts_vocabulary_draft_entries drop constraint approval_requires_review;
alter table public.ielts_vocabulary_draft_entries
  add column review_origin text,
  add constraint approval_requires_review check (
    review_status <> 'approved' or
    (reviewed_at is not null and cardinality(qa_flags) = 0 and
      (reviewed_by is not null or review_origin = 'owner_authorized_codex'))
  );

create table public.ielts_vocabulary_review_events (
  candidate_key text primary key references public.ielts_vocabulary_draft_entries(candidate_key),
  proposal_sha256 text not null,
  qa_flags_before text[] not null,
  review_origin text not null check (review_origin = 'owner_authorized_codex'),
  qa_disposition text not null,
  reviewed_at timestamptz not null default now()
);

alter table public.ielts_vocabulary_review_events enable row level security;
revoke all on public.ielts_vocabulary_review_events from anon, authenticated;
grant select, insert on public.ielts_vocabulary_review_events to service_role;

-- The owner authorized this batch. Record the agent review separately from a
-- human editor account, and preserve every heuristic flag in the audit event.
create function public.approve_ielts_vocabulary_draft_batch(p_batch_key text, p_items jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_matched integer;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Expected an array';
  end if;
  v_expected := jsonb_array_length(p_items);
  if v_expected < 25 or v_expected > 50 then
    raise exception 'Batch size outside 25..50';
  end if;
  select count(*) into v_matched from public.ielts_vocabulary_draft_entries
  where batch_key = p_batch_key;
  if v_matched <> v_expected then
    raise exception 'Draft batch size mismatch';
  end if;
  select count(*) into v_matched
  from jsonb_to_recordset(p_items) as i(
    candidate_key text, proposal_sha256 text, band_level text,
    band_score real, band_model text, qa_disposition text)
  join public.ielts_vocabulary_draft_entries d
    on d.candidate_key = i.candidate_key and d.proposal_sha256 = i.proposal_sha256
  where d.batch_key = p_batch_key and d.review_status = 'proposed'
    and i.band_level in ('1','2','3','4','5','6','7+')
    and i.band_score is not null and i.band_model <> ''
    and length(trim(i.qa_disposition)) >= 8;
  if v_matched <> v_expected then
    raise exception 'Missing, changed, duplicate, reviewed or incomplete proposal';
  end if;
  if exists (
    select 1 from public.ielts_vocabulary_draft_entries d
    join public.ielts_vocabulary_entries e using (normalized_term)
    where d.batch_key = p_batch_key
  ) then
    raise exception 'IELTS term collision';
  end if;

  insert into public.ielts_vocabulary_review_events
    (candidate_key, proposal_sha256, qa_flags_before, review_origin, qa_disposition)
  select d.candidate_key, d.proposal_sha256, d.qa_flags,
    'owner_authorized_codex', i.qa_disposition
  from jsonb_to_recordset(p_items) as i(
    candidate_key text, proposal_sha256 text, band_level text,
    band_score real, band_model text, qa_disposition text)
  join public.ielts_vocabulary_draft_entries d using (candidate_key);

  update public.ielts_vocabulary_draft_entries d
  set review_status = 'approved', review_origin = 'owner_authorized_codex',
    reviewed_at = now(), qa_flags = '{}', updated_at = now()
  where d.batch_key = p_batch_key;

  insert into public.ielts_vocabulary_entries
    (source_key, term, normalized_term, definition_en, definition_vi,
     pos_raw, pos_standard, pattern, examples, topic, band_level, band_method,
     band_score, band_model, content_status, published, source_archive_sha256,
     source_file, source_row, source_row_sha256, cefr_level, learning_stage,
     learning_priority, content_origin, collocations, skill_tags)
  select d.candidate_key, d.term, d.normalized_term, d.definition_vi,
    d.definition_vi, 'Cụm động từ', d.pos_standard, d.pattern, d.examples,
    t.title, i.band_level, 'suggested', i.band_score, i.band_model,
    'owner_authorized_review', true, b.source_sha256,
    b.batch_key || '.json', row_number() over (order by d.term)::integer,
    d.proposal_sha256, d.cefr_proposed, d.stage_proposed,
    d.priority_proposed + 1, 'owner_authorized_editorial',
    d.collocations, d.skill_tags
  from public.ielts_vocabulary_draft_entries d
  join public.ielts_vocabulary_draft_batches b using (batch_key, topic_slug)
  join public.ielts_learning_topics t on t.slug = d.topic_slug
  join jsonb_to_recordset(p_items) as i(
    candidate_key text, proposal_sha256 text, band_level text,
    band_score real, band_model text, qa_disposition text) using (candidate_key)
  where d.batch_key = p_batch_key;
  return v_expected;
end;
$$;
revoke all on function public.approve_ielts_vocabulary_draft_batch(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.approve_ielts_vocabulary_draft_batch(text,jsonb)
  to service_role;
