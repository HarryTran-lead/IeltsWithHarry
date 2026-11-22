-- Apply filters once and exclude every completed read, not just the current page.
create function public.news_random_unread_article(
  p_category text default 'All News', p_region text default 'all', p_interest text default 'all',
  p_search text default '', p_feed text default 'latest', p_source text default 'all',
  p_year integer default null, p_type text default 'all', p_ready boolean default false,
  p_today_start timestamptz default null, p_today_end timestamptz default null
) returns uuid language sql volatile security invoker set search_path = '' as $$
  select a.id from public.news_archive_catalog a
  where auth.uid() is not null and a.publication_status = 'published' and not a.sensitive and a.readable
    and (p_category = 'All News' or a.category = p_category)
    and (p_region = 'all' or a.origin_region = p_region)
    and (p_interest = 'all' or p_interest = any(a.interest_topics))
    and (coalesce(trim(p_search),'') = '' or strpos(lower(a.title), lower(trim(p_search))) > 0)
    and (p_feed <> 'archive' or p_source = 'all' or a.source_id::text = p_source)
    and (p_feed <> 'archive' or p_year is null or extract(year from a.published_at) = p_year)
    and (p_feed <> 'today' or a.published_at >= p_today_start and a.published_at < p_today_end)
    and (p_feed <> 'hot' or exists(select 1 from public.news_article_bodies b where b.article_id = a.id and b.ai_generated))
    and (not p_ready and p_type = 'all' or exists(select 1 from public.news_auto_questions q where q.article_id = a.id and (p_type = 'all' or q.question_type = p_type)))
    and not exists(select 1 from public.user_news_article_reads r where r.article_id = a.id and r.user_id = auth.uid())
  order by random() limit 1;
$$;
revoke all on function public.news_random_unread_article(text,text,text,text,text,text,integer,text,boolean,timestamptz,timestamptz) from public,anon;
grant execute on function public.news_random_unread_article(text,text,text,text,text,text,integer,text,boolean,timestamptz,timestamptz) to authenticated;
