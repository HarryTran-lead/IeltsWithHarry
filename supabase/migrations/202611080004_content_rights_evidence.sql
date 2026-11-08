-- One reviewed record per text package or media asset. Keep documents in private storage;
-- permission_document_ref is a permanent storage path or evidence URL, not a public grant.
create table public.content_rights_evidence (
  id uuid primary key default gen_random_uuid(),
  content_kind text not null check (content_kind in ('ielts_exam', 'course', 'lesson', 'news_article', 'news_learning')),
  content_id uuid not null,
  asset_kind text not null check (asset_kind in ('text', 'audio', 'image')),
  asset_url text,
  source_package_name text,
  source_package_sha256 text check (source_package_sha256 is null or source_package_sha256 ~ '^[0-9a-f]{64}$'),
  author_name text not null check (length(trim(author_name)) >= 2),
  rights_holder text not null check (length(trim(rights_holder)) >= 2),
  permission_document_ref text not null check (length(trim(permission_document_ref)) >= 12),
  permission_scope text not null check (length(trim(permission_scope)) >= 20),
  web_publication_allowed boolean not null default false,
  commercial_use_allowed boolean not null default false,
  modification_translation_allowed boolean not null default false,
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (asset_kind = 'text' or asset_url is not null)
);
create index content_rights_evidence_lookup on public.content_rights_evidence(content_kind, content_id, asset_kind);
alter table public.content_rights_evidence enable row level security;
revoke all on public.content_rights_evidence from anon, authenticated;
grant select, insert, update, delete on public.content_rights_evidence to authenticated;
create policy content_rights_evidence_admin on public.content_rights_evidence
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create function public.content_has_publish_rights(p_kind text, p_id uuid, p_asset text, p_url text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.content_rights_evidence e
    where e.content_kind = p_kind and e.content_id = p_id and e.asset_kind = p_asset
      and (p_url is null or e.asset_url = p_url)
      and e.web_publication_allowed and e.commercial_use_allowed
      and e.modification_translation_allowed
  );
$$;
revoke all on function public.content_has_publish_rights(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.content_has_publish_rights(text, uuid, text, text) to service_role;

create function public.content_require_publish_rights() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kind text;
declare v_live boolean;
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
    raise exception 'Reviewed text rights evidence is required before publication';
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

create trigger courses_require_rights before insert or update on public.courses
for each row execute function public.content_require_publish_rights();
create trigger lessons_require_rights before insert or update on public.lessons
for each row execute function public.content_require_publish_rights();
create trigger news_learning_require_rights before insert or update on public.news_learning_articles
for each row execute function public.content_require_publish_rights();
create trigger news_articles_require_rights before insert or update on public.news_articles
for each row execute function public.content_require_publish_rights();
create trigger ielts_exams_require_rights before insert or update on public.ielts_exams
for each row execute function public.content_require_publish_rights();
