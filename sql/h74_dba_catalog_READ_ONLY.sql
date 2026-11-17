-- H74/M03: DBA read-only catalog preflight for an EXPLICITLY APPROVED staging project.
-- NO DDL/DML/GRANT/REVOKE; no Supabase data rows, JWTs, essay texts, or credentials.
-- A catalog inventory cannot prove auth session integrity, runtime RLS, or actual deployment safety.
\set ON_ERROR_STOP on

SELECT 'H74_PROJECT_CONTEXT' AS marker,
       current_database() AS database_name,
       current_user AS inspector_role,
       current_setting('server_version') AS server_version,
       now() AS observed_at;

WITH targets(schema_name,table_name) AS (
 VALUES
  ('public','ielts_attempts'),
  ('public','writing_grading_jobs'),
  ('public','writing_grading_results'),
  ('public','writing_deep_reports'),
  ('public','speaking_coaching_jobs'),
  ('public','speaking_mock_sessions'),
  ('public','profiles'),
  ('r19_h58','probes'),
  ('r19_h58','reviews'),
  ('r19_h68','release_controls')
)
SELECT 'H74_TABLE_RLS_AND_OWNER' AS marker,
       targets.schema_name, targets.table_name,
       CASE WHEN cls.oid IS NULL THEN 'MISSING'
            ELSE 'PRESENT' END AS table_state,
       cls.relrowsecurity AS rls_enabled,
       cls.relforcerowsecurity AS force_rls,
       pg_get_userbyid(cls.relowner) AS owner_role,
       cls.relkind AS object_kind
FROM targets
LEFT JOIN pg_namespace ns ON ns.nspname=targets.schema_name
LEFT JOIN pg_class cls ON cls.relnamespace=ns.oid AND cls.relname=targets.table_name
ORDER BY 2,3;

WITH targets(schema_name,table_name) AS (
 VALUES
  ('public','ielts_attempts'),
  ('public','writing_grading_jobs'),
  ('public','writing_grading_results'),
  ('public','writing_deep_reports'),
  ('public','speaking_coaching_jobs'),
  ('public','speaking_mock_sessions'),
  ('r19_h58','probes'),
  ('r19_h58','reviews')
)
SELECT 'H74_ACTUAL_TABLE_GRANTS' AS marker,
       targets.schema_name, targets.table_name, roles.rolname,
       CASE WHEN tbl.oid IS NULL THEN NULL ELSE has_schema_privilege(roles.rolname,targets.schema_name,'USAGE') END AS schema_usage,
       CASE WHEN tbl.oid IS NULL THEN NULL ELSE has_table_privilege(roles.rolname,tbl.oid,'SELECT') END AS table_select,
       CASE WHEN tbl.oid IS NULL THEN NULL ELSE has_table_privilege(roles.rolname,tbl.oid,'INSERT') END AS table_insert,
       CASE WHEN tbl.oid IS NULL THEN NULL ELSE has_table_privilege(roles.rolname,tbl.oid,'UPDATE') END AS table_update,
       CASE WHEN tbl.oid IS NULL THEN NULL ELSE has_table_privilege(roles.rolname,tbl.oid,'DELETE') END AS table_delete
FROM targets
CROSS JOIN pg_roles roles
LEFT JOIN pg_namespace ns ON ns.nspname=targets.schema_name
LEFT JOIN pg_class tbl ON tbl.relnamespace=ns.oid AND tbl.relname=targets.table_name
WHERE roles.rolname IN ('anon','authenticated','service_role','r19_h70_executor')
ORDER BY 2,3,4;

SELECT 'H74_RPC_OWNERSHIP_AND_GRANTS' AS marker,
       ns.nspname AS function_schema,
       proc.proname AS function_name,
       pg_get_function_identity_arguments(proc.oid) AS identity_arguments,
       pg_get_userbyid(proc.proowner) AS owner_role,
       proc.prosecdef AS security_definer,
       proc.proacl AS explicit_acl,
       array_to_string(proc.proconfig,',') AS function_settings,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
            THEN has_function_privilege('anon',proc.oid,'EXECUTE') ELSE NULL END AS anon_execute,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
            THEN has_function_privilege('authenticated',proc.oid,'EXECUTE') ELSE NULL END AS authenticated_execute,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')
            THEN has_function_privilege('service_role',proc.oid,'EXECUTE') ELSE NULL END AS service_role_execute
FROM pg_proc proc
JOIN pg_namespace ns ON ns.oid=proc.pronamespace
WHERE proc.proname IN (
  'h68_submit_review','h68_rate_limit_review','is_admin',
  'writing_claim_grading_job','writing_finish_grading_job','writing_claim_deep_report',
  'speaking_claim_coaching_job','speaking_finish_coaching_job'
)
ORDER BY 2,3,4;

SELECT 'H74_ROLE_ATTRIBUTES' AS marker,
       rolname,rolcanlogin,rolbypassrls,rolsuper,rolinherit
FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role','r19_h70_executor')
ORDER BY rolname;

SELECT 'H74_RELEVANT_RLS_POLICIES' AS marker,
       schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies
WHERE (schemaname='public' AND tablename IN (
  'ielts_attempts','writing_grading_jobs','writing_grading_results',
  'writing_deep_reports','speaking_coaching_jobs','speaking_mock_sessions'
)) OR schemaname IN ('r19_h58','r19_h68')
ORDER BY schemaname,tablename,policyname;

SELECT 'H74_CATALOG_ONLY_RELEASE_GATE' AS marker,
       'NO_GO' AS release_gate,
       'DBA_MUST_CORRELATE_WITH_PROJECT_ID_AND_APP_JWT_EVIDENCE' AS limitation;
