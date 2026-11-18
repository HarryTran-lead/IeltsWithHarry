-- Verified factual notes and a separate AI factual/originality review may
-- publish a new original lesson without waiting for a manual editorial pass.
-- Existing legacy press rewrites remain hidden by their separate provider guard.
alter table public.news_fact_dossiers
  add column ai_reviewed_at timestamptz,
  add column ai_review_model text,
  add constraint news_fact_dossiers_ai_review_pair check (
    (ai_reviewed_at is null and ai_review_model is null)
    or (ai_reviewed_at is not null and length(ai_review_model) >= 3)
  );

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
    where d.article_id = p_id and b.ai_generated and b.body_text is not null
      and ((d.reviewed_by is not null and d.reviewed_at is not null)
        or (d.ai_reviewed_at is not null and d.ai_review_model is not null))
  ));
$$;

create or replace function public.news_fact_dossier_body_guard() returns trigger
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
  update public.news_fact_dossiers set reviewed_by = null, reviewed_at = null,
    ai_reviewed_at = null, ai_review_model = null where article_id = v_article_id;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;
