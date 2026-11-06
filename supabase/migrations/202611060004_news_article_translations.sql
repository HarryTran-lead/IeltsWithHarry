-- Keep one Vietnamese translation per paragraph of the current English body.
-- Existing articles are filled by the scheduled news enrichment worker.
alter table public.news_article_bodies
  add column body_hash text generated always as (md5(body_text)) stored,
  add column translation_vi text[],
  add column translation_vi_draft text[] not null default '{}'::text[],
  add column translation_model text,
  add column translation_updated_at timestamptz,
  add column translation_retry_after timestamptz;

create function public.news_reset_translation_on_body_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.body_text is distinct from old.body_text then
    new.translation_vi := null;
    new.translation_vi_draft := '{}'::text[];
    new.translation_model := null;
    new.translation_updated_at := null;
    new.translation_retry_after := null;
  elsif new.translation_vi is null and cardinality(new.translation_vi_draft) = 0
    and new.translation_model is null and new.translation_updated_at is null
    and new.translation_retry_after is null then
    -- Feed upserts and the manual editor omit translation columns. Keep the
    -- finished or in-progress translation when the English body is unchanged.
    new.translation_vi := old.translation_vi;
    new.translation_vi_draft := old.translation_vi_draft;
    new.translation_model := old.translation_model;
    new.translation_updated_at := old.translation_updated_at;
    new.translation_retry_after := old.translation_retry_after;
  end if;
  return new;
end;
$$;

create trigger news_body_translation_reset
before update on public.news_article_bodies
for each row execute function public.news_reset_translation_on_body_change();

create index news_bodies_pending_translation_idx
on public.news_article_bodies (ingested_at, article_id)
where translation_vi is null;
