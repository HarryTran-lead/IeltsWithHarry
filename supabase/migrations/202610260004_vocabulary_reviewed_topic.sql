alter table public.vocabulary_bank_entries
  add column reviewed_topic text not null default '';

alter table public.vocabulary_bank_entries
  add constraint vocabulary_bank_publish_topic
  check (not published or length(trim(reviewed_topic)) > 0);

create index if not exists vocabulary_bank_reviewed_topic_idx
  on public.vocabulary_bank_entries (reviewed_topic, cefr, headword) where published;
