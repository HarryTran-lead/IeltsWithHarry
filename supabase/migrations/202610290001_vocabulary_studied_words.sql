-- Restore the migration already recorded in both development and production.
-- This file matches the deployed vocabulary_studied_words schema.
create table public.vocabulary_studied_words (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection text not null check (collection in ('cefr', 'ielts')),
  source_id text not null check (char_length(source_id) between 1 and 200),
  studied_at timestamptz not null default now(),
  primary key (user_id, collection, source_id)
);

alter table public.vocabulary_studied_words enable row level security;
create policy vocabulary_studied_words_self on public.vocabulary_studied_words
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.vocabulary_studied_words from anon, authenticated;
grant select on public.vocabulary_studied_words to authenticated;
grant insert(collection, source_id) on public.vocabulary_studied_words to authenticated;
