# IELTS Speaking S6 — M10-L32: Evidence Reconciliation & Blocking Defect Triage

**Repository:** HarryTran-lead/IeltsWithHarry
**Branch:** `codex/speaking-s6-m10-l14-staging`
**Scope:** S6 Band 6.5, 44 lessons, private banks and optional recording.
**Baseline verified:** M10-L31 GitHub Quality PASS for commit
`5fe34235f3cd622a0cbf9685320313497ce6d9ad`;
https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/44019726637

**Current live QA:** 0/50 verified Supabase E2E; 0/11 verified mobile/device subset.
**Release status:** S6 STAGING_REVIEW_REQUIRED; S7 LOCKED. Production untouched.

## 1. New milestone artifacts

- `tests/speaking-s6/m10-l32-defect-register.json`: a zero-item register
  for **future, genuine** defects. An empty register means *no defects have
  been recorded*, NOT *no defects exist*.
- `scripts/speaking-s6-l32-defect-triage.mjs`: offline, read-only
  reconciliation of the original 38 E2E cases, supplemental 12 cases,
  device evidence, defect register and independent release metadata.
- `tests/speaking-s6-l32-defect-triage.test.mjs`: 12 synthetic tests of
  priority classification, incident intake, independent retest, leakage
  protection and inconsistent manifests.
- `.github/workflows/quality.yml`: runs the L32 triage **without any**
  Supabase credentials or access. This is not a staging test.

These artifacts never apply SQL migrations, import answer banks, record
audio, unlock a stage, deploy to Vercel, change release flags, or certify
a band score.

## 2. Exactly how to interpret case status

| Manifest status | Meaning | Release action |
|---|---|---|
| `NOT_RUN` | Test not executed, regardless of unit-test CI success | Keep HOLD; do not call it a software bug |
| `BLOCKED` | Real run prevented by environment, unavailable account/device, fixture or other dependency | Record a redacted actual reason; HOLD |
| `FAIL` | Real observed behavior differs from the acceptance criterion | Register a linked defect, severity P0/P1/P2; HOLD |
| `PASS` | Test operator recorded an outcome with redacted independent evidence | Reconcile manifests and independently inspect evidence; not automatically certified |

The classifier refuses a `FAIL` without a corresponding registered
defect. If the manifest and device report disagree about a PASS or show
incompatible reviewer/timestamp/environment, it returns
`HOLD_EVIDENCE_CONFLICT`. A blocked environment is distinguished from
an observed product defect. Reported outcomes remain *metadata claims*;
the script cannot inspect original proof artifacts or impersonate a human.

## 3. Fixed risk tiers (case-based; cannot be downgraded)

**P0 — Release-critical data security or deletion:**
Examples include leaked private bank or follow-up, cross-account access,
unauthorized storage reads/deletes, nonconsented uploads, inability to
remove personal audio, missing staging cleanup, and deletion/submit races.
Any genuine P0 finding stops release immediately and requires
independent retesting.

**P1 — Functional and operating controls:**
Examples include incorrect quota / cooldown behavior, CSRF checks,
RLS release-path regressions, and session integrity. Keep release on HOLD
until real rerun evidence is reviewed.

**P2 — Non-security learner workflow:**
Examples include lesson flow, recording recovery, permission prompts,
stale callbacks and device-specific usability faults. These still block
S6 release when a required E2E case fails.

The precise tier is assigned from the **predeclared E2E case ID** by
`l32RiskTier`, not freely chosen by the operator. The registry rejects
a lower or different severity.

## 4. Defect lifecycle

Only create an `S6-DEF-###` issue **after a real test FAIL/BLOCKED**.
Keep the public register free of user IDs, audio, raw JWTs, signed URLs,
private answers, transcripts, IP addresses and sensitive personal details.

Each incident must have:
- unique `id`, exact `case_id` among S6-E2E-01 through S6-E2E-50
- exact calculated `severity` P0/P1/P2
- one `status`: `OPEN`, `IN_PROGRESS`,
  `FIXED_PENDING_RETEST` or `CLOSED_VERIFIED`
- short non-sensitive `summary`, `observation`, QA `reporter` alias
- restricted `evidence` pointer `ev:restricted-store/...`

Use `FIXED_PENDING_RETEST` when code is changed but the actual staging
behavior has **not** yet been independently rerun. The E2E case must
remain FAIL or BLOCKED in the meantime; never flip it to PASS because
a GitHub job passes.

