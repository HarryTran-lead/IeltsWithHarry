-- Separate owner-provided IELTS Listening vocabulary set; original and added rows stay distinguishable.
create table public.listening_vocabulary_entries (
  id text primary key check (id ~ '^LST-[0-9]{4}$'),
  source_order integer not null unique check (source_order between 1 and 1200),
  topic_id integer not null check (topic_id between 1 and 35),
  topic_en text not null,
  topic_vi text not null,
  subtopic text not null default '',
  word text not null,
  meaning_vi text not null,
  ipa_us_approx text not null default '',
  example_en text not null,
  example_vi text not null,
  listening_paraphrase text not null default '',
  listening_note text not null,
  source_type text not null check (source_type in ('Trong ảnh','Bổ sung')),
  level_label text not null check (level_label in ('Core','IELTS Listening')),
  source_archive_sha256 text not null check (source_archive_sha256 ~ '^[0-9a-f]{64}$'),
  content_status text not null default 'source_unreviewed',
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index listening_vocabulary_topic_idx on public.listening_vocabulary_entries (topic_id, source_order) where published;
create index listening_vocabulary_word_idx on public.listening_vocabulary_entries (word, id) where published;
alter table public.listening_vocabulary_entries enable row level security;
create policy listening_vocabulary_entries_read on public.listening_vocabulary_entries
  for select to authenticated using (published or (select public.is_admin()));
grant select on public.listening_vocabulary_entries to authenticated;

create table public.user_listening_vocab_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id text not null references public.listening_vocabulary_entries(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_reviewed_at timestamptz not null default now(),
  due_at timestamptz not null default now(),
  interval_days integer not null default 0 check (interval_days between 0 and 3650),
  repetitions integer not null default 0 check (repetitions >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  last_grade text not null default 'again' check (last_grade in ('again','hard','good','easy')),
  primary key (user_id, entry_id)
);
create index user_listening_vocab_due_idx on public.user_listening_vocab_progress (user_id, due_at);
alter table public.user_listening_vocab_progress enable row level security;
create policy user_listening_vocab_progress_self on public.user_listening_vocab_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.user_listening_vocab_progress to authenticated;
