-- Curriculum topics are separate from the 36 labels on the CEFR source bank
-- and the original topic text on IELTS source rows. No word is linked by name.
create table public.ielts_learning_topics (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null unique,
  origin text not null check (origin in ('source_named','editorial_expansion')),
  target_new_unique integer not null default 0 check (target_new_unique >= 0),
  created_at timestamptz not null default now()
);

insert into public.ielts_learning_topics (slug, title, origin, target_new_unique)
select trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')),
       title, origin, target_new_unique
from (values
  ('Cities & Urban Life','source_named',0),
  ('Crime & Justice','source_named',0),
  ('Culture & Heritage','source_named',0),
  ('Economy & Consumerism','source_named',0),
  ('Education & Learning','source_named',0),
  ('Energy & Resources','source_named',0),
  ('Environment & Climate','source_named',0),
  ('Equality & Social Change','source_named',0),
  ('Family & Children','source_named',0),
  ('Food & Agriculture','source_named',0),
  ('Globalisation & Trade','source_named',0),
  ('Government & Policy','source_named',0),
  ('Health & Well-being','source_named',0),
  ('Housing & Communities','source_named',0),
  ('Language & Communication','source_named',0),
  ('Media & Advertising','source_named',0),
  ('Oceans & Water','source_named',0),
  ('Personal Finance & Household Life','source_named',0),
  ('Population & Migration','source_named',0),
  ('Science & Research','source_named',0),
  ('Sport & Active Lifestyles','source_named',0),
  ('Technology & Digital Life','source_named',0),
  ('Tourism & Travel','source_named',0),
  ('Transport & Mobility','source_named',0),
  ('Work & Employment','source_named',0),
  ('Everyday Routines & Habits','editorial_expansion',180),
  ('Friends & Social Relationships','editorial_expansion',170),
  ('Personality, Feelings & Character','editorial_expansion',220),
  ('Entertainment, Films & Music','editorial_expansion',200),
  ('Shopping, Fashion & Consumer Choices','editorial_expansion',170),
  ('Hobbies & Free Time','editorial_expansion',170),
  ('Weather, Seasons & Outdoor Life','editorial_expansion',150),
  ('Animals, Wildlife & Pets','editorial_expansion',170),
  ('Festivals, Celebrations & Traditions','editorial_expansion',150),
  ('Personal Objects, Gifts & Possessions','editorial_expansion',150),
  ('Childhood & Personal Memories','editorial_expansion',170),
  ('Places, Landmarks & Descriptions','editorial_expansion',190),
  ('Home Life & Household Chores','editorial_expansion',170),
  ('Food, Cooking & Dining Out','editorial_expansion',180),
  ('Stories, Experiences & Opinions','editorial_expansion',210)
) as t(title, origin, target_new_unique);

-- Drafts are only held in Development during Phase 5. They have no learner
-- SELECT grant and cannot appear in the live IELTS entries table.
create table public.ielts_vocabulary_draft_batches (
  batch_key text primary key,
  topic_slug text not null references public.ielts_learning_topics(slug),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  origin text not null,
  created_at timestamptz not null default now(),
  unique (batch_key, topic_slug)
);

