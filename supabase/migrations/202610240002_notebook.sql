-- Personal study notebook and a lightweight lesson visit trail.
create table public.notebook_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('note', 'word')),
  title text not null check (char_length(trim(title)) between 1 and 100),
  body text not null default '' check (char_length(body) <= 5000),
  meaning_vi text not null default '' check (char_length(meaning_vi) <= 200),
  example text not null default '' check (char_length(example) <= 500),
  source_path text not null default '' check (char_length(source_path) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'note' and char_length(trim(body)) > 0) or
         (kind = 'word' and char_length(trim(meaning_vi)) > 0))
);
create index notebook_entries_user_created_idx on public.notebook_entries(user_id, created_at desc);

create table public.study_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 300),
  title text not null check (char_length(trim(title)) between 1 and 100),
  visited_at timestamptz not null default now()
);
create index study_visits_user_visited_idx on public.study_visits(user_id, visited_at desc);

alter table public.notebook_entries enable row level security;
alter table public.study_visits enable row level security;
create policy notebook_self on public.notebook_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy visits_self on public.study_visits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.notebook_entries, public.study_visits from anon, authenticated;
grant select, delete on public.notebook_entries to authenticated;
grant insert(kind, title, body, meaning_vi, example, source_path) on public.notebook_entries to authenticated;
grant update(title, body, meaning_vi, example, source_path, updated_at) on public.notebook_entries to authenticated;
grant select on public.study_visits to authenticated;
grant insert(path, title) on public.study_visits to authenticated;
