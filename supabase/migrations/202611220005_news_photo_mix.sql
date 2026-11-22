-- Concurrent workers reserve AI slots only after eight of the latest ten
-- stories have real covers. Missing images never count as real photographs.
create table public.news_ai_cover_reservations (
  article_id uuid primary key references public.news_articles(id) on delete cascade,
  reserved_at timestamptz not null default now()
);
alter table public.news_ai_cover_reservations enable row level security;
revoke all on public.news_ai_cover_reservations from public,anon,authenticated;
grant all on public.news_ai_cover_reservations to service_role;

create function public.news_claim_ai_cover_slot(p_article_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_real integer; v_ai integer;
begin
  perform pg_advisory_xact_lock(hashtext('news_ai_cover_latest_ten'));
  delete from public.news_ai_cover_reservations where reserved_at < clock_timestamp() - interval '30 minutes';
  if exists(select 1 from public.news_archive_catalog where id=p_article_id and image_url is not null) then return false; end if;
  if not exists(select 1 from (select id from public.news_archive_catalog where publication_status='published' and not sensitive and readable order by published_at desc,id desc limit 10) a where id=p_article_id) then return false; end if;
  select count(*) filter(where a.image_url is not null and a.illustration_source_url is distinct from 'https://pollinations.ai/' and r.article_id is null),
    count(*) filter(where a.illustration_source_url='https://pollinations.ai/' or r.article_id is not null)
    into v_real,v_ai from (
      select id,image_url,illustration_source_url from public.news_archive_catalog
      where publication_status='published' and not sensitive and readable and id<>p_article_id
      order by published_at desc,id desc limit 9
    ) a left join public.news_ai_cover_reservations r on r.article_id=a.id;
  if v_real<8 or v_ai>=2 then return false; end if;
  insert into public.news_ai_cover_reservations(article_id) values(p_article_id) on conflict(article_id) do nothing;
  return found;
end;
$$;
revoke all on function public.news_claim_ai_cover_slot(uuid) from public,anon,authenticated;
grant execute on function public.news_claim_ai_cover_slot(uuid) to service_role;

create function public.news_admin_photo_mix() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select jsonb_build_object('total',count(*),'real',count(*) filter(where image_url is not null and illustration_source_url is distinct from 'https://pollinations.ai/'),
    'ai',count(*) filter(where illustration_source_url='https://pollinations.ai/'),'missing',count(*) filter(where image_url is null),
    'articles',coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'kind',case when image_url is null then 'missing' when illustration_source_url='https://pollinations.ai/' then 'ai' else 'real' end) order by published_at desc,id desc),'[]'::jsonb))
    into v_result from (select id,title,published_at,image_url,illustration_source_url from public.news_archive_catalog where publication_status='published' and not sensitive and readable order by published_at desc,id desc limit 10) a;
  return v_result;
end;
$$;
revoke all on function public.news_admin_photo_mix() from public,anon;
grant execute on function public.news_admin_photo_mix() to authenticated;
