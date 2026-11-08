-- Re-enable four RSS feeds as topic discovery only. Legacy articles stay hidden.
-- The application uses only feed titles as search leads and publishes no press body.
create or replace function public.news_block_press_rewrites() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.provider = 'ai_rewrite' and (
    new.auto_publish
    or new.feed_url is null
    or new.feed_url not in (
      'https://e.vnexpress.net/rss/news.rss',
      'https://e.vnexpress.net/rss/life.rss',
      'https://e.vnexpress.net/rss/business.rss',
      'https://news.tuoitre.vn/rss'
    )
  ) then
    raise exception 'Press discovery feeds cannot publish or use an unreviewed feed';
  end if;
  return new;
end;
$$;

update public.news_sources
set enabled = true, auto_publish = false,
    policy_status = 'METADATA_ONLY',
    reviewed_basis = 'RSS title is used only to discover a current event. Independent facts are sought and checked on official/open pages before any original English draft. No publisher body, summary, image, headline or article structure is reused.'
where provider = 'ai_rewrite'
  and feed_url in (
    'https://e.vnexpress.net/rss/news.rss',
    'https://e.vnexpress.net/rss/life.rss',
    'https://e.vnexpress.net/rss/business.rss',
    'https://news.tuoitre.vn/rss'
  );

update public.news_admin_settings set daily_rewrite_limit = 4 where id = true;

-- A generated original article carries its independently checked factual dossier.
-- Only the server may create one; an admin must review it before publication.
create table public.news_fact_dossiers (
  article_id uuid primary key references public.news_articles(id) on delete cascade,
  dossier jsonb not null check (jsonb_typeof(dossier->'facts') = 'array' and jsonb_array_length(dossier->'facts') between 8 and 24),
  verification_model text not null check (length(verification_model) >= 3),
  verified_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);
alter table public.news_fact_dossiers enable row level security;
revoke all on public.news_fact_dossiers from anon, authenticated;
grant select, update(reviewed_by, reviewed_at) on public.news_fact_dossiers to authenticated;
grant select, insert, update, delete on public.news_fact_dossiers to service_role;
create policy news_fact_dossiers_admin_read on public.news_fact_dossiers
  for select to authenticated using (public.is_admin());
create policy news_fact_dossiers_admin_review on public.news_fact_dossiers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.content_has_publish_rights(p_kind text, p_id uuid, p_asset text, p_url text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.content_rights_evidence e
    where e.content_kind = p_kind and e.content_id = p_id and e.asset_kind = p_asset
      and (p_url is null or e.asset_url = p_url)
      and e.web_publication_allowed and e.commercial_use_allowed
      and e.modification_translation_allowed
      and (
        e.permission_document_ref ~ '^https://[^[:space:]]+$'
        or (e.permission_document_ref like 'rights-evidence/%' and exists (
          select 1 from storage.objects o where o.bucket_id = 'rights-evidence'
            and o.name = substring(e.permission_document_ref from length('rights-evidence/') + 1)
        ))
      )
  ) or (p_kind = 'news_article' and p_asset = 'text' and exists (
    select 1 from public.news_fact_dossiers d
    join public.news_article_bodies b on b.article_id = d.article_id
    where d.article_id = p_id and d.reviewed_by is not null and d.reviewed_at is not null
      and b.ai_generated and b.body_text is not null
  ));
$$;

create or replace function public.content_require_publish_rights() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_live boolean; v_image_url text;
begin
  v_kind := case TG_TABLE_NAME
    when 'courses' then 'course'
    when 'lessons' then 'lesson'
    when 'news_learning_articles' then 'news_learning'
    when 'news_articles' then 'news_article'
    when 'ielts_exams' then 'ielts_exam'
  end;
  if TG_TABLE_NAME = 'news_articles' then
    if new.provider <> 'manual' then return new; end if;
    v_live := new.publication_status = 'published';
  elsif TG_TABLE_NAME = 'ielts_exams' then
    v_live := new.published_version_id is not null;
  else
    v_live := new.published;
  end if;
  if v_live and not public.content_has_publish_rights(v_kind, new.id, 'text') then
    raise exception 'Reviewed text rights evidence or fact dossier is required before publication';
  end if;
  if v_live and TG_TABLE_NAME = 'news_articles' then
    select b.image_url into v_image_url from public.news_article_bodies b where b.article_id = new.id;
    if v_image_url is not null and not public.content_has_publish_rights(v_kind, new.id, 'image', v_image_url) then
      raise exception 'Reviewed image rights evidence is required before publication';
    end if;
  end if;
  if v_live and TG_TABLE_NAME = 'news_learning_articles' then
    if new.audio_url is not null and not public.content_has_publish_rights(v_kind, new.id, 'audio', new.audio_url) then
      raise exception 'Reviewed audio rights evidence is required before publication';
    end if;
  end if;
  if v_live and TG_TABLE_NAME = 'lessons' then
    if exists (select 1 from public.lesson_blocks b where b.lesson_id = new.id and b.kind = 'audio')
      and not public.content_has_publish_rights(v_kind, new.id, 'audio') then
      raise exception 'Reviewed lesson audio rights evidence is required before publication';
    end if;
  end if;
  return new;
end;
$$;

create function public.news_fact_dossier_body_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_article_id uuid; v_live boolean;
begin
  v_article_id := old.article_id;
  if not exists (select 1 from public.news_fact_dossiers where article_id = v_article_id) then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;
  if TG_OP = 'UPDATE' and new.body_text is not distinct from old.body_text
    and new.source_url is not distinct from old.source_url then return new; end if;
  select publication_status = 'published' into v_live from public.news_articles where id = v_article_id;
  if v_live then raise exception 'Unpublish and re-review the fact dossier before changing the original article'; end if;
  update public.news_fact_dossiers set reviewed_by = null, reviewed_at = null where article_id = v_article_id;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;
create trigger news_fact_dossier_body_guard before update or delete on public.news_article_bodies
for each row execute function public.news_fact_dossier_body_guard();

-- Primary-source search and verification can require several bounded model calls.
select cron.schedule('ieltswithharry-news-enrich-10m', '5,15,25,35,45,55 * * * *', $cron$
  select net.http_post(
    url := replace((select decrypted_secret from vault.decrypted_secrets where name='news_sync_url'), '/api/news/sync', '/api/news/enrich'),
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='news_sync_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 180000
  );
$cron$);
