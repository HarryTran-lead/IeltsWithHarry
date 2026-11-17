# M10-L22 — Speaking S6 staging preflight and evidence gate

**State:** Test tooling delivered. Live Supabase staging E2E remains **0/38 NOT_RUN**. S6 release blocked; S7 locked.

## Delivered
- scripts/speaking-s6-l22-preflight.mjs — offline validation of the E2E matrix and static migration-source guardrails; optional read-only anonymous staging probes
- tests/speaking-s6-l22-preflight.test.mjs — regression cases for evidence integrity, stage-host guardrails and GET-only probes
- docs/SPEAKING_S6_M10_L21_REAL_E2E_MATRIX.md — mandatory evidence matrix for all 38 real checks

## A. Offline preflight
~~~bash
node scripts/speaking-s6-l22-preflight.mjs
npm test -- tests/speaking-s6-l22-preflight.test.mjs
~~~
Expected first run: 38 NOT_RUN, 0 PASS, 6 static migration-source checks, release ready=false.
Static SQL checks do NOT prove that a Supabase migration was ever applied or that live RLS works.
The preflight exits nonzero on malformed evidence or missing static constraints. It does not fail solely because real tests are NOT_RUN.

## B. Optional anonymous, READ-ONLY staging check
This step is forbidden without an approved disposable staging environment; never point it at production.
~~~bash
# Set these in a secure local environment; never commit keys or tokens.
export S6_STAGING_SUPABASE_URL="https://YOUR-STAGING-REF.supabase.co/"
export S6_STAGING_EXPECTED_HOST="YOUR-STAGING-REF.supabase.co"
export S6_STAGING_SUPABASE_ANON_KEY="STAGING_ANON_KEY"
export S6_STAGING_DISPOSABLE_CONFIRMATION="I_CONFIRM_DISPOSABLE_STAGING"
node scripts/speaking-s6-l22-preflight.mjs --probe-staging
~~~
This probe issues exactly THREE GET requests at the allowlisted host:
- GET speaking_s6_private_revisions: anonymous SELECT should be denied.
- GET speaking_s6_release_gates: anonymous SELECT should be denied.
- GET speaking_s6_lesson_revisions: anonymous SELECT should be denied.

HTTP 401/403 means PASS_DENIED for that anonymous grant probe only; HTTP 200 means FAIL_PUBLIC_READ; everything else is BLOCKED.
No redirects, SQL changes, imports, storage mutations, authentication changes, service-role credentials or data uploads occur.
Even three PASS_DENIED checks do not count as 3/38 full E2E tests.

## C. Real 38-case E2E execution
Follow docs/SPEAKING_S6_M10_L21_REAL_E2E_MATRIX.md and docs/SPEAKING_S6_M10_L17_REAL_STAGING_PLAYBOOK.md.

1. Create a disposable Supabase staging project and separate deployment; apply L14, L15 and L17 migrations in order, keeping five QA gates false.
2. Use controlled admin, learner A with signed S5 and learner B without S5 accounts. Test UI and direct PostgREST/RLS with actual staging sessions.
3. Temporarily enable gates and stage-publish only S6-001 **inside the disposable staging project** for eligible-vs-ineligible checks. Restore gates false after the test window.
4. Verify 10-step Guided/Independent/Mastery flow; ownership, private follow-up and feedback rules; retry, concurrency, deletion and cleanup.
5. On physical iOS Safari and Android Chrome, test supported codecs, microphone denial, cancel, refresh, storage-consent handling and audio deletion.
6. Record actual, expected, environment alias, role, timestamp, independent reviewer, redacted evidence reference per test. Never commit private R11 data, recordings, passwords, JWTs, or personal information.
7. Verify no staging seed attempts, storage objects or test accounts remain, and all five QA gates are false again.

## Release barrier
The manifest validator requires all 38 cases PASS with populated evidence attributes, five signed approvals (s5, teacher, audio, privacy, import), and RELEASE REVIEW status. The validator cannot authenticate evidence files by itself: reviewers must inspect source evidence.
Any missing, BLOCKED, or FAIL case keeps S6=STAGING_REVIEW_REQUIRED and S7=LOCKED. No production changes are authorized in M10-L22.
