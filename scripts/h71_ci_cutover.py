#!/usr/bin/env python3
"""H71: cutover + failure/restore rehearsal on an isolated localhost PostgreSQL CI database only."""
import os
from pathlib import Path
import subprocess
import tempfile
import sys

ROOT = Path(__file__).resolve().parents[1]
DSN = "postgresql://h71_ci_runner:h71_ci_password_only@127.0.0.1:5432/h71_ci"
def query(*args, can_fail=False):
    r = subprocess.run(["psql", DSN, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", *args],
                       capture_output=True, text=True, timeout=90, check=False)
    if r.returncode and not can_fail: raise AssertionError(r.stderr[-1000:])
    return r
def read(sql): return query("-c", sql).stdout.strip()
def require(ok,msg):
    if not ok: raise AssertionError(msg)
def role_exists(): return read("SELECT count(*) FROM pg_roles WHERE rolname='r19_h70_executor'")=="1"
def legacy_granted(): return read("SELECT has_table_privilege('service_role','r19_h58.probes','SELECT')")=="t"
def policy_count(): return int(read("SELECT count(*) FROM pg_policies WHERE schemaname IN ('r19_h58','r19_h68') AND policyname LIKE 'h70_%'"))
def owner(): return read("SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.h68_submit_review(text,text,text,text,text,text,text,text)'::regprocedure")
def gate_off(): return read("SELECT review_writes_enabled FROM r19_h68.release_controls WHERE singleton=1")=="f"

def main():
    if os.getenv("H71_ALLOW_EPHEMERAL_DDL")!="YES_ISOLATED_LOCAL_CI_ONLY" or os.getenv("H71_PG_DSN")!=DSN:
        print("H71 NOT_TESTED: explicit ephemeral CI database approval required"); return 2
    bootstrap=ROOT/"scripts/h69_ci_bootstrap.sql"
    migration=ROOT/"sql/001_h70_least_privilege_staging_review.sql"
    original=ROOT/"sql/001_h68_review_staging_create_only.sql"
    inventory=ROOT/"sql/h71_readonly_dependency_inventory.sql"
    require(all(x.is_file() for x in (bootstrap,migration,original,inventory)), "Missing pinned SQL")
    query("-f",str(bootstrap))
    require(not role_exists() and legacy_granted() and gate_off(),"Incorrect pre-cutover baseline")
    print("PASS 1/8 H69 baseline with H68 write gate disabled")

    read("UPDATE r19_h68.release_controls SET review_writes_enabled=true WHERE singleton=1")
    fail=query("-f",str(migration),can_fail=True)
    require(fail.returncode!=0 and "H70_DB_GATE_MUST_BE_DISABLED" in fail.stderr,"Active-write cutover accepted")
    require(not role_exists() and legacy_granted(),"Active-gate preflight mutated privileges")
    read("UPDATE r19_h68.release_controls SET review_writes_enabled=false WHERE singleton=1")
    print("PASS 2/8 migration refuses cutover while DB write gate is enabled")

    src=migration.read_text()
    require(src.rstrip().endswith("COMMIT;"),"Migration ending changed")
    broken=src.rstrip()[:-len("COMMIT;")]+"""DO $h71$ BEGIN RAISE EXCEPTION 'H71_CI_FORCED_ABORT'; END $h71$;
COMMIT;
"""
    with tempfile.TemporaryDirectory() as tmp:
        path=Path(tmp)/"abort.sql";path.write_text(broken)
        fail=query("-f",str(path),can_fail=True)
    require(fail.returncode!=0 and "H71_CI_FORCED_ABORT" in fail.stderr,"No deliberate DB rollback")
    require(not role_exists() and legacy_granted() and policy_count()==0 and owner()=="h71_ci_runner",
            "SQL changes survived a forced pre-COMMIT failure")
    print("PASS 3/8 failed cutover rolled back role/grant/policy/definer changes")

    query("-f",str(migration))
    require(role_exists() and not legacy_granted() and policy_count()==13,"H70 cutover privileges invalid")
    require(owner()=="r19_h70_executor" and gate_off(),"Definer owner or gate unsafe")
    require(read("SELECT rolcanlogin::text||','||rolbypassrls::text||','||rolsuper::text FROM pg_roles WHERE rolname='r19_h70_executor'")=="false,false,false",
            "Executor has a dangerous role attribute")
    print("PASS 4/8 cutover valid; 13 policies; NOLOGIN/NOBYPASSRLS definer")

    denied=query("-c","SET ROLE service_role; SELECT answer_en FROM r19_h58.probes",can_fail=True)
    require(denied.returncode!=0,"service_role can still read H58 source")
    denied=query("-c","SET ROLE authenticated; SELECT answer_en FROM r19_h58.probes",can_fail=True)
    require(denied.returncode!=0,"authenticated can read private H58 source")
    print("PASS 5/8 service_role and authenticated raw table reads denied")

    # CI-ONLY reset to original H68 fixture. This is NOT a staging rollback script.
    orig=original.read_text()
    start=orig.index("CREATE FUNCTION public.h68_submit_review(")
    end=orig.index("REVOKE ALL ON FUNCTION public.h68_rate_limit_review()",start)
    definition=orig[start:end].replace("CREATE FUNCTION public.h68_submit_review(",
           "CREATE OR REPLACE FUNCTION public.h68_submit_review(",1).strip()
    restore="""BEGIN;
ALTER FUNCTION public.h68_submit_review(text,text,text,text,text,text,text,text) OWNER TO h71_ci_runner;
ALTER FUNCTION public.h68_rate_limit_review() OWNER TO h71_ci_runner;
DROP OWNED BY r19_h70_executor;
DROP ROLE r19_h70_executor;
GRANT USAGE ON SCHEMA r19_h58 TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA r19_h58 TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA r19_h58 TO service_role;
GRANT EXECUTE ON FUNCTION public.h68_rate_limit_review() TO authenticated;
"""+definition+"\nCOMMIT;\n"
    with tempfile.TemporaryDirectory() as tmp:
        path=Path(tmp)/"ci_fixture_reset.sql";path.write_text(restore)
        query("-f",str(path))
    require(not role_exists() and policy_count()==0 and legacy_granted() and gate_off()
            and owner()=="h71_ci_runner","CI reset did not match baseline")
    print("PASS 6/8 isolated CI reset matches the original privilege baseline")

    require(read("SELECT count(*) FROM r19_h58.reviews")=="0"
            and read("SELECT count(*) FROM r19_h58.audit")=="0","Rehearsal wrote review/audit data")
    print("PASS 7/8 no review or audit data altered by cutover/restore rehearsal")

    inventory_text=inventory.read_text().upper()
    require(not any(q in inventory_text for q in ("CREATE ","ALTER ","GRANT ","REVOKE ","DELETE ","TRUNCATE ")),
            "Read-only inventory contains write SQL")
    result=query("-f",str(inventory))
    require("H71_DB_INVENTORY" in result.stdout,"Inventory missing context marker")
    print("PASS 8/8 DBA dependency inventory runs read-only on PostgreSQL 16")
    print("H71 REAL PG16 CUTOVER/ROLLBACK CI 8/8 PASS; 18 LIVE SUPABASE CHECKS NOT_TESTED; NO_GO")
    return 0

if __name__=="__main__":
    try: sys.exit(main())
    except (AssertionError,subprocess.TimeoutExpired) as e:
        print("H71_FAIL:",e,file=sys.stderr);sys.exit(1)
