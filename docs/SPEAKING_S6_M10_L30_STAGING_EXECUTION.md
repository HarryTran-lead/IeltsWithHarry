# IELTS Speaking S6 — M10-L30: Final QA & Staging Execution Readiness

**Project:** IeltsWithHarry — Speaking S6 R11, Band 6.5.
**Branch:** `codex/speaking-s6-m10-l14-staging`.
**Security state:** S6 = STAGING_REVIEW_REQUIRED; S7 = LOCKED.
**As authored:** real Supabase E2E 0/50; physical iOS/Android tests not executed.
**Production:** NOT changed; no release gates toggled, private R11 answers imported, or learner data copied.

## 1. Verified M10-L29 CI baseline

GitHub Actions Quality passed on commit:
`878603e0778e870aa5dcea3addb87fd3ecea0698`

Run: https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/44018127167

The check job passed typecheck, lint, Vitest, offline L29 manifest
evaluation and Next.js build. The audio-worker job passed. **This does
not count as a real Supabase E2E PASS.**

## 2. New M10-L30 deliverables

- `scripts/speaking-s6-l30-staging-preflight.mjs`: operator-opt-in
  **GET-only** preflight, no secrets or user records in output.
- `tests/speaking-s6-l30-staging-preflight.test.mjs`: eight mocked
  network and fail-closed regression cases.
- `.github/workflows/quality.yml`: invokes the preflight WITHOUT
  credentials or opt-in flags. Its ordinary CI behavior sends **zero**
  HTTP requests and prints HOLD_NO_STAGING_EXECUTION.
- This document: a precise no-production staging execution protocol.

## 3. First run: OFFLINE, no credentials

```bash
node scripts/speaking-s6-l30-staging-preflight.mjs
node scripts/speaking-s6-l29-release-gate.mjs
npm test -- tests/speaking-s6-l30-staging-preflight.test.mjs
```

Expected: L30 reports `HOLD_NO_STAGING_EXECUTION`, `staging_http_requests:0`,
and `live_e2e_cases_certified:0`. L29 reports `HOLD` because all 50
real-world cases have NOT_RUN.

CI is intentionally allowed to pass while real staging tests are NOT_RUN.
CI validates code and structured evidence, not human release decisions.

## 4. Controlled stage-only read-only probes

### Prerequisites

1. An **independently confirmed newly provisioned disposable Supabase**
   project, never a production replica or production project.
2. A known production Supabase host solely for exact inequality checking.
   The script cannot prove operator-supplied host facts; an independent
   reviewer must verify project identity and credentials outside the script.
3. Staging service-role and anon keys in a **secure local shell**, not GitHub
   Actions, code, issue comments, chat, browser local storage or screenshots.
4. The isolated project must already have migrations L14→L15→L17→
   L25→L26→L27→L28 applied in order.
5. All five QA gates FALSE. Do not enable any of them to run this preflight.

### Run only after human verification

```bash
# Place real STAGING-ONLY values securely; placeholders shown here.
export S6_L30_DISPOSABLE_ACK="I_VERIFIED_NEW_DISPOSABLE_STAGING"
export S6_L30_NONPRODUCTION_ACK="I_VERIFIED_STAGING_DIFFERS_FROM_PRODUCTION"
export S6_L30_SUPABASE_URL="https://DISPOSABLE-PROJECT-REF.supabase.co/"
export S6_L30_EXPECTED_HOST="DISPOSABLE-PROJECT-REF.supabase.co"
export S6_L30_PRODUCTION_HOST="KNOWN-PRODUCTION-REF.supabase.co"
export S6_L30_ENVIRONMENT_ALIAS="disposable-s6-manual-qa"
export S6_L30_STAGING_SERVICE_ROLE_KEY="STAGING_ONLY_SERVICE_KEY"
export S6_L30_STAGING_ANON_KEY="STAGING_ONLY_ANON_KEY"

node scripts/speaking-s6-l30-staging-preflight.mjs --approved-staging-read-only
```

**Exactly 10 GET-only checks**:

