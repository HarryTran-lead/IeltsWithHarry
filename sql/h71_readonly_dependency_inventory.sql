-- H71: read-only DBA dependency inventory. Does not discover dynamic app/PLpgSQL code dependencies.
SELECT 'H71_DB_INVENTORY' AS marker,current_database() AS database_name,
       current_user AS inspector_role,current_setting('server_version_num') AS pg_version_num;

SELECT 'private_tables' AS scope,n.nspname AS schema_name,c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS force_rls,
       pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('r19_h58','r19_h68') AND c.relkind IN ('r','p')
ORDER BY 2,3;

SELECT 'roles_private_access' AS scope,r.rolname,r.rolcanlogin,r.rolbypassrls,r.rolsuper,
 CASE WHEN to_regclass('r19_h58.probes') IS NOT NULL
 THEN has_table_privilege(r.rolname,'r19_h58.probes','SELECT') ELSE NULL END AS can_read_probes
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','r19_h70_executor')
ORDER BY r.rolname;

SELECT 'policy_catalog' AS scope,schemaname,tablename,policyname,permissive,roles,cmd
FROM pg_policies WHERE schemaname IN ('r19_h58','r19_h68') ORDER BY 2,3,4;

SELECT 'rpc_ownership' AS scope,n.nspname,p.proname,
       pg_get_userbyid(p.proowner) AS function_owner,p.prosecdef,
       pg_get_function_identity_arguments(p.oid) AS function_args,
       array_to_string(p.proconfig,',') AS function_settings
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('h68_submit_review','h68_rate_limit_review')
ORDER BY 2,3;

SELECT 'db_dependency_edges' AS scope,n.nspname,p.proname,d.deptype,
       count(*) AS dependency_edges
FROM pg_depend d JOIN pg_proc p ON p.oid=d.objid
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE d.classid='pg_proc'::regclass
AND p.proname IN ('h68_submit_review','h68_rate_limit_review')
GROUP BY 2,3,4 ORDER BY 2,3,4;

SELECT 'kill_switch_table' AS scope,
       CASE WHEN to_regclass('r19_h68.release_controls') IS NULL
       THEN 'ABSENT' ELSE 'PRESENT_READ_SEPARATELY' END AS status;
