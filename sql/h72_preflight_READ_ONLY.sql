-- H72 DBA ONLY: READ-ONLY catalog inventory for *approved* Supabase staging.
-- No DDL/DML or grant changes. Catalog inventory cannot prove an absence of dynamic SQL or external app dependencies.
SELECT 'H72_PROJECT_CONTEXT' AS marker, current_database() AS database_name,
       current_user AS inspecting_role, current_setting('server_version') AS pg_version,
       now() AS inspected_at;

SELECT 'H72_ROLE_ATTRIBUTES' AS marker, rolname, rolcanlogin, rolbypassrls, rolsuper,
       CASE WHEN to_regclass('r19_h58.probes') IS NULL THEN NULL
       ELSE has_table_privilege(rolname,'r19_h58.probes','SELECT') END AS can_read_h58_probes,
       CASE WHEN to_regclass('r19_h58.reviews') IS NULL THEN NULL
       ELSE has_table_privilege(rolname,'r19_h58.reviews','SELECT') END AS can_read_h58_reviews
FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','r19_h70_executor');

SELECT 'H72_PRIVATE_OBJECTS' AS marker,n.nspname AS schema_name,c.relname AS table_name,
       pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls_on,
       c.relforcerowsecurity AS force_rls,
       c.relacl AS grant_acl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('r19_h58','r19_h68') AND c.relkind IN ('r','p','S','v','m')
ORDER BY 2,3;

SELECT 'H72_POLICIES' AS marker,schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname IN ('r19_h58','r19_h68') ORDER BY 2,3,4;

SELECT 'H72_RPC_OWNERSHIP' AS marker,n.nspname,p.proname,
       pg_get_userbyid(p.proowner) AS function_owner,p.prosecdef AS security_definer,
       p.proacl AS privilege_acl,
       pg_get_function_identity_arguments(p.oid) AS signature,
       array_to_string(p.proconfig,',') AS function_config
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('h68_submit_review','h68_rate_limit_review')
ORDER BY 2,3;

SELECT 'H72_CATALOG_VIEW_REFERENCES' AS marker,n.nspname AS schema_name,
       c.relname AS view_name, c.relkind AS kind
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('v','m')
  AND pg_get_viewdef(c.oid,true) ILIKE '%r19_h58%'
ORDER BY 2,3;

SELECT 'H72_CATALOG_FUNCTION_REFERENCES' AS marker,n.nspname AS function_schema,
       p.proname AS function_name,
       pg_get_userbyid(p.proowner) AS function_owner
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind IN ('f','p')
  AND p.prosrc ILIKE '%r19_h58%'
ORDER BY 2,3;

SELECT 'H72_DISABLED_STATE_INVENTORY' AS marker,
 CASE WHEN to_regclass('r19_h68.release_controls') IS NULL
 THEN 'SCHEMA_ABSENT'
 ELSE 'DBA_MUST_CHECK_RELEASE_CONTROLS_VALUE_SEPARATELY' END AS gate_state;
