-- A pilot allows an explicitly requested practice estimate before independent
-- teacher evaluation. It must never be represented as an approved model.
alter table public.writing_model_registry
  drop constraint writing_model_registry_status_check;
alter table public.writing_model_registry
  add constraint writing_model_registry_status_check
  check (status in ('blocked', 'pilot', 'approved', 'retired'));

insert into public.writing_model_registry
  (model_id, revision, task_type, weights_license, license_decision,
   training_data_rights, artifact_sha256, evaluation_report_ref, status,
   provider, provider_model_ref)
select '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'provider-managed-2026-11-11', task_type,
  'Cloudflare-hosted; model artifact and weights license not supplied to this deployment',
  'unverified', 'unverified', null,
  'synthetic transport smoke passed; teacher-labeled accuracy evaluation pending',
  'pilot', 'cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
from (values ('academic_task1'), ('academic_task2')) as tasks(task_type)
on conflict (model_id, revision, task_type) do nothing;
