-- Keep licensed photographs inside the passage separate from its cover.
create table public.news_inline_images (
  article_id uuid not null references public.news_articles(id) on delete cascade,
  position smallint not null check (position in (1, 2)),
  image_url text not null,
  image_alt text not null check (length(image_alt) between 5 and 300),
  image_credit text not null check (length(image_credit) between 3 and 200),
  image_source_url text not null,
  license_name text not null,
  license_url text,
  created_at timestamptz not null default now(),
  primary key (article_id, position),
  constraint news_inline_images_licensed_photo check (coalesce(
    (
      (image_url ~ '^https://(upload|thumb)\.wikimedia\.org/' and image_source_url ~ '^https://commons\.wikimedia\.org/wiki/File:'
        or image_url ~ '^https://live\.staticflickr\.com/' and image_source_url ~ '^https://www\.flickr\.com/photos/')
      and ((license_name in ('Public domain', 'CC0') and license_url is null)
        or (license_name ~ '^CC BY(-SA)? [234]\.[0-9]( .*)?$'
          and license_url ~ '^https://creativecommons\.org/licenses/by(-sa)?/[234]\.[0-9]/'))
    )
    or (image_url ~ '^https://images-assets\.nasa\.gov/image/'
      and image_source_url ~ '^https://images\.nasa\.gov/details/'
      and license_name = 'NASA media guidelines'
      and license_url = 'https://www.nasa.gov/nasa-brand-center/images-and-media/'
      and image_credit ~* '\mNASA\M'), false))
);
alter table public.news_inline_images enable row level security;
create policy news_inline_images_read on public.news_inline_images for select to authenticated using (
  exists (select 1 from public.news_articles a where a.id = article_id and a.publication_status = 'published' and not a.sensitive)
);
revoke all on public.news_inline_images from public, anon, authenticated;
grant select on public.news_inline_images to authenticated;
grant select, insert, update on public.news_inline_images to service_role;

-- One small row per reader and article, so they can resume on any device.
create table public.user_news_reading_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  paragraph_index smallint not null check (paragraph_index between 0 and 29),
  paragraph_count smallint not null check (paragraph_count between 1 and 30),
  updated_at timestamptz not null default now(),
  primary key (user_id, article_id)
);
alter table public.user_news_reading_progress enable row level security;
create policy news_reading_progress_self on public.user_news_reading_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.user_news_reading_progress from public, anon, authenticated;
grant select, insert, update on public.user_news_reading_progress to authenticated;

alter table public.news_enrichment_attempts drop constraint news_enrichment_attempts_kind_check;
alter table public.news_enrichment_attempts add constraint news_enrichment_attempts_kind_check
  check (kind in ('quiz', 'image', 'body', 'inline_image', 'real_cover_upgrade'));

create function public.news_claim_photo_work(p_kind text, p_limit integer)
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
    order by case when p_kind = 'real_cover_upgrade' then a.published_at end asc,
      a.published_at desc limit 200
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
revoke all on function public.news_claim_photo_work(text, integer) from public, anon, authenticated;
grant execute on function public.news_claim_photo_work(text, integer) to service_role;
