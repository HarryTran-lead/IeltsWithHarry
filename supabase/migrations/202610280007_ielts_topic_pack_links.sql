-- Owner-supplied topic pack: a topic placement is distinct from a unique word.
alter table public.ielts_vocabulary_entries drop constraint ielts_vocab_pos_standard_check;
alter table public.ielts_vocabulary_entries add constraint ielts_vocab_pos_standard_check
  check (pos_standard in (
    'noun','noun_phrase','verb','verb_phrase','adjective','adjective_phrase',
    'adverb','idiom','prepositional_phrase','expression'));

create table public.ielts_vocabulary_topic_links (
  source_key text not null references public.ielts_vocabulary_entries(source_key),
  topic_slug text not null references public.ielts_learning_topics(slug),
  pack_sha256 text not null check (pack_sha256 ~ '^[0-9a-f]{64}$'),
  pack_row integer not null check (pack_row > 1),
  link_kind text not null check (link_kind in (
    'published_existing','prior_draft','new_authored_proposal','link_existing_ielts_source')),
  review_origin text not null default 'owner_authorized_codex'
    check (review_origin = 'owner_authorized_codex'),
  created_at timestamptz not null default now(),
  primary key (source_key, topic_slug),
  unique (pack_sha256, pack_row)
);
create index ielts_vocab_topic_links_topic_idx
  on public.ielts_vocabulary_topic_links (topic_slug, source_key);
alter table public.ielts_vocabulary_topic_links enable row level security;
create policy ielts_vocab_topic_links_learner_read
  on public.ielts_vocabulary_topic_links for select to authenticated
  using (exists (
    select 1 from public.ielts_vocabulary_entries e
    where e.source_key = ielts_vocabulary_topic_links.source_key and e.published
  ));
grant select on public.ielts_vocabulary_topic_links to authenticated;
grant select, insert, update, delete on public.ielts_vocabulary_topic_links to service_role;

-- The owner explicitly authorized this package. Keep automated review separate
-- from human editor review and preserve the pre-clearance QA signals.
create table public.ielts_vocabulary_pack_review_events (
  source_key text primary key references public.ielts_vocabulary_entries(source_key),
  pack_sha256 text not null check (pack_sha256 ~ '^[0-9a-f]{64}$'),
  source_row_sha256 text not null check (source_row_sha256 ~ '^[0-9a-f]{64}$'),
  qa_flags_before text[] not null default '{}',
  review_origin text not null check (review_origin = 'owner_authorized_codex'),
  review_note text not null,
  reviewed_at timestamptz not null default now()
);
alter table public.ielts_vocabulary_pack_review_events enable row level security;
revoke all on public.ielts_vocabulary_pack_review_events from anon, authenticated;
grant select, insert on public.ielts_vocabulary_pack_review_events to service_role;
