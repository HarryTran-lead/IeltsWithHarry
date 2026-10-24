-- Per-learner Daily News preferences, kept separate from the shared article catalog.
create table public.user_news_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  stage_id text references public.learning_stages(id),
  topics text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (cardinality(topics) <= 8),
  check (topics <@ array['Technology','Science','Education','Health','Environment','Business','Culture','World News']::text[])
);
alter table public.user_news_preferences enable row level security;
create policy news_preferences_self on public.user_news_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.user_news_preferences from anon, authenticated;
grant select, insert, update on public.user_news_preferences to authenticated;
