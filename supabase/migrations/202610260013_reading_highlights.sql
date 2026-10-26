-- Personal highlights for lesson passages and readable news articles.
create table public.reading_highlights (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc_key text not null check (char_length(doc_key) between 1 and 300),
  highlights jsonb not null default '[]'::jsonb
    check (jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_key)
);

alter table public.reading_highlights enable row level security;
create policy reading_highlights_self on public.reading_highlights
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.reading_highlights from anon, authenticated;
grant select, insert, update, delete on public.reading_highlights to authenticated;
