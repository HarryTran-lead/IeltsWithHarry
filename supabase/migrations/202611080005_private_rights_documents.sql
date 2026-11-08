-- Evidence documents are private and readable only by admins.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('rights-evidence', 'rights-evidence', false, 5242880,
  array['application/pdf', 'text/plain', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

create policy rights_evidence_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rights-evidence' and public.is_admin());
create policy rights_evidence_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'rights-evidence' and public.is_admin());

alter table public.content_rights_evidence add constraint content_rights_document_ref_check
  check (permission_document_ref ~ '^(rights-evidence/[A-Za-z0-9_./-]+|https://[^[:space:]]+)$');

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
  );
$$;
