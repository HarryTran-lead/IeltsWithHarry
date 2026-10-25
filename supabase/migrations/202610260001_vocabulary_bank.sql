-- Imported English reference words stay in draft until an editor checks the sense
-- and adds a Vietnamese meaning. CEFR and study lane are separate from IELTS scores.
create table if not exists public.vocabulary_bank_entries (
  source_id text primary key,
  headword text not null,
  pos text not null default '',
  cefr text not null check (cefr in ('A1','A2','B1','B2','C1','C2')),
  study_lane text not null,
  topics text[] not null default '{}',
  topic_basis text not null default '',
  definition_en text not null default '',
  example_en text not null default '',
  meaning_vi text not null default '',
  source_name text not null,
  source_url text not null default '',
  definition_source_url text not null default '',
  definition_status text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vocabulary_bank_headword_length check (char_length(headword) between 1 and 200)
);

create index if not exists vocabulary_bank_level_word_idx on public.vocabulary_bank_entries (cefr, headword);
create index if not exists vocabulary_bank_topics_idx on public.vocabulary_bank_entries using gin (topics);
create index if not exists vocabulary_bank_published_word_idx on public.vocabulary_bank_entries (published, headword);

alter table public.vocabulary_bank_entries enable row level security;
create policy vocabulary_bank_read on public.vocabulary_bank_entries
  for select to authenticated using (published or (select public.is_admin()));
create policy vocabulary_bank_admin_insert on public.vocabulary_bank_entries
  for insert to authenticated with check ((select public.is_admin()));
create policy vocabulary_bank_admin_update on public.vocabulary_bank_entries
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy vocabulary_bank_admin_delete on public.vocabulary_bank_entries
  for delete to authenticated using ((select public.is_admin()));

grant select, insert, update, delete on public.vocabulary_bank_entries to authenticated;