| Probe | Requirement |
|---|---|
| GATES_FALSE | One S6 release-gate row, all 5 flags false |
| ATTEMPT_L28_FIELDS | `deletion_requested_at` and L27 audio columns queryable |
| L25_QUOTA_TABLE | Hour/day counter table and columns exist |
| L26_COOLDOWN_TABLE | Per-activity cooldown columns exist |
| S5_EVIDENCE_TABLE | Signed S5 evidence columns exist |
| LESSON_REVISION_SCHEMA | S6 lesson revision columns exist |
| PRIVATE_BANK_SCHEMA | Service role sees private bank schema (no bank row data) |
| PRIVATE_AUDIO_BUCKET | S6 bucket is private; max 10 MiB; supports WebM, MP4, Ogg |
| ANON_PRIVATE_BANK_DENIED | Anon SELECT rejected, HTTP 401/403; HTTP 200 is FAIL |
| ANON_RELEASE_GATES_DENIED | Anon SELECT rejected, HTTP 401/403; HTTP 200 is FAIL |

Report outcomes: PASS, FAIL, BLOCKED. Even 10/10 PASS means
`READY_TO_BEGIN_MANUAL_50_CASE_E2E`, **not** approval for production.

### Important limitations

- The probes test readable schema **signatures** via REST, not migration
  checksums or all policies in `pg_policies`. Check migration history and
  direct authenticated RLS on staging independently.
- Service-role SELECT bypasses RLS. Its schema checks **cannot** prove
  learner privacy.
- This audit does not run a real recording, write a session, verify teacher
  content or certify an IELTS band. It is a *precondition gate only*.
- A manually supplied production host comparison cannot guarantee project
  identity if the operator gives incorrect information.

## 5. Proceed to real staging execution (not run here)

Only after the above preflight succeeds, follow:

A. **Authenticated RLS**: Run the M10-L23 16-probe script with **genuine
   isolated learner A/B JWTs and seeded attempts**, both locked and
   eligible staging modes, and test browser-based admin preview separately.
   JWT payload decoding in the script is a client preflight, not a signature
   validation; Supabase authenticates requests.

B. **Quota concurrency**: Run the M10-L26 six-POST test with a **dedicated
   freshly provisioned test account and preview fixtures**. It makes
   destructive writes and MUST NOT be run without its own independent
   two-acknowledgment staging configuration and cleanup confirmation.
   A successful result proves the narrow DB quota subset, not learner RLS.

C. **50 live E2E cases**:
   - 01–12: real S5 eligibility, gates, private bank and preview restrictions
   - 13–17: admin ADD-ONLY import, conflicts and authorizations
   - 18–27: Guided/Independent/Mastery, owner/session, idempotent submit
   - 28–34: physical iOS Safari and Android Chrome recording and consent
   - 35–38: deletion, isolation, retry, cleanup
   - 39–50: quota, CSRF, SHA-256, permission denial, deletion/submit races

D. **Staging cleanup and five review signatures**: Confirm no test accounts,
   orphan recordings or attempts, flags reset to false. Independently approve
   S5, pedagogy/teacher, audio, privacy and import. Only then may evidence
   manifest entries become PASS.

## 6. Release-evidence intake

Required file contracts:
- `tests/speaking-s6/m10-l21-e2e-evidence.json`: original 38
- `tests/speaking-s6/m10-l29-e2e-addendum.json`: extra 12
- `scripts/speaking-s6-l29-release-gate.mjs`: metadata consistency gate
- `docs/SPEAKING_S6_M10_L29_RELEASE_READINESS.md`: evidence and signoff procedure

A real PASS needs independent, redacted `ev:` evidence reference, actual
vs expected response, reviewer, timestamp and environment alias. Store any
sensitive original evidence in a restricted external store, not the public
GitHub repo. Passing a metadata validator is not authentication of evidence.

**Release decision:** HOLD until 50/50 real E2E, correct CI for the exact
release candidate, verified staging cleanup and five independent approvals.

## 7. Next milestone

**M10-L31 — Device/Browsers Acceptance & Evidence Reconciliation**:
physical-browser audio compatibility; user-consent/privacy review; 50-case
evidence intake and independent signoff. Do not claim any physical-device
result until evidence is gathered by the actual test operator.
