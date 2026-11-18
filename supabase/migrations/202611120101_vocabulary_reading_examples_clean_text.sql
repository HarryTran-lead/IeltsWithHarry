-- Reading passages carry Markdown paragraph labels ("**A** City parks are …") and line breaks.
-- Strip the labels and other ** markers, and also split sentences at line breaks, so an
-- example sentence never starts with "**A**" or runs across two paragraphs.
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
    select e.id, e.title, coalesce(s.value ->> 'title', '') as section_title,
      replace(regexp_replace(s.value ->> 'passage', '\*\*[A-Za-z0-9]{1,3}\*\*\s*', '', 'g'), '**', '') as passage
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
    cross join lateral regexp_split_to_table(p.passage, '(?<=[.!?])\s+|\n+') part
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
