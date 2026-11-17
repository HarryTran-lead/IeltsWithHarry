# M10-L23 — Speaking S6 authenticated RLS and cross-account verification

**Scope:** guarded read-only staging audit with real learner JWTs, backed by mocked regression tests. No production changes.
**Current real E2E:** still **0/38** until disposable Supabase staging has been genuinely exercised, results reviewed, and the E2E manifest signed.
**Release:** S6 STAGING_REVIEW_REQUIRED; S7 LOCKED.

## Files introduced
- scripts/speaking-s6-l23-rls-audit.mjs — 16 GET-only REST probes using staging anon key + two authenticated learner JWTs
- tests/speaking-s6-l23-rls-audit.test.mjs — seven offline/mock tests for host binding, two distinct roles, access assertions, lack of mutating requests and private-answer field exposure
- docs/SPEAKING_S6_M10_L23_AUTH_RLS.md — this playbook

## What the 16 probes verify
| Family | Probes | Expected |
|---|---:|---|
| Anonymous / learners accessing private bank or release gates | 6 | HTTP 401/403 |
| A/B reading only their OWN seeded attempts and progress | 4 | one matching row each |
| A/B trying to read EACH OTHER'S attempts and progress | 4 | HTTP 200 with zero rows |
| Eligible vs ineligible read of S6-001 published student lesson | 2 | in locked mode both zero; in eligible mode A one and B zero |
| **Total** | **16** | Subject to fixtures and mode |

For eligible-mode A's student_content, recursively scan for sensitive answer keys
(model_answer_en, followup_en, model_translation_vi, teacher_reasoning_vi, etc.).
Any such key is a FAIL. This is a defensive check, not proof that no secret
text appears under some unforeseen key.

All queries use Supabase REST GET only; they never run migrations, toggle gates,
create attempts, delete records, read storage objects, or submit learning answers.

## Mandatory setup BEFORE running a live audit
1. Obtain an **approved disposable Supabase project**, not the production project.
2. Apply migrations L14→L15→L17 in order, validate release gate defaults false, and seed isolated dummy S6-001 R11 lesson/attempt/progress fixtures using a separate controlled staging setup.
3. Create two distinct test users A and B. A is S5 verified, B not verified. Capture two short-lived authenticated JWTs and their OWN attempt UUIDs via an approved secure staging credential workflow.
4. Never put JWTs, private answer banks, audio, cookies or password values in public GitHub, issues, screenshots, logs or the evidence JSON.
5. Set the exact approved staging Supabase host. Both JWTs must have matching issuer (this is a client preflight only; Supabase itself verifies cryptographic signatures).

## Running mode 1: locked (recommended first)
~~~bash
export S6_STAGING_DISPOSABLE_CONFIRMATION="I_CONFIRM_DISPOSABLE_STAGING"
export S6_STAGING_SUPABASE_URL="https://DISPOSABLE-STAGING-REF.supabase.co/"
export S6_STAGING_EXPECTED_HOST="DISPOSABLE-STAGING-REF.supabase.co"
export S6_STAGING_SUPABASE_ANON_KEY="STAGING_ANON_KEY"
export S6_L23_LEARNER_A_JWT="STAGING_LEARNER_A_JWT"
export S6_L23_LEARNER_B_JWT="STAGING_LEARNER_B_JWT"
export S6_L23_ATTEMPT_A="STAGING_ATTEMPT_A_UUID"
export S6_L23_ATTEMPT_B="STAGING_ATTEMPT_B_UUID"
export S6_L23_REVISION="R11"
export S6_L23_ACCESS_MODE="locked"
node scripts/speaking-s6-l23-rls-audit.mjs --run-approved-staging
~~~
Under locked mode, five global release gates MUST remain false and **no** learner
may read a published S6 lesson. Attempts and progress must be seeded for owner
isolation checks even though content is locked.

## Running mode 2: eligible (controlled staging test window only)
Only run AFTER the operator has safely set all five gates true, verified A's
signed S5 staging evidence, left B unverified, and published a disposable S6-001
revision **in the isolated staging database**. The audit does NOT perform these actions.
~~~bash
export S6_L23_ACCESS_MODE="eligible"
export S6_L23_DISPOSABLE_RELEASE_WINDOW="I_CONFIRMED_STAGING_ONLY_RELEASE"
node scripts/speaking-s6-l23-rls-audit.mjs --run-approved-staging
~~~
A should see exactly one published S6-001 student revision (with no private fields).
B must see zero. If any probe FAILs, stop the test, preserve redacted evidence
and immediately restore the five gates false in the **isolated staging project**.

## Offline tests
~~~bash
npm test -- tests/speaking-s6-l23-rls-audit.test.mjs
npm run typecheck && npm run lint && npm run build
~~~
The automated tests run with synthetic JWT claims and a mocked fetch transport;
passing them does NOT count as a real staging E2E pass.

## Interpreting the report
- PASS means this one GET probe met its exact response expectation.
- FAIL means observed access contradicted the security rule (even HTTP 200 with [] is a FAIL for a private bank with revoked SELECT).
- BLOCKED means unexpected HTTP or network behavior; never count as a PASS.
- Output prints only IDs, HTTP codes, counts and PASS/FAIL/BLOCKED; never JWTs, user UUIDs or lesson bodies.
- The script does NOT edit tests/speaking-s6/m10-l21-e2e-evidence.json and always reports full_e2e_cases_certified=0.

## Additional manual checks to finish the full E2E suite
- Admin preview must be authenticated with an actual admin browser session;
  its Next.js viewer(true) and cookie-based API cannot be certified by these Supabase GETs.
- Test Mastery follow-up **before** and **after** submit through a real staging
  owner session; another user with the attemptId must get 404.
- Test signed-out and mismatched preview access, media storage ownership/consent
  and delete semantics with actual staging browser sessions.
- Restore all five QA gates false; delete staging-only seed attempts/recordings/users.
- Reviewer must attach redacted expected vs actual evidence per relevant case
  in the 38-case M10-L21 manifest and sign off separately. Do not auto-mark any of the 38 PASS.
