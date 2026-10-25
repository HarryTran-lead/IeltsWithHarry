-- Full text from every NASA-authored feed item (not only /news-release/ links),
-- page text for NOAA Ocean Service, and NASA Image Library illustrations.

-- science.nasa.gov articles may carry their own credited NASA lead image.
alter table public.news_article_bodies drop constraint news_article_image_complete;
alter table public.news_article_bodies add constraint news_article_image_complete check (
  image_url is null and image_alt is null and image_credit is null and image_rights_basis is null
  or image_url is not null and length(trim(coalesce(image_alt, ''))) >= 5
    and length(trim(coalesce(image_credit, ''))) >= 3
    and length(trim(coalesce(image_rights_basis, ''))) >= 30
    and (
      source_url ~ '^https://www\.noaa\.gov/' and image_url ~ '^https://www\.noaa\.gov/sites/default/files/' and image_credit ~* '\mNOAA\M'
      or source_url ~ '^https://(www|science)\.nasa\.gov/' and (
        image_url ~ '^https://www\.nasa\.gov/wp-content/uploads/'
        or image_url ~ '^https://assets\.science\.nasa\.gov/dynamicimage/assets/'
      ) and image_credit ~* '\mNASA\M'
    )
);

-- Illustrations: Wikimedia Commons (as before) or the NASA Image and Video Library.
alter table public.news_auto_illustrations drop constraint news_auto_illustrations_image_url_check;
alter table public.news_auto_illustrations drop constraint news_auto_illustrations_image_source_url_check;
alter table public.news_auto_illustrations drop constraint news_auto_illustrations_license_check;
alter table public.news_auto_illustrations add constraint news_auto_illustrations_library_check check (
  image_url ~ '^https://(upload|thumb)\.wikimedia\.org/'
    and image_source_url ~ '^https://commons\.wikimedia\.org/wiki/File:'
    and (
      (license_name in ('Public domain', 'CC0') and license_url is null)
      or (license_name ~ '^CC BY(-SA)? [234]\.[0-9]( .*)?$'
        and license_url ~ '^https://creativecommons\.org/licenses/by(-sa)?/[234]\.[0-9]/')
    )
  or image_url ~ '^https://images-assets\.nasa\.gov/image/'
    and image_source_url ~ '^https://images\.nasa\.gov/details/'
    and license_name = 'NASA media guidelines'
    and license_url = 'https://www.nasa.gov/nasa-brand-center/images-and-media/'
    and image_credit ~* '\mNASA\M'
);

-- 'body' tracks article pages fetched for teaser-only feeds.
alter table public.news_enrichment_attempts drop constraint news_enrichment_attempts_kind_check;
alter table public.news_enrichment_attempts add constraint news_enrichment_attempts_kind_check
  check (kind in ('quiz', 'image', 'body'));

create function public.news_claim_body_fetch(p_source_id uuid, p_limit integer)
returns table(article_id uuid, canonical_url text)
language plpgsql security definer set search_path = '' as $$
declare v_row record; v_claimed uuid; v_count integer := 0;
begin
  if p_limit not between 1 and 10 then raise exception 'Invalid body request'; end if;
  for v_row in
    select a.id, a.canonical_url from public.news_articles a
    left join public.news_article_bodies b on b.article_id = a.id
    left join public.news_enrichment_attempts t on t.article_id = a.id and t.kind = 'body'
    where a.source_id = p_source_id and a.publication_status = 'published' and not a.sensitive
      and b.article_id is null and (t.article_id is null or t.retry_after <= now())
    order by a.published_at desc limit 50
  loop
    v_claimed := null;
    insert into public.news_enrichment_attempts(article_id, kind, retry_after) values (v_row.id, 'body', now() + interval '7 days')
    on conflict on constraint news_enrichment_attempts_pkey do update
      set attempted_at = now(), retry_after = now() + interval '7 days', status = 'running', error_message = null
      where public.news_enrichment_attempts.retry_after <= now()
    returning public.news_enrichment_attempts.article_id into v_claimed;
    if v_claimed is not null then
      article_id := v_row.id; canonical_url := v_row.canonical_url; return next;
      v_count := v_count + 1;
      if v_count >= p_limit then exit; end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.news_claim_body_fetch(uuid,integer) from public;
grant execute on function public.news_claim_body_fetch(uuid,integer) to service_role;

-- Re-read NASA feeds once without cache validators so current items get their text,
-- and give articles that found no illustration a new search with the wider sources.
update public.news_sources set etag = null, last_modified = null
where feed_url in ('https://www.nasa.gov/news-release/feed/', 'https://www.nasa.gov/technology/feed/',
  'https://www.nasa.gov/aeronautics/feed/', 'https://www.nasa.gov/missions/station/feed/');
update public.news_enrichment_attempts set retry_after = now() where kind = 'image' and status = 'none';
