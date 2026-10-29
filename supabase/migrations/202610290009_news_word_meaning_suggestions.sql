-- Learners may suggest a better contextual translation without changing the displayed meaning.
create table public.news_word_meaning_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  word text not null check (length(word) between 1 and 60),
  current_meaning text not null default '',
  suggested_meaning text not null check (length(btrim(suggested_meaning)) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  created_at timestamptz not null default now()
);

create index news_word_meaning_suggestions_pending
  on public.news_word_meaning_suggestions(status, created_at desc);

alter table public.news_word_meaning_suggestions enable row level security;
create policy news_word_suggestion_insert_self on public.news_word_meaning_suggestions
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy news_word_suggestion_select_self on public.news_word_meaning_suggestions
  for select to authenticated using (user_id = auth.uid());
create policy news_word_suggestion_select_admin on public.news_word_meaning_suggestions
  for select to authenticated using (public.is_admin());
create policy news_word_suggestion_review_admin on public.news_word_meaning_suggestions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.news_word_meaning_suggestions from public, anon, authenticated;
grant insert, select on public.news_word_meaning_suggestions to authenticated;
grant update(status) on public.news_word_meaning_suggestions to authenticated;
