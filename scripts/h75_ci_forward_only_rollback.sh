#!/usr/bin/env bash
# H75/M01: forward-only security rollback on DISPOSABLE localhost PG16, not Supabase.
# Unlike legacy H71 CI reset, NEVER re-grant service_role access to private H58.
set -euo pipefail
EXPECTED='postgresql://h75_ci_runner:h75_ci_password_only@127.0.0.1:5432/h75_ci'
if [[ "${H75_ALLOW_EPHEMERAL_DDL:-}" != "YES_DISPOSABLE_LOCAL_PG16_ONLY" ]] ||
   [[ "${H75_PG_DSN:-}" != "$EXPECTED" ]]; then
  echo 'H75 NOT_TESTED: refused external or non-opted-in database' >&2
  exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db(){ psql "$EXPECTED" -X -qAt -v ON_ERROR_STOP=1 "$@"; }
fail(){ echo "H75_FAIL: $1" >&2; exit 1; }
eq(){ [[ "$1" == "$2" ]] || fail "$3: unexpected result"; }
deny(){ if "$@" >/dev/null 2>&1; then fail "$1 unexpectedly succeeded"; fi; }
gate(){ db -c "SELECT review_writes_enabled::text FROM r19_h68.release_controls WHERE singleton=1"; }
has_read(){ db -c "SELECT has_table_privilege('service_role','r19_h58.probes','SELECT')::text"; }
policy_count(){ db -c "SELECT count(*) FROM pg_policies WHERE schemaname IN ('r19_h58','r19_h68') AND policyname LIKE 'h70_%'"; }
owner(){ db -c "SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.h68_submit_review(text,text,text,text,text,text,text,text)'::regprocedure"; }

db -f "$root/scripts/h69_ci_bootstrap.sql" >/dev/null
eq "$(gate)" false 'Initial SQL kill switch'
eq "$(has_read)" true 'H69 source fixture baseline'
echo 'PASS 1/10 disposable baseline exists; kill switch starts disabled'

# Misordered application release: refuse DB cutover when write gate was enabled.
db -c "UPDATE r19_h68.release_controls SET review_writes_enabled=true WHERE singleton=1" >/dev/null
output="$(mktemp)"; trap 'rm -f "$output"' EXIT
if db -f "$root/sql/001_h70_least_privilege_staging_review.sql" >"$output" 2>&1; then
  fail 'active-gate cutover succeeded'
fi
grep -q 'H70_DB_GATE_MUST_BE_DISABLED' "$output" || fail 'missing active-gate denial'
eq "$(has_read)" true 'No partial privilege mutation on preflight failure'
eq "$(policy_count)" 0 'No policies after rejected cutover'
db -c "UPDATE r19_h68.release_controls SET review_writes_enabled=false WHERE singleton=1" >/dev/null
echo 'PASS 2/10 unsafe migration ordering refused with no partial privileges'

db -f "$root/sql/001_h70_least_privilege_staging_review.sql" >/dev/null
eq "$(has_read)" false 'Private table privilege revoked'
eq "$(policy_count)" 13 'H70 least-privilege policies installed'
eq "$(owner)" r19_h70_executor 'Hardened function owner'
eq "$(gate)" false 'Write gate remains OFF after migration'
echo 'PASS 3/10 forward cutover installs least privilege without opening writes'

# An accidental second deployment must refuse without removing the hardened state.
if db -f "$root/sql/001_h70_least_privilege_staging_review.sql" >"$output" 2>&1; then
  fail 'non-idempotent cutover unexpectedly reapplied'
fi
grep -q 'H70_ROLE_ALREADY_EXISTS_REVIEW_MANUALLY' "$output" || fail 'repeat cutover did not fail closed'
eq "$(has_read)" false 'No legacy access after duplicate cutover'
eq "$(policy_count)" 13 'No broken policies after duplicate cutover'
eq "$(gate)" false 'Write gate still closed after duplicate'
echo 'PASS 4/10 repeat migration denied without privilege regression'

# Test a broken transaction that would attempt to restore a forbidden grant;
# PostgreSQL must atomically discard it before any other session can observe it.
cat >"$output" <<'SQL'
BEGIN;
GRANT USAGE ON SCHEMA r19_h58 TO service_role;
GRANT SELECT ON r19_h58.probes TO service_role;
DO $failure$ BEGIN RAISE EXCEPTION 'H75_FORCED_ABORT'; END $failure$;
COMMIT;
SQL
if db -f "$output" >/dev/null 2>&1; then
  fail 'forced transaction abort not applied'
fi
eq "$(has_read)" false 'Failed transaction did not leak private grants'
eq "$(policy_count)" 13 'Failed transaction did not modify policies'
echo 'PASS 5/10 injected rollback is atomic: insecure GRANT never committed'

# Deliberately simulate the app-side feature temporarily enabled, then stopped.
db -c "UPDATE r19_h68.release_controls SET review_writes_enabled=true WHERE singleton=1" >/dev/null
eq "$(gate)" true 'Simulated staged switch on'
echo 'PASS 6/10 application feature gate can be enabled on disposable fixture'

# Invalid or anonymous requests still cannot query private tables.
deny db -c 'SET ROLE anon' -c 'SELECT source_vi FROM r19_h58.probes'
deny db -c 'SET ROLE authenticated' -c 'SELECT source_vi FROM r19_h58.probes'
deny db -c 'SET ROLE service_role' -c 'SELECT source_vi FROM r19_h58.probes'
echo 'PASS 7/10 private data remains inaccessible to anon, learner and service_role'

# Correct security rollback: close feature flags without reversing DB hardening.
db -c "UPDATE r19_h68.release_controls SET review_writes_enabled=false WHERE singleton=1" >/dev/null
eq "$(gate)" false 'Rollback kept gate OFF'
eq "$(has_read)" false 'Rollback never regranted legacy service-role SELECT'
eq "$(policy_count)" 13 'Rollback preserved hardening'
eq "$(owner)" r19_h70_executor 'Rollback preserved fixed-owner RPC'
echo 'PASS 8/10 forward-safe rollback disables feature without restoring risky grants'

# All H58 data are synthetic; no submissions or audit content should be created.
eq "$(db -c "SELECT count(*) FROM r19_h58.reviews")" 0 'No reviews created'
eq "$(db -c "SELECT count(*) FROM r19_h58.audit")" 0 'No audit rows created'
eq "$(db -c "SELECT count(*) FROM r19_h68.review_idempotency")" 0 'No idempotency rows created'
echo 'PASS 9/10 feature rollback left synthetic review/audit tables untouched'

# Read-only catalog proves the hardening still exists after a failed release.
result="$(db -f "$root/sql/h74_dba_catalog_READ_ONLY.sql")"
[[ "$result" == *'H74_CATALOG_ONLY_RELEASE_GATE|NO_GO'* ]] || fail 'NO_GO marker missing'
[[ "$result" == *'H74_RPC_OWNERSHIP_AND_GRANTS'* ]] || fail 'RPC catalog proof missing'
echo 'PASS 10/10 post-rollback catalog confirms NO_GO and RPC audit surface'
echo 'H75 DISPOSABLE PG16 10/10 PASS; FORWARD_ONLY_SECURITY_ROLLBACK; SUPABASE_STAGING_0_OF_18; RELEASE_NO_GO'
