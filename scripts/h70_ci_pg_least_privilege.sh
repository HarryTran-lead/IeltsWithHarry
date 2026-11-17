#!/usr/bin/env bash
set -euo pipefail
if [[ "$(printenv H70_ALLOW_EPHEMERAL_DDL || true)" != "YES_ISOLATED_CI_ONLY" ]] ||
   [[ "$(printenv H70_PG_DSN || true)" != "postgresql://h70_ci_runner:h70_ci_password_only@127.0.0.1:5432/h70_ci" ]]; then
  echo "NOT_TESTED: refused external database" >&2; exit 2
fi
root="$(cd "$(dirname "$0")/.." && pwd)"
db(){ psql "$H70_PG_DSN" -X -qAt -v ON_ERROR_STOP=1 "$@"; }
A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'
C='33333333-3333-4333-8333-333333333333'
OWNER='44444444-4444-4444-8444-444444444444'
F="$(printf 'b%.0s' {1..64})"
H="$(printf 'd%.0s' {1..64})"
reason='The source and answer preserve exactly the same event roles.'
review(){
  local actor="$1" probe="$2" fp="$3" key="$4"
  db -c 'SET ROLE authenticated;' -c "SET request.jwt.claim.sub='$actor';" \
    -c "SELECT public.h68_submit_review('$probe','$fp','PRESERVES_MEANING','ACCEPTABLE','the teacher','$reason','','$key')::text;"
}
deny(){ if "$@" >/dev/null 2>&1; then echo "UNEXPECTED_SUCCESS $*" >&2; exit 1; fi; }
value(){ db -c "$1"; }
require_eq(){ [[ "$1" == "$2" ]] || { echo "ASSERT_FAILED $3: $1 != $2" >&2; exit 1; }; }
db -f "$root/scripts/h69_ci_bootstrap.sql" >/dev/null
deny review "$A" h69-dev-1 "$F" h70_gate_off_initial_00001
echo 'PASS 1/11 SQL database gate defaults DENY'
db -f "$root/sql/001_h70_least_privilege_staging_review.sql" >/dev/null
require_eq "$(value "SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.h68_submit_review(text,text,text,text,text,text,text,text)'::regprocedure")" r19_h70_executor 'function owner'
require_eq "$(value "SELECT rolcanlogin::text||','||rolbypassrls::text||','||rolsuper::text FROM pg_roles WHERE rolname='r19_h70_executor'")" 'false,false,false' 'role safety'
echo 'PASS 2/11 SECURITY DEFINER uses non-login, non-bypass role'
require_eq "$(value "SELECT has_table_privilege('service_role','r19_h58.probes','SELECT')::text")" false 'service_role read'
deny db -c 'SET ROLE service_role' -c 'SELECT answer_en FROM r19_h58.probes'
deny db -c 'SET ROLE authenticated' -c 'SELECT answer_en FROM r19_h58.probes'
echo 'PASS 3/11 direct service_role and authenticated table reads blocked'
deny db -c 'SET ROLE authenticated' -c "SET request.jwt.claim.sub='$A'" -c 'SELECT public.h68_rate_limit_review()'
echo 'PASS 4/11 deprecated rate-limit RPC no longer callable'
deny review "$A" h69-dev-1 "$F" h70_gate_off_after_00001
db -c 'UPDATE r19_h68.release_controls SET review_writes_enabled=true WHERE singleton=1' >/dev/null
deny review "$OWNER" h69-dev-1 "$F" h70_owner_denied_000001
deny review "$B" h69-unassigned-3 "$(printf 'f%.0s' {1..64})" h70_unassigned_000001
echo 'PASS 5/11 revoked gate, roles and assignment checks'
for row in "A $A" "B $B" "C $C"; do
  label="$(printf '%s' "$row" | cut -d' ' -f1)"
  actor="$(printf '%s' "$row" | cut -d' ' -f2)"
  reply="$(review "$actor" h69-dev-1 "$F" "h70_teacher_20261117_$label")"
  [[ "$reply" == *'"SUBMITTED"'* ]] || { echo "REVIEW_FAILURE $reply" >&2; exit 1; }
done
require_eq "$(value "SELECT count(*) FROM r19_h58.reviews")" 3 'review'
require_eq "$(value "SELECT count(*) FROM r19_h58.audit")" 3 'audit'
require_eq "$(value "SELECT count(DISTINCT reviewer_id) FROM r19_h58.reviews")" 3 'teachers'
echo 'PASS 6/11 three teachers submit through RLS'
db <<'SQL' >/dev/null
CREATE FUNCTION r19_h58.h70_ci_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.probe_id = 'h69-holdout-2' THEN RAISE EXCEPTION 'H70_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER h70_ci_fail BEFORE INSERT ON r19_h58.audit FOR EACH ROW EXECUTE FUNCTION r19_h58.h70_ci_audit_failure();
SQL
deny review "$A" h69-holdout-2 "$H" h70_audit_rollback_0001
require_eq "$(value "SELECT count(*) FROM r19_h58.reviews")" 3 'rollback reviews'
require_eq "$(value "SELECT count(*) FROM r19_h68.review_idempotency")" 3 'rollback keys'
require_eq "$(value "SELECT attempts FROM r19_h68.rate_windows WHERE reviewer_id='$A'")" 1 'rollback quota'
db -c 'DROP TRIGGER h70_ci_fail ON r19_h58.audit' -c 'DROP FUNCTION r19_h58.h70_ci_audit_failure()' >/dev/null
echo 'PASS 7/11 audit failure rolls back all writes and quota'
out="$(mktemp -d)"; trap 'rm -rf "$out"' EXIT
for n in $(seq 1 12); do review "$A" h69-holdout-2 "$H" h70_parallel_20261117 >"$out/$n.out" 2>"$out/$n.err" & done
wait
require_eq "$(grep -l '"SUBMITTED"' "$out"/*.out | wc -l | tr -d ' ')" 1 'concurrent submit'
require_eq "$(grep -l '"REPLAY"' "$out"/*.out | wc -l | tr -d ' ')" 8 'concurrent replay'
require_eq "$(grep -l '"RATE_LIMITED"' "$out"/*.out | wc -l | tr -d ' ')" 3 'concurrent limit'
require_eq "$(value "SELECT count(*) FROM r19_h58.reviews")" 4 'total reviews'
require_eq "$(value "SELECT count(*) FROM r19_h58.audit")" 4 'total audit'
echo 'PASS 8/11 12 direct RPC sessions; quota cannot be bypassed'
deny db -c "UPDATE r19_h58.reviews SET reason='tampered' WHERE probe_id='h69-dev-1'"
deny db -c "DELETE FROM r19_h58.audit WHERE operation='H68_REVIEW_SUBMITTED'"
echo 'PASS 9/11 append-only H58 reviews and audit'
db -c 'UPDATE r19_h68.release_controls SET review_writes_enabled=false WHERE singleton=1' >/dev/null
deny review "$A" h69-holdout-2 "$H" h70_revoked_again_0001
echo 'PASS 10/11 kill switch revokes writing'
require_eq "$(value "SELECT count(*) FROM pg_policies WHERE policyname LIKE 'h70_%' AND schemaname IN ('r19_h58','r19_h68')")" 13 'RLS policies'
require_eq "$(value "SELECT count(*) FROM pg_proc WHERE proname='h68_export_gold'")" 0 'gold export'
echo 'PASS 11/11 dedicated 13 RLS policies, no gold export'
echo 'H70 REAL PG16: 11/11 PASS; SUPABASE STAGING: NOT_TESTED; RELEASE NO_GO'