`CLOSED_VERIFIED` requires the E2E case to be PASS with genuine
independent evidence, a full 40-hex `fix_commit`, separate
`retest_evidence`, an independently named `retest_reviewer` different
from the original reporter, and a UTC retest timestamp. Closure metadata
still needs external manual authentication.

At most one active or closed defect record per E2E case is accepted in
the L32 register. A future need to track multiple independent defects
should use a reviewed schema revision, not silently change the cardinality.

## 5. Fail-closed gate behavior

`node scripts/speaking-s6-l32-defect-triage.mjs` prints only aggregate
counts and case IDs; **never prints raw observations or evidence URLs**.

Expected report as of this milestone:
- `HOLD_NOT_TESTED`, 50 NOT_RUN, 11 device NOT_RUN
- 0 recorded defects — this is an empty register, **not** a clean bill
- 0 verified live E2E, 0 authorized release
- full five-category human signoff is still missing

Possible statuses:
- `HOLD_EVIDENCE_CONFLICT`: invalid/contradictory manifests, untriaged FAIL,
  incomplete closure or privacy-unsafe observations
- `HOLD_DEFECTS`: real FAIL or open/fixed-pending-retest incident
- `HOLD_BLOCKED_TESTS`: no recorded FAIL, but a test is blocked
- `HOLD_NOT_TESTED`: no FAIL/BLOCKED, but some E2E/device cases not executed
- `HOLD_INDEPENDENT_REVIEW`: all tests claim PASS but independent proof,
  reviewer signoffs, exact CI commit or cleanup is incomplete
- `READY_FOR_INDEPENDENT_HUMAN_REVIEW`: only metadata consistency and
  recorded prerequisites; **not** permission to release.

The report always sets
`release_authorized=false`,
`s7_unlock_authorized=false`, and
`production_changes_authorized=false`.

## 6. Operator execution and retest order

1. Confirm an independent, disposable Supabase + Vercel staging setup;
   never use production credentials or user recordings.
2. Use M10-L30 read-only preflight first. If any of 10 checks fails,
   repair the fixture/environment and leave all test cases NOT_RUN/BLOCKED
   as justified by actual results.
3. Use M10-L23 authenticated RLS probes, M10-L26 concurrency harness,
   and physical iOS Safari / Android Chrome acceptance from M10-L31.
   Only isolated staging credentials in a private, operator-controlled shell.
4. On any actual case FAIL: leave the case FAIL, add its defect and
   restricted proof reference, make the fix on staging, obtain CI PASS and
   repeat the **same case on actual staging**. Resolve regressions in
   dependent cases as well.
5. For device-related cases, update both the 50-case E2E manifest and
   M10-L31 device record using the **same** evidence pointer, reviewer,
   environment alias and timestamp. Do not fabricate a device model or
   test run.
6. Remove staging fixtures and confirm five release gates false.
   Five reviewers sign off on S5, teacher content, audio, privacy and
   ADD-ONLY import only after independently checking actual evidence.
7. Run the M10-L29, L31 and L32 gates together, then perform an independent
   human release review. The scripts do not merge, deploy or unlock.

## 7. Verification commands

```bash
npm ci
npm run typecheck
npm run lint
npm run test
node scripts/speaking-s6-l29-release-gate.mjs
node scripts/speaking-s6-l30-staging-preflight.mjs
node scripts/speaking-s6-l31-device-evidence.mjs
node scripts/speaking-s6-l32-defect-triage.mjs
npm run build
```

For a final independent review only, run:
```bash
node scripts/speaking-s6-l32-defect-triage.mjs --require-reviewable
```
This intentionally returns nonzero until the complete real staging
evidence/signoff chain is recorded. Do **not** enable this strict flag in
normal CI while 50 cases remain NOT_RUN.

## 8. Remaining work and next milestone

M10-L32 completes the **offline triage, metadata reconciliation and release
decision plumbing**. Actual staging data remains unavailable in this
workflow; there is no basis to mark any E2E case PASS or sign off a lesson.

**Next M10-L33:** independent teacher/pedagogical and privacy audit of S6
content and learning-path readiness, with staged evidence intake for 50 real
E2E cases. Preserve every existing S6 lesson and private-bank boundary.
