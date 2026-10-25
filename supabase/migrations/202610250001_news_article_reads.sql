-- Track completed on-site news reading separately from authored lesson quizzes.
create table public.user_news_article_reads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, article_id)
);
create index user_news_article_reads_recent on public.user_news_article_reads(user_id, read_at desc);
alter table public.user_news_article_reads enable row level security;
create policy news_article_reads_self on public.user_news_article_reads for select to authenticated
  using (user_id = auth.uid());
revoke all on public.user_news_article_reads from anon, authenticated;
grant select on public.user_news_article_reads to authenticated;

create function public.news_mark_article_read(p_article_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_inserted boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.news_article_bodies b
    join public.news_articles a on a.id = b.article_id
    where b.article_id = p_article_id and a.publication_status = 'published' and not a.sensitive
  ) then raise exception 'On-site reading unavailable'; end if;
  insert into public.user_news_article_reads(user_id, article_id)
  values (auth.uid(), p_article_id)
  on conflict do nothing returning true into v_inserted;
  return coalesce(v_inserted, false);
end;
$$;
revoke all on function public.news_mark_article_read(uuid) from public;
grant execute on function public.news_mark_article_read(uuid) to authenticated;
