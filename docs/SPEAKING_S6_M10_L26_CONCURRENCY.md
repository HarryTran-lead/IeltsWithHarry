# M10-L26 — Speaking S6 real staging concurrency & deletion-proof cooldown

Scope: staging branch only. No production migration, no S6/S7 unlock.
Real Supabase E2E (38-case release matrix): 0/38 until independently signed results exist.

## Finding fixed in M10-L26

M10-L25 preserved hour/day counters after attempt deletion but the 10-minute
same-question cooldown was derived from the attempt row itself. Deleting the
attempt therefore reset the cooldown. The separate private table
speaking_s6_activity_cooldowns introduced by migration L26 retains that
timestamp independently.

The service-role-only speaking_s6_start_attempt_l25 function is replaced
without changing its signature. Under an existing per-user+preview row lock,
the function validates current eligibility and release revision, checks quota
and cooldown, inserts the attempt, updates the per-activity cooldown and
increments quotas in one SQL transaction. Any error rolls back the entire
operation. RLS is enabled and learner SELECT/WRITE privileges are revoked.

## Migration order — disposable staging ONLY

1. 202611170003_speaking_s6_staging_l14.sql
2. 202611170004_speaking_s6_ui_progress_l15.sql
3. 202611170005_speaking_s6_s5_rls_l17.sql
4. 202611170006_speaking_s6_attempt_limits_l25.sql
5. 202611170007_speaking_s6_cooldown_atomic_l26.sql

Do not run these migration files against production. Keep all five global
release gates false except in an independently approved staging access test.

## Offline tests

PGlite regression: tests/speaking-s6-postgres-rls.test.ts
- Checks L14-L26 migration, quotas, missing-S5 denial, owner RLS,
  same-question cooldown after DELETE, and atomic rollback after rejected starts
- Uses Promise.all to interleave six calls in a SINGLE embedded PGlite
  connection; this is not proof of real cross-process PostgreSQL concurrency

Synthetic HTTP regression: tests/speaking-s6-l26-concurrency.test.mjs
- Checks host preflight, absence of fixture collisions, fan-out calls, expected
  PostgREST outcomes and required cleanup

Commands:
    npm ci
    npm run typecheck
    npm run lint
    npm test -- tests/speaking-s6-postgres-rls.test.ts tests/speaking-s6-l26-concurrency.test.mjs
    npm run build

## Live multi-connection test harness — explicit operator opt-in only

Script: scripts/speaking-s6-l26-concurrency.mjs

Prerequisites:
- One newly created DISPOSABLE Supabase staging project, NOT production
- All five release gates false; L14-L26 migrations applied
- One dedicated disposable test account in auth.users
- Exactly one private S6-001 lesson revision in STAGING status (example L26_TEST)
- No existing preview attempts, quotas or cooldowns for that test account
- Staging service-role key available in a SECURE LOCAL SHELL, never in public CI,
  issues, chat, screenshots or GitHub commits

In that controlled shell, configure:
    S6_L26_ISOLATED_STAGING_ACK=I_CONFIRM_DISPOSABLE_STAGING_ONLY
    S6_L26_DESTRUCTIVE_FIXTURE_ACK=I_APPROVE_TEST_FIXTURE_CLEANUP
    S6_L26_SUPABASE_URL=https://YOUR-DISPOSABLE-REF.supabase.co/
    S6_L26_EXPECTED_HOST=YOUR-DISPOSABLE-REF.supabase.co
    S6_L26_SERVICE_ROLE_KEY=<STAGING_ONLY_SECRET>
    S6_L26_TEST_USER_ID=<DISPOSABLE_TEST_USER_UUID>
    S6_L26_STAGING_REVISION=L26_TEST

Then execute:
    node scripts/speaking-s6-l26-concurrency.mjs --run-explicit-disposable-staging

Behavior:
1. Checks release gates FALSE, unique staging revision and empty user fixtures.
   If any precondition fails: no mutation is sent.
2. Sends 6 POST requests concurrently through real Supabase PostgREST to the
   service-only quota RPC with distinct activity IDs and preview=true.
3. Expected: 3 accepted, 3 blocked by active-attempt limit; persisted attempt
   rows, cooldown records and hour/day counters must all equal 3.
4. In finally, deletes ONLY that test user's preview fixture rows, then reads
   back empty tables and FALSE release gates before reporting cleanup success.
5. Prints only counts and HTTP-derived status categories. Does not print keys,
   tokens, response bodies or test user IDs.
6. PASS_SUBSET means DB quota subset only, not the 38 full E2E tests.

The harness uses a service-role key, so it does not verify Next.js admin
authentication or learner S5 / cross-user RLS. Those still require browser
and direct authenticated-learner staging tests under the 38-case matrix.

## Release gate and limitations

S6 remains STAGING_REVIEW_REQUIRED; S7 remains LOCKED.
Actual staging E2E remains 0/38 absent results and independent evidence.
No production changes, release gate edits or private R11 answer uploads.

Remaining concerns: multiple accounts, lack of IP/WAF throttling, fixed-window
bursts, unverified audio/transcript supplied by the client, and mobile/browser
recording compatibility. Self-study progress is NOT a certified IELTS band.

Next: M10-L27 — independent real staging proof and audio-evidence integrity.
