-- Backfill the stories learners see now before working through the old archive.
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
    order by a.published_at desc limit 200
  loop
    v_claimed := null;
    insert into public.news_enrichment_attempts(article_id, kind) values (v_row.id, p_kind)
    on conflict on constraint news_enrichment_attempts_pkey do update
      set attempted_at = now(), retry_after = now() + interval '1 day', status = 'running', error_message = null
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
