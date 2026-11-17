-- H69 DBA read-only inventory. Do not change grants, functions, rows, or RLS.
SELECT n.nspname AS schema_name, c.relname AS object_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('r19_h58','r19_h68') AND c.relkind IN ('r','p')
ORDER BY 1,2;

SELECT r.rolname, r.rolbypassrls, r.rolsuper,
  has_schema_privilege(r.rolname,'r19_h58','USAGE') AS private_schema_usage,
  has_table_privilege(r.rolname,'r19_h58.probes','SELECT') AS source_select_granted
FROM pg_roles r WHERE r.rolname IN ('authenticated','anon','service_role')
ORDER BY r.rolname;

SELECT p.proname,p.prosecdef, pg_get_userbyid(p.proowner) AS owner,
 n.nspname AS schema_name
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('h68_submit_review','h68_rate_limit_review')
ORDER BY p.proname;

SELECT review_writes_enabled AS db_gate_enabled FROM r19_h68.release_controls WHERE singleton=1;
