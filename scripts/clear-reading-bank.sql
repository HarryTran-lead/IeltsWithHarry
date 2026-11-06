-- Run in the production Supabase SQL editor after applying migration
-- 202611060001_ielts_bank_admin_delete.sql. This is the same operation as
-- "Kho đề Reading" -> "Xóa toàn bộ" in the admin interface.
-- It deletes Reading exams, their revisions, learner attempts and related jobs,
-- and pauses automatic Reading imports. Manual reviewed imports stay available.
begin;
set local request.jwt.claim.role = 'service_role';
select public.ielts_delete_skill_exams('Reading') as reading_exams_deleted;
commit;
select count(*) as reading_exams_remaining
from public.ielts_exams where skill = 'Reading';
