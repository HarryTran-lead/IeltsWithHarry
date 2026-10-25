-- A published manual article can be edited. Drop its old quiz and let the
-- enrichment worker claim the revised text immediately.
create or replace function public.admin_save_manual_news(
  p_id uuid, p_title text, p_url text, p_publisher text, p_category text,
  p_published_at timestamptz, p_sensitive boolean, p_body text, p_rights_basis text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_source_id uuid; v_url text := trim(p_url); v_body text := trim(coalesce(p_body, ''));
begin
  if not public.is_admin() then raise exception 'Admin required'; end if;
  if length(trim(p_title)) not between 5 and 400 or length(trim(p_publisher)) not between 1 and 150
    or v_url !~ '^https://[^/[:space:]@]+(/[^[:space:]]*)?$' or length(v_url) > 2000
    or p_category not in ('Technology','Science','Education','Health','Environment','Business','Culture','World News')
    or p_published_at is null or p_published_at > now() + interval '1 day'
  then raise exception 'Invalid article metadata'; end if;
  if v_body <> '' and (length(v_body) not between 200 and 50000 or length(trim(coalesce(p_rights_basis,''))) < 30)
  then raise exception 'Full text requires 200–50,000 characters and a rights basis of at least 30 characters'; end if;
  select id into v_source_id from public.news_sources where provider = 'manual';
  if v_source_id is null then raise exception 'Manual news source is missing'; end if;
  if p_id is null then
    insert into public.news_articles(source_id, provider, canonical_hash, canonical_url, title, publisher,
      category, published_at, publication_status, sensitive, attribution_text)
    values (v_source_id, 'manual', encode(sha256(convert_to(v_url,'UTF8')),'hex'), v_url,
      trim(p_title), trim(p_publisher), p_category, p_published_at, 'review', coalesce(p_sensitive,false),
      'Source: ' || trim(p_publisher)) returning id into v_id;
  else
    update public.news_articles set canonical_hash = encode(sha256(convert_to(v_url,'UTF8')),'hex'),
      canonical_url = v_url, title = trim(p_title), publisher = trim(p_publisher), category = p_category,
      published_at = p_published_at, sensitive = coalesce(p_sensitive,false),
      attribution_text = 'Source: ' || trim(p_publisher), updated_at = now()
    where id = p_id and provider = 'manual' returning id into v_id;
    if v_id is null then raise exception 'Manual article not found'; end if;
  end if;
  if v_body = '' then
    delete from public.news_article_bodies where article_id = v_id;
  else
    insert into public.news_article_bodies(article_id, body_text, rights_basis, source_url)
    values (v_id, v_body, trim(p_rights_basis), v_url)
    on conflict (article_id) do update set body_text = excluded.body_text,
      rights_basis = excluded.rights_basis, source_url = excluded.source_url, ingested_at = now();
  end if;
  if p_id is not null then
    delete from public.news_auto_quiz_sets where article_id = v_id;
    delete from public.news_enrichment_attempts where article_id = v_id and kind = 'quiz';
  end if;
  return v_id;
end;
$$;
