-- Restore passages with learner attempts first, then current news. The
-- remaining archived quizzes come before old articles that never had a set.
-- Image claims retain their original newest-first order.
create or replace function public.news_claim_enrichment(p_kind text, p_limit integer)
returns table(article_id uuid, title text, body_text text)
language plpgsql security definer set search_path = '' as $$
declare v_row record; v_claimed uuid; v_count integer := 0;
begin
  if p_kind not in ('quiz','image') or p_limit not between 1 and 8 then raise exception 'Invalid enrichment request'; end if;
  for v_row in
    select a.id, a.title, b.body_text from public.news_articles a
    left join public.news_article_bodies b on b.article_id = a.id
    left join public.news_article_images i on i.article_id = a.id
    left join public.news_auto_illustrations f on f.article_id = a.id
    left join public.news_auto_quiz_sets q on q.article_id = a.id
    left join public.news_auto_quiz_archives old_q on old_q.article_id = a.id
    left join public.news_enrichment_attempts t on t.article_id = a.id and t.kind = p_kind
    where a.publication_status = 'published' and not a.sensitive
      and (t.article_id is null or t.retry_after <= now())
      and ((p_kind = 'image' and b.article_id is not null and b.image_url is null and i.article_id is null and f.article_id is null)
        or (p_kind = 'quiz' and b.article_id is not null
          and array_length(regexp_split_to_array(trim(b.body_text), '[[:space:]]+'), 1) >= 400
          and q.article_id is null))
    order by case when p_kind = 'quiz' then
      case when old_q.article_id is not null and exists (
        select 1 from public.news_auto_attempts x where x.article_id = a.id
      ) then 0
      when a.published_at > now() - interval '7 days' then 1
      when old_q.article_id is not null then 2
      else 3 end
      else 0 end,
      a.published_at desc, a.fetched_at desc, a.id desc limit 100
  loop
    v_claimed := null;
    insert into public.news_enrichment_attempts(article_id, kind) values (v_row.id, p_kind)
    on conflict on constraint news_enrichment_attempts_pkey do update
      set attempted_at = now(), retry_after = now() + interval '1 day', status = 'running', error_message = null
      where public.news_enrichment_attempts.retry_after <= now()
    returning public.news_enrichment_attempts.article_id into v_claimed;
    if v_claimed is not null then
      article_id := v_row.id; title := v_row.title; body_text := v_row.body_text; return next;
      v_count := v_count + 1;
      if v_count >= p_limit then exit; end if;
    end if;
  end loop;
end;
$$;
