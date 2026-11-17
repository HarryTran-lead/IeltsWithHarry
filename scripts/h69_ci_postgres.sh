#!/usr/bin/env bash
set -euo pipefail
if [[ "$(printenv H69_ALLOW_EPHEMERAL_DDL || true)" != "YES_ISOLATED_CI_ONLY" ]] || [[ "$(printenv H69_PG_DSN || true)" != "postgresql://h69_ci_runner:h69_ci_password_only@127.0.0.1:5432/h69_ci" ]]; then
 echo "NOT_TESTED: isolated H69 CI database required"; exit 2
fi
here="$(cd "$(dirname "$0")" && pwd)"
psql "$H69_PG_DSN" -X -q -v ON_ERROR_STOP=1 -f "$here/h69_ci_bootstrap.sql" >/dev/null
A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'
C='33333333-3333-4333-8333-333333333333'
OWNER='44444444-4444-4444-8444-444444444444'
OUT='55555555-5555-4555-8555-555555555555'
COORD='66666666-6666-4666-8666-666666666666'
F="$(printf 'b%.0s' {1..64})"
H="$(printf 'd%.0s' {1..64})"
db(){ psql "$H69_PG_DSN" -X -qAt -v ON_ERROR_STOP=1 "$@"; }
count(){ db -c "SELECT count(*) FROM $1"; }
review(){
  local actor="$1" probe="$2" finger="$3" key="$4"
  db -c 'SET ROLE authenticated;' -c "SET request.jwt.claim.sub='$actor';" -c "SELECT public.h68_submit_review('$probe','$finger','PRESERVES_MEANING','ACCEPTABLE','the teacher','The source and answer preserve the same event roles.','','$key');"
}
deny(){ if "$@" >/dev/null 2>&1; then echo "UNEXPECTED_SECURITY_SUCCESS" >&2; exit 1; fi; }
deny review "$A" h69-dev-1 "$F" h69_disabled_key_00001
[[ "$(count r19_h58.reviews)" == 0 ]] || exit 1
echo 'PASS 1/9 SQL kill switch defaults denied'
deny db -c 'SET ROLE anon' -c 'SELECT public.h68_rate_limit_review()'
deny db -c 'SET ROLE authenticated' -c 'SELECT count(*) FROM r19_h58.probes'
deny db -c 'SET ROLE authenticated' -c 'SELECT count(*) FROM r19_h58.reviews'
echo 'PASS 2/9 anon denied; tables private'
db -c 'UPDATE r19_h68.release_controls SET review_writes_enabled=true WHERE singleton=1' >/dev/null
deny review "$OUT" h69-dev-1 "$F" h69_outsider_key_0001
deny review "$OWNER" h69-dev-1 "$F" h69_owner_key_000001
deny review "$COORD" h69-dev-1 "$F" h69_coord_key_000001
echo 'PASS 3/9 non-teachers denied'
deny review "$B" h69-unassigned-3 "$(printf 'f%.0s' {1..64})" h69_unassigned_00001
deny review "$A" h69-dev-1 "$(printf 'e%.0s' {1..64})" h69_changed_sha_0001
echo 'PASS 4/9 assignments and source integrity'
a_result="$(review "$A" h69-dev-1 "$F" h69_review_a_20261117)"
b_result="$(review "$B" h69-dev-1 "$F" h69_review_b_20261117)"
c_result="$(review "$C" h69-dev-1 "$F" h69_review_c_20261117)"
for r in "$a_result" "$b_result" "$c_result"; do [[ "$r" == *'"SUBMITTED"'* ]] || exit 1; done
[[ "$(count r19_h58.reviews)" == 3 && "$(count r19_h58.audit)" == 3 ]] || exit 1
[[ "$(db -c "SELECT count(DISTINCT reviewer_id) FROM r19_h58.reviews WHERE probe_id='h69-dev-1'")" == 3 ]] || exit 1
echo 'PASS 5/9 three distinct teachers, three review slots'
same="$(review "$A" h69-dev-1 "$F" h69_review_a_20261117)"
[[ "$same" == *'"REPLAY"'* ]] || exit 1
deny review "$A" h69-dev-1 "$F" h69_duplicate_key_01
[[ "$(count r19_h58.audit)" == 3 ]] || exit 1
echo 'PASS 6/9 idempotency and duplicate refusal'
deny db -c "UPDATE r19_h58.reviews SET reason='tampered' WHERE probe_id='h69-dev-1'"
deny db -c "DELETE FROM r19_h58.audit WHERE operation='H68_REVIEW_SUBMITTED'"
[[ "$(count r19_h58.reviews)" == 3 ]] || exit 1
echo 'PASS 7/9 append-only H58 triggers'
h_result="$(review "$A" h69-holdout-2 "$H" h69_holdout_key_0001)"
[[ "$h_result" == *'"SUBMITTED"'* && "$h_result" != *"teacher"* && "$h_result" != *"Giáo"* ]] || exit 1
[[ "$(db -c "SELECT count(*) FROM pg_proc WHERE proname='h68_export_gold'")" == 0 ]] || exit 1
echo 'PASS 8/9 no holdout data in review acknowledgment'
db -c 'UPDATE r19_h68.release_controls SET review_writes_enabled=false WHERE singleton=1' >/dev/null
deny review "$B" h69-holdout-2 "$H" h69_disabled_again_001
[[ "$(count r19_h58.reviews)" == 4 ]] || exit 1
echo 'PASS 9/9 kill switch revocation'
echo "KNOWN_UNREMEDIATED: H58 service_role SELECT privilege = $(db -c "SELECT has_table_privilege('service_role','r19_h58.probes','SELECT')")"
echo 'H69 POSTGRESQL 16: 9/9 PASS. Supabase Auth staging = NOT_TESTED. RELEASE = NO_GO'