create table public.ielts_vocabulary_draft_entries (
  candidate_key text primary key,
  proposal_sha256 text not null check (proposal_sha256 ~ '^[0-9a-f]{64}$'),
  batch_key text not null,
  topic_slug text not null,
  term text not null check (char_length(term) between 1 and 200),
  normalized_term text not null unique,
  definition_vi text not null check (char_length(trim(definition_vi)) >= 3),
  pos_standard text not null check (pos_standard in (
    'noun','noun_phrase','verb','verb_phrase','adjective','adjective_phrase',
    'adverb','idiom','prepositional_phrase','expression')),
  pattern text not null check (char_length(trim(pattern)) >= 3),
  examples text[] not null check (cardinality(examples) >= 2),
  collocations text[] not null check (cardinality(collocations) >= 1),
  cefr_proposed text not null check (cefr_proposed in ('A1','A2','B1','B2','C1','C2')),
  stage_proposed text not null check (stage_proposed in ('foundation','developing','advanced')),
  priority_proposed smallint not null check (priority_proposed between 0 and 2),
  skill_tags text[] not null check (cardinality(skill_tags) >= 1 and skill_tags <@ array[
    'speaking','writing','reading','listening']::text[]),
  qa_flags text[] not null default '{}' check (qa_flags <@ array[
    'term_not_literal_in_examples','short_definition','short_example',
    'duplicate_example','example_contains_nine']::text[]),
  review_status text not null default 'proposed' check (review_status in (
    'proposed','needs_revision','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  origin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (batch_key, topic_slug)
    references public.ielts_vocabulary_draft_batches(batch_key, topic_slug),
  constraint approval_requires_review check (
    review_status <> 'approved' or (reviewed_by is not null and reviewed_at is not null
      and cardinality(qa_flags) = 0))
);
create index ielts_vocab_draft_topic_status_idx
  on public.ielts_vocabulary_draft_entries (topic_slug, review_status, term);

alter table public.ielts_learning_topics enable row level security;
alter table public.ielts_vocabulary_draft_batches enable row level security;
alter table public.ielts_vocabulary_draft_entries enable row level security;
revoke all on public.ielts_learning_topics,
  public.ielts_vocabulary_draft_batches,
  public.ielts_vocabulary_draft_entries from anon, authenticated;
grant select, insert, update, delete on public.ielts_learning_topics,
  public.ielts_vocabulary_draft_batches,
  public.ielts_vocabulary_draft_entries to service_role;

-- One service-role-only call inserts a whole 25–50 entry proposal batch or
-- none of it. Editorial approval remains a separate operation.
create function public.stage_ielts_vocabulary_draft_batch(p_payload jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_batch text := p_payload->>'batch_key';
  v_topic text := p_payload->>'topic_slug';
  v_sha text := p_payload->>'source_sha256';
  v_origin text := p_payload->>'origin';
  v_count integer;
begin
  if jsonb_typeof(p_payload->'entries') <> 'array' then
    raise exception 'Expected entries array';
  end if;
  v_count := jsonb_array_length(p_payload->'entries');
  if v_count < 25 or v_count > 50 or v_batch is null or v_topic is null
      or v_sha is null or v_origin is null then
    raise exception 'Invalid draft batch metadata or size';
  end if;
  if not exists (select 1 from public.ielts_learning_topics
                 where slug = v_topic and origin = 'editorial_expansion') then
    raise exception 'Unknown expansion topic';
  end if;
  if (select count(distinct normalized_term) from jsonb_to_recordset(p_payload->'entries')
      as x(normalized_term text)) <> v_count then
    raise exception 'Duplicate normalized terms in batch';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_payload->'entries') as x(normalized_term text)
    where exists (select 1 from public.ielts_vocabulary_entries e
                  where e.normalized_term = x.normalized_term)
       or exists (select 1 from public.vocabulary_bank_entries b
                  where lower(trim(b.headword)) = x.normalized_term)
       or exists (select 1 from public.vocabulary_entries l
                  where lower(trim(l.word)) = x.normalized_term)
  ) then
    raise exception 'Exact existing vocabulary term collision';
  end if;
  if exists (select 1 from public.ielts_vocabulary_draft_batches
             where batch_key = v_batch and (source_sha256 <> v_sha or topic_slug <> v_topic)) then
    raise exception 'Batch key already has different content';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_payload->'entries')
      as x(candidate_key text, proposal_sha256 text, normalized_term text)
    join public.ielts_vocabulary_draft_entries d using (candidate_key)
    where d.proposal_sha256 <> x.proposal_sha256 or d.normalized_term <> x.normalized_term
       or d.batch_key <> v_batch or d.topic_slug <> v_topic
  ) then
    raise exception 'Candidate key already has different content';
  end if;

  insert into public.ielts_vocabulary_draft_batches
    (batch_key, topic_slug, source_sha256, origin)
  values (v_batch, v_topic, v_sha, v_origin)
  on conflict (batch_key) do nothing;

  insert into public.ielts_vocabulary_draft_entries
    (candidate_key, proposal_sha256, batch_key, topic_slug, term, normalized_term,
     definition_vi, pos_standard, pattern, examples, collocations, cefr_proposed,
     stage_proposed, priority_proposed, skill_tags, qa_flags, origin)
  select x.candidate_key, x.proposal_sha256, v_batch, v_topic, x.term,
         x.normalized_term, x.definition_vi, x.pos_standard, x.pattern,
         x.examples, x.collocations, x.cefr_proposed, x.stage_proposed,
         x.priority_proposed, x.skill_tags, x.qa_flags, v_origin
  from jsonb_to_recordset(p_payload->'entries') as x(
    candidate_key text, proposal_sha256 text, term text, normalized_term text,
    definition_vi text, pos_standard text, pattern text, examples text[],
    collocations text[], cefr_proposed text, stage_proposed text,
    priority_proposed smallint, skill_tags text[], qa_flags text[])
  on conflict (candidate_key) do nothing;

  if (select count(*) from public.ielts_vocabulary_draft_entries where batch_key = v_batch) <> v_count then
    raise exception 'Draft batch count mismatch';
  end if;
  return v_count;
end;
$$;
revoke all on function public.stage_ielts_vocabulary_draft_batch(jsonb) from public, anon, authenticated;
grant execute on function public.stage_ielts_vocabulary_draft_batch(jsonb) to service_role;
