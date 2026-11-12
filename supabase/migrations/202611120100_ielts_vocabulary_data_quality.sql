-- Vocabulary data quality, P1:
-- 1. Sort IELTS terms without a leading article, so "a baptism of fire" files under B, not A.
-- 2. Recalibrate suggested bands for idioms and multi-word verb phrases.
-- 3. Let learners see sentences from published Reading passages that use a word.

-- 1. Sort key: lower case, leading "a/an/the" removed. Generated, so imports keep it in step.
alter table public.ielts_vocabulary_entries
  add column if not exists sort_term text
  generated always as (lower(regexp_replace(btrim(term), '^(a|an|the)\s+', '', 'i'))) stored;
comment on column public.ielts_vocabulary_entries.sort_term is
  'Ordering key: the term in lower case without a leading a/an/the. Display still uses term.';
create index if not exists ielts_vocab_band_topic_sort_idx
  on public.ielts_vocabulary_entries (band_level, topic, sort_term, source_key) where published;
create index if not exists ielts_vocab_sort_idx
  on public.ielts_vocabulary_entries (sort_term, source_key) where published;

-- 2. The suggested band comes from wordfreq, which scores a phrase by its individual words:
--    "a clean bill of health" scored like "clean" and "bill" (Band 3). Idiomatic meaning is not
--    in word frequency, so idioms get at least Band 6 (IELTS descriptors place idiomatic usage
--    at 6–7), one band higher when wordfreq already put them at 6. Multi-word verb phrases
--    ("take out", "back up") get at least Band 3. Single words and noun/adjective collocations
--    keep their wordfreq band. Editor-reviewed bands are never touched.
update public.ielts_vocabulary_entries
set band_level = case when band_level in ('6', '7+') then '7+' else '6' end,
    band_model = 'wordfreq-en-3.1.1-thresholds-v1+idiom-floor-6'
where band_method = 'suggested'
  and pos_raw = 'Thành ngữ'
  and band_model = 'wordfreq-en-3.1.1-thresholds-v1';

update public.ielts_vocabulary_entries
set band_level = '3',
    band_model = 'wordfreq-en-3.1.1-thresholds-v1+verb-phrase-floor-3'
where band_method = 'suggested'
  and pos_raw = 'Cụm động từ'
  and btrim(term) like '% %'
  and band_level in ('1', '2')
  and band_model = 'wordfreq-en-3.1.1-thresholds-v1';

-- 3. Sentences from published Reading passages containing the word (whole word, simple
--    -s/-es/-ed/-ing endings for single words). Listening transcripts are left out on purpose:
--    a transcript line can give away an answer.
create or replace function public.vocabulary_reading_examples(p_term text, p_limit integer default 3)
returns table (exam_id uuid, exam_title text, section_title text, sentence text)
language sql stable security definer
set search_path = ''
as $$
  with term as (
    select lower(regexp_replace(btrim(coalesce(p_term, '')), '^(a|an|the|to)\s+', '', 'i')) as value
  ), pattern as (
    select '\m' || regexp_replace(value, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
      || case when value ~ '\s' then '' else '(s|es|ed|d|ing)?' end || '\M' as value
    from term
    where char_length(value) between 3 and 80
  ), passages as (
    select e.id, e.title, coalesce(s.value ->> 'title', '') as section_title, s.value ->> 'passage' as passage
    from public.ielts_exams e
    join public.ielts_exam_versions v on v.id = e.published_version_id
    cross join lateral jsonb_array_elements(coalesce(v.content -> 'sections', '[]'::jsonb)) s(value)
    where auth.uid() is not null
      and e.status = 'published'
      and e.skill = 'Reading'
      and coalesce(s.value ->> 'passage', '') <> ''
  ), sentences as (
    select p.id, p.title, p.section_title, btrim(regexp_replace(part, '\s+', ' ', 'g')) as sentence
    from passages p
    cross join lateral regexp_split_to_table(p.passage, '(?<=[.!?])\s+') part
  ), matches as (
    select distinct on (s.id) s.id, s.title, s.section_title, s.sentence
    from sentences s, pattern
    where s.sentence ~* pattern.value
      and char_length(s.sentence) between 30 and 320
    order by s.id, char_length(s.sentence)
  )
  select id, title, section_title, sentence
  from matches
  order by char_length(sentence)
  limit least(5, greatest(1, coalesce(p_limit, 3)));
$$;
revoke all on function public.vocabulary_reading_examples(text, integer) from public, anon;
grant execute on function public.vocabulary_reading_examples(text, integer) to authenticated;
