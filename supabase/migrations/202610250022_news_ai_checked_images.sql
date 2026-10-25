-- Illustrations are now chosen by Gemini looking at the candidate photos, using the
-- visual subject the quiz request names for the article. Keyword-only picks were often
-- unrelated to the story, so they are removed and searched again.

alter table public.news_auto_quiz_sets add column image_query text check (image_query is null or length(image_query) <= 120);

-- Openverse adds Creative Commons and public-domain photos hosted on Flickr.
-- coalesce() matters: a NULL licence URL made the earlier check evaluate to NULL, which
-- a CHECK constraint accepts.
alter table public.news_auto_illustrations drop constraint news_auto_illustrations_library_check;
alter table public.news_auto_illustrations add constraint news_auto_illustrations_library_check check (coalesce(
  (
    image_url ~ '^https://(upload|thumb)\.wikimedia\.org/' and image_source_url ~ '^https://commons\.wikimedia\.org/wiki/File:'
    or image_url ~ '^https://live\.staticflickr\.com/' and image_source_url ~ '^https://www\.flickr\.com/photos/'
  ) and (
    (license_name in ('Public domain', 'CC0') and license_url is null)
    or (license_name ~ '^CC BY(-SA)? [234]\.[0-9]( .*)?$'
      and coalesce(license_url, '') ~ '^https://creativecommons\.org/licenses/by(-sa)?/[234]\.[0-9]/')
  )
  or image_url ~ '^https://images-assets\.nasa\.gov/image/'
    and image_source_url ~ '^https://images\.nasa\.gov/details/'
    and license_name = 'NASA media guidelines'
    and coalesce(license_url, '') = 'https://www.nasa.gov/nasa-brand-center/images-and-media/'
    and image_credit ~* '\mNASA\M',
  false));

-- An article is illustrated once its quiz has named the visual subject, or when it is
-- too short for a quiz.
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
    left join public.news_enrichment_attempts t on t.article_id = a.id and t.kind = p_kind
    where a.publication_status = 'published' and not a.sensitive
      and (t.article_id is null or t.retry_after <= now())
      and ((p_kind = 'image' and b.image_url is null and i.article_id is null and f.article_id is null
            and (q.article_id is not null or b.article_id is null or length(b.body_text) < 2000))
        or (p_kind = 'quiz' and b.article_id is not null and length(b.body_text) >= 2000 and q.article_id is null))
    order by a.published_at desc limit 100
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

delete from public.news_auto_illustrations;
delete from public.news_enrichment_attempts where kind = 'image';
