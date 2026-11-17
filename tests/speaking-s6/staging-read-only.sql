-- Execute only on disposable staging after L17 migration. READ ONLY.
select 'qa_gates' as check_type, stage,s5_qa_verified,teacher_qa_verified,audio_qa_verified,privacy_qa_verified,import_qa_verified
 from public.speaking_s6_release_gates;
select 'revisions' as check_type,status,count(*) as row_count
 from public.speaking_s6_lesson_revisions group by status;
select 'private_banks' as check_type,count(*) as row_count
 from public.speaking_s6_private_revisions;
select 'rls_policy' as check_type,polname,pg_get_expr(polqual,polrelid) as predicate
 from pg_policy where polrelid='public.speaking_s6_lesson_revisions'::regclass;
select 'anon_private_read' as check_type,has_table_privilege('anon','public.speaking_s6_private_revisions','SELECT') as allowed;
select 'authenticated_private_read' as check_type,has_table_privilege('authenticated','public.speaking_s6_private_revisions','SELECT') as allowed;
