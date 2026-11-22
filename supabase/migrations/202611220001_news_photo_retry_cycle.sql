-- Keep bounded search history for each article's real-photo slots.
alter table public.news_enrichment_attempts
  add column photo_attempt_count smallint not null default 0 check (photo_attempt_count between 0 and 4),
  add column photo_cycle_started_at timestamptz,
  add column photo_search_queries text[] not null default '{}',
  add column photo_rejected_urls text[] not null default '{}';

update public.news_enrichment_attempts
set photo_attempt_count = 1, photo_cycle_started_at = attempted_at,
    retry_after = now()
where kind in ('inline_image', 'real_cover_upgrade') and status in ('none', 'error');

create or replace function public.news_claim_photo_work(p_kind text, p_limit integer)
returns table(article_id uuid, title text, body_text text, cover_image_url text)
language plpgsql security definer set search_path = '' as $$
declare v_row record; v_claimed uuid; v_count integer := 0;
begin
  if p_kind not in ('inline_image', 'real_cover_upgrade') or p_limit not between 1 and 5 then
    raise exception 'Invalid photo work request';
  end if;
  for v_row in
    select a.id, a.title, b.body_text, coalesce(b.image_url, i.image_url, f.image_url) as cover_url
    from public.news_articles a
    join public.news_article_bodies b on b.article_id = a.id
    left join public.news_article_images i on i.article_id = a.id
    left join public.news_auto_illustrations f on f.article_id = a.id
    left join public.news_inline_images x on x.article_id = a.id and x.position = 1
    left join public.news_enrichment_attempts t on t.article_id = a.id and t.kind = p_kind
    where a.publication_status = 'published' and not a.sensitive
      and length(b.body_text) >= 1500
      and (t.article_id is null or t.retry_after <= now())
      and ((p_kind = 'inline_image' and coalesce(b.image_url, i.image_url, f.image_url) is not null and x.article_id is null)
        or (p_kind = 'real_cover_upgrade' and b.image_url is null and i.image_url is null
          and f.image_source_url = 'https://pollinations.ai/'))
    -- Keep recent stories first, alternating new work and due retries each hour.
    order by case when a.published_at >= now() - interval '7 days' then 0 else 1 end,
      case when mod(extract(hour from now())::integer, 2) = 0
        then (t.article_id is null)::integer else (t.article_id is not null)::integer end,
      a.published_at desc limit 200
  loop
    v_claimed := null;
    insert into public.news_enrichment_attempts(article_id, kind, photo_attempt_count, photo_cycle_started_at)
    values (v_row.id, p_kind, 1, now())
    on conflict on constraint news_enrichment_attempts_pkey do update
      set attempted_at = now(), retry_after = now() + interval '1 day', status = 'running', error_message = null,
          photo_attempt_count = case
            when public.news_enrichment_attempts.photo_cycle_started_at is null
              or public.news_enrichment_attempts.photo_cycle_started_at <= now() - interval '7 days' then 1
            else least(public.news_enrichment_attempts.photo_attempt_count + 1, 4) end,
          photo_cycle_started_at = case
            when public.news_enrichment_attempts.photo_cycle_started_at is null
              or public.news_enrichment_attempts.photo_cycle_started_at <= now() - interval '7 days' then now()
            else public.news_enrichment_attempts.photo_cycle_started_at end,
          photo_search_queries = case
            when public.news_enrichment_attempts.photo_cycle_started_at is null
              or public.news_enrichment_attempts.photo_cycle_started_at <= now() - interval '7 days' then '{}'
            else public.news_enrichment_attempts.photo_search_queries end,
          photo_rejected_urls = case
            when public.news_enrichment_attempts.photo_cycle_started_at is null
              or public.news_enrichment_attempts.photo_cycle_started_at <= now() - interval '7 days' then '{}'
            else public.news_enrichment_attempts.photo_rejected_urls end
      where public.news_enrichment_attempts.retry_after <= now()
    returning public.news_enrichment_attempts.article_id into v_claimed;
    if v_claimed is not null then
      article_id := v_row.id; title := v_row.title; body_text := v_row.body_text;
      cover_image_url := v_row.cover_url; return next;
      v_count := v_count + 1;
      if v_count >= p_limit then exit; end if;
    end if;
  end loop;
end;
$$;
