#!/usr/bin/env bash
set -euo pipefail
: "$H68_PG_DSN"
if [[ "$H68_ALLOW_EPHEMERAL_DDL" != 'YES_LOCAL_CI_ONLY' ]]; then
  echo 'NOT_TESTED: explicit ephemeral database approval required' >&2; exit 2
fi
if [[ ! "$H68_PG_DSN" =~ ^postgresql://h68_ci_runner:[A-Za-z0-9_]+@127\.0\.0\.1:5432/h68_ci$ ]]; then
  echo 'REFUSED_NON_EPHEMERAL_DATABASE' >&2; exit 2
fi
root="$(cd "$(dirname "$0")/.." && pwd)"
psql "$H68_PG_DSN" -X -q -v ON_ERROR_STOP=1 -f "$root/scripts/h68_ci_fixture.sql" >/dev/null
A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'
C='33333333-3333-4333-8333-333333333333'
reason='The event roles and meaning correspond to the source.'
review(){
  local who="$1" probe="$2" key="$3" meaning="$4" fingerprint
  case "$probe" in p1) fingerprint="$(printf 'a%.0s' {1..64})";; p2) fingerprint="$(printf 'b%.0s' {1..64})";; p3) fingerprint="$(printf 'c%.0s' {1..64})";; holdout-p4) fingerprint="$(printf 'd%.0s' {1..64})";; *) exit 9;; esac
  psql "$H68_PG_DSN" -X -qAt -v ON_ERROR_STOP=1 \
    -c 'SET ROLE authenticated' \
    -c "SET request.jwt.claim.sub = '$who'" \
    -c "SELECT public.h68_submit_review('$probe','$fingerprint','$meaning','ACCEPTABLE','the teacher','$reason','','$key')::text;"
}
count(){ psql "$H68_PG_DSN" -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM $1;"; }
expect_eq(){ if [[ "$1" != "$2" ]]; then echo "ASSERTION_FAILED $3: $1 != $2" >&2; exit 1; fi; }

# Test 0: SQL kill switch is false by default, including for a valid teacher JWT.
if review "$A" p1 'h68_disabled_probe_0000' 'PRESERVES_MEANING' >/dev/null 2>&1; then echo 'DB_KILL_SWITCH_BYPASSED' >&2; exit 1; fi
psql "$H68_PG_DSN" -X -q -v ON_ERROR_STOP=1 -c 'UPDATE r19_h68.release_controls SET review_writes_enabled=true WHERE singleton=1' >/dev/null
echo 'PASS 0/9 database kill switch defaults disabled'

if review "$B" p1 'h68_not_assigned_0001' 'PRESERVES_MEANING' >/dev/null 2>&1; then echo 'ROLE_BYPASS' >&2; exit 1; fi
if review "$C" p1 'h68_owner_cannot_grade' 'PRESERVES_MEANING' >/dev/null 2>&1; then echo 'OWNER_BYPASS' >&2; exit 1; fi
expect_eq "$(count r19_h58.reviews)" 0 'non-teacher access'; echo 'PASS 1/9 auth and assignment'

r="$(review "$A" p1 'h68_once_request_0001' 'PRESERVES_MEANING')"
[[ "$r" == *'"SUBMITTED"'* ]] || { echo 'FIRST_SUBMISSION_FAILED' >&2; exit 1; }
expect_eq "$(count r19_h58.reviews)" 1 'first review';
expect_eq "$(count r19_h58.audit)" 1 'first audit'; echo 'PASS 2/9 first submission'

r="$(review "$A" p1 'h68_once_request_0001' 'PRESERVES_MEANING')"
[[ "$r" == *'"REPLAY"'* ]] || { echo 'REPLAY_FAILED' >&2; exit 1; }
expect_eq "$(count r19_h58.audit)" 1 'replay audit'; echo 'PASS 3/9 exact replay'

if review "$A" p1 'h68_once_request_0001' 'MEANING_DRIFT' >/dev/null 2>&1; then echo 'KEY_MISMATCH_ACCEPTED' >&2; exit 1; fi
if review "$A" p1 'h68_second_key_0001' 'PRESERVES_MEANING' >/dev/null 2>&1; then echo 'DUPLICATE_REVIEW_ACCEPTED' >&2; exit 1; fi
expect_eq "$(count r19_h68.review_idempotency)" 1 'mismatch idempotency'; echo 'PASS 4/9 mismatch isolation'

outdir="$(mktemp -d)"; trap 'rm -rf "$outdir"' EXIT
for i in $(seq 1 12); do review "$A" p2 'h68_parallel_key_0002' 'PRESERVES_MEANING' >"$outdir/$i.out" 2>"$outdir/$i.err" & done
wait
expect_eq "$(grep -l '"SUBMITTED"' "$outdir"/*.out | wc -l | tr -d ' ')" 1 'concurrent submitted'
expect_eq "$(grep -l '"REPLAY"' "$outdir"/*.out | wc -l | tr -d ' ')" 11 'concurrent replay'
expect_eq "$(count r19_h58.reviews)" 2 'concurrent review count'
expect_eq "$(count r19_h58.audit)" 2 'concurrent audit count'; echo 'PASS 5/9 12-backend contention'

psql "$H68_PG_DSN" -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE FUNCTION r19_h58.test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.probe_id='p3' THEN RAISE EXCEPTION 'CI_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER ci_failure BEFORE INSERT ON r19_h58.audit FOR EACH ROW EXECUTE FUNCTION r19_h58.test_audit_failure();
SQL
if review "$A" p3 'h68_rollback_key_0003' 'PRESERVES_MEANING' >/dev/null 2>&1; then echo 'ROLLBACK_FAILURE_NOT_TRIGGERED' >&2; exit 1; fi
expect_eq "$(count r19_h58.reviews)" 2 'rollback review';
expect_eq "$(count r19_h58.audit)" 2 'rollback audit';
expect_eq "$(count r19_h68.review_idempotency)" 2 'rollback ledger';
psql "$H68_PG_DSN" -X -q -v ON_ERROR_STOP=1 -c 'DROP TRIGGER ci_failure ON r19_h58.audit' -c 'DROP FUNCTION r19_h58.test_audit_failure()' >/dev/null
[[ "$(review "$A" p3 'h68_rollback_key_0003' 'PRESERVES_MEANING')" == *'"SUBMITTED"'* ]] || exit 1
echo 'PASS 6/9 atomic rollback and retry'

allowed=0; denied=0
for i in $(seq 1 12); do
 x="$(psql "$H68_PG_DSN" -X -qAt -v ON_ERROR_STOP=1 -c 'SET ROLE authenticated' -c "SET request.jwt.claim.sub = '$B'" -c 'SELECT public.h68_rate_limit_review();')"
 case "$x" in t) allowed=$((allowed+1));; f) denied=$((denied+1));; *) echo "UNEXPECTED_RATE_RESULT $x" >&2;exit 1;; esac
done
expect_eq "$allowed" 10 'allowed quota'; expect_eq "$denied" 2 'denied quota';echo 'PASS 7/9 atomic quota'

if psql "$H68_PG_DSN" -X -q -v ON_ERROR_STOP=1 -c 'SET ROLE authenticated' -c 'SELECT count(*) FROM r19_h58.probes' >/dev/null 2>&1; then
 echo 'PRIVATE_TABLE_LEAK' >&2; exit 1
fi
expect_eq "$(psql "$H68_PG_DSN" -X -qAt -c "SELECT count(*) FROM pg_proc WHERE proname='h68_export_gold'")" 0 'no export RPC'
echo 'PASS 8/9 holdout non-exposure'
echo 'H68 REAL POSTGRESQL 16 CI: 8/9 PASSED; STAGING SECURITY STILL NOT_TESTED'
