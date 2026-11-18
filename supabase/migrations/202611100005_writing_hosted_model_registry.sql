-- Hosted inference has a provider-managed model artifact, not a downloadable local checksum.
alter table public.writing_model_registry
  add column provider text not null default 'local' check (provider in ('local', 'cloudflare')),
  add column provider_model_ref text;

alter table public.writing_model_registry alter column artifact_sha256 drop not null;

alter table public.writing_model_registry
  add constraint writing_model_registry_artifact_origin check (
    (provider = 'local' and artifact_sha256 is not null and provider_model_ref is null)
    or
    (provider = 'cloudflare' and artifact_sha256 is null and provider_model_ref is not null and length(provider_model_ref) > 0)
  );
