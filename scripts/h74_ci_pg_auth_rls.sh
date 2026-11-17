#!/usr/bin/env bash
# H74/M01: isolated PostgreSQL 16 auth-context/RLS/RPC security contract.
# This is NOT a JWT validation, live Supabase, or teacher/data review.
set -euo pipefail
EXPECTED='postgresql://h74_ci_runner:h74_ci_password_only@127.0.0.1:5432/h74_ci'
if [[ "${H74_ALLOW_EPHEMERAL_DDL:-}" != "YES_ISOLATED_PG16_CI_ONLY" ]] || [[ "${H74_PG_DSN:-}" != "$EXPECTED" ]]; then
  echo 'H74 NOT_TESTED: isolated disposable PostgreSQL 16 CI and exact opt-in required' >&2
  exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db(){ psql "$EXPECTED" -X -qAt -v ON_ERROR_STOP=1 "$@"; }
fail(){ echo "H74 CI CONTRACT FAILED: $1" >&2; exit 1; }
equal(){ [[ "$1" == "$2" ]] || fail "$3: observed=$1 expected=$2"; }
deny(){ if "$@" >/dev/null 2>&1; then fail "unexpected database permission or RPC success"; fi; }

# The fixture is a copy of the project's H58/H68 security blueprint, never the
# real Supabase schema or a replacement migration.
db -f "$root/scripts/h69_ci_bootstrap.sql" >/dev/null
db -f "$root/sql/001_h70_least_privilege_staging_review.sql" >/dev/null

equal "$(db -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='r19_h58' AND c.relkind IN ('r','p') AND c.relrowsecurity AND c.relforcerowsecurity")" '8' "H58 FORCE RLS"
echo 'PASS 1/10 all eight private H58 tables FORCE ROW LEVEL SECURITY'

equal "$(db -c "SELECT count(*) FROM pg_policies WHERE schemaname IN ('r19_h58','r19_h68') AND policyname LIKE 'h70_%'")" '13' "H70 policies"
echo 'PASS 2/10 13 executor-scoped RLS policies exist'

for role in anon authenticated service_role; do
  equal "$(db -c "SELECT has_table_privilege('$role','r19_h58.probes','SELECT')::text")" 'false' "$role cannot read source"
  equal "$(db -c "SELECT has_table_privilege('$role','r19_h58.reviews','SELECT')::text")" 'false' "$role cannot read review"
  deny db -c "SET ROLE $role;" -c "SELECT answer_en FROM r19_h58.probes LIMIT 1"
done
echo 'PASS 3/10 anon/authenticated/service_role denied private direct reads'

equal "$(db -c "SELECT rolcanlogin::text||','||rolbypassrls::text||','||rolsuper::text FROM pg_roles WHERE rolname='r19_h70_executor'")" 'false,false,false' "definer role attributes"
echo 'PASS 4/10 SECURITY DEFINER role cannot login, bypass RLS or superuse'

fn='public.h68_submit_review(text,text,text,text,text,text,text,text)'
equal "$(db -c "SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='$fn'::regprocedure")" 'r19_h70_executor' "RPC definer owner"
equal "$(db -c "SELECT prosecdef::text FROM pg_proc WHERE oid='$fn'::regprocedure")" 'true' "SECURITY DEFINER"
equal "$(db -c "SELECT 'search_path=pg_catalog'=ANY(proconfig) FROM pg_proc WHERE oid='$fn'::regprocedure")" 't' "pinned search_path"
echo 'PASS 5/10 dedicated owner, SECURITY DEFINER, fixed pg_catalog search_path'

equal "$(db -c "SELECT has_function_privilege('authenticated','$fn','EXECUTE')::text")" 'true' "authenticated RPC execute"
equal "$(db -c "SELECT has_function_privilege('anon','$fn','EXECUTE')::text")" 'false' "anon RPC execute"
equal "$(db -c "SELECT has_function_privilege('anon','public.h68_rate_limit_review()','EXECUTE')::text")" 'false' "legacy anon quota"
equal "$(db -c "SELECT has_function_privilege('authenticated','public.h68_rate_limit_review()','EXECUTE')::text")" 'false' "legacy auth quota"
echo 'PASS 6/10 only authenticated can execute hardened review RPC; legacy RPC blocked'

A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'
OUT='55555555-5555-4555-8555-555555555555'
FP="$(printf 'b%.0s' {1..64})"
invoke(){
  local actor="$1" probe="$2"
  db -c 'SET ROLE authenticated' -c "SET request.jwt.claim.sub='$actor'" \
    -c "SELECT public.h68_submit_review('$probe','$FP','PRESERVES_MEANING','ACCEPTABLE','the teacher','The source and answer describe the same event.','','h74_isolated_test_key_0001')"
}
deny invoke "$A" 'h69-dev-1'
equal "$(db -c "SELECT review_writes_enabled::text FROM r19_h68.release_controls WHERE singleton=1")" 'false' 'default kill switch'
echo 'PASS 7/10 valid authenticated DB claim cannot write while gate disabled'

# Only on disposable CI: exercise denied principals, then disable gate.
db -c 'UPDATE r19_h68.release_controls SET review_writes_enabled=true WHERE singleton=1' >/dev/null
deny invoke "$OUT" 'h69-dev-1'
deny invoke "$B" 'h69-holdout-2'
equal "$(db -c "SELECT count(*) FROM r19_h58.reviews")" '0' 'unauthorized requests left no reviews'
equal "$(db -c "SELECT count(*) FROM r19_h58.audit")" '0' 'unauthorized requests left no audit records'
echo 'PASS 8/10 outsider and unassigned actor denied without writes'

# An empty auth.uid from a claimed authenticated DB role must be rejected.
deny db -c 'SET ROLE authenticated' -c "SET request.jwt.claim.sub=''" \
  -c "SELECT public.h68_submit_review('h69-dev-1','$FP','PRESERVES_MEANING','ACCEPTABLE','the teacher','The source and answer describe the same event.','','h74_empty_actor_key_0001')"
echo 'PASS 9/10 missing auth.uid refused'

db -c 'UPDATE r19_h68.release_controls SET review_writes_enabled=false WHERE singleton=1' >/dev/null
equal "$(db -c "SELECT count(*) FROM r19_h58.reviews")" '0' 'no private review changes'
equal "$(db -c "SELECT count(*) FROM r19_h58.audit")" '0' 'no private audit changes'
equal "$(db -c "SELECT review_writes_enabled::text FROM r19_h68.release_controls WHERE singleton=1")" 'false' 'kill switch reset'
echo 'PASS 10/10 zero private writes; CI kill switch disabled again'
echo 'H74 ISOLATED PG16 10/10 PASS; JWT SIGNATURES NOT VERIFIED; SUPABASE STAGING 0/18; RELEASE NO_GO'
