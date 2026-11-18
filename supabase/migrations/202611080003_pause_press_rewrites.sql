-- Preserve legacy articles for editorial audit while removing public access.
update public.news_sources
set enabled = false, auto_publish = false
where provider = 'ai_rewrite';

update public.news_admin_settings
set daily_rewrite_limit = 0
where id = true;

update public.news_articles
set publication_status = 'hidden'
where provider = 'ai_rewrite' and publication_status = 'published';

-- An admin UI or old worker cannot accidentally reactivate this path.
create function public.news_block_press_rewrites() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.provider = 'ai_rewrite' and (new.enabled or new.auto_publish) then
    raise exception 'Single-publisher AI rewrite sources are disabled';
  end if;
  return new;
end;
$$;

create trigger news_sources_block_press_rewrites
before insert or update on public.news_sources
for each row execute function public.news_block_press_rewrites();

create function public.news_block_press_rewrite_publication() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.provider = 'ai_rewrite' and new.publication_status = 'published' then
    raise exception 'Single-publisher AI rewrite articles require rights review';
  end if;
  return new;
end;
$$;

create trigger news_articles_block_press_rewrite_publication
before insert or update on public.news_articles
for each row execute function public.news_block_press_rewrite_publication();
