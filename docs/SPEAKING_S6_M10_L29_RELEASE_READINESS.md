# M10-L29 — Speaking S6 Real Staging E2E and Release Readiness

**Branch:** codex/speaking-s6-m10-l14-staging
**Scope:** S6 Band 6.5 private curriculum; do NOT change production or unlock S6/S7.
**Status on authoring:** Original E2E matrix 0/38 verified; supplemental security E2E 0/12 verified. Total **0/50**. CI must be checked at the exact candidate commit, not inferred from any prior successful run.

## 1. M10-L28 CI regression found and repaired

The L28 SQL test suite failed because the PGlite fixture ran an UPDATE against
public.speaking_s6_attempts *while role=authenticated*. The real schema correctly
revokes direct UPDATE from learners. The test now expects the learner UPDATE to
be denied, switches to database owner solely to seed/clear the deletion marker,
then restores the learner role for RLS and Storage INSERT assertions.

This is a test-harness correction; it does **not** grant learner UPDATE in SQL.
A green pipeline must still be verified for the post-fix commit.

## 2. Exactly 50 mandatory real-world checks

**Original 38 cases:** tests/speaking-s6/m10-l21-e2e-evidence.json
- 12 release/RLS, 5 ADD-ONLY imports, 10 session/lesson, 7 real mobile audio,
  4 deletion/privacy/cleanup.

**12 added after the L25-L28 feature changes:**
tests/speaking-s6/m10-l29-e2e-addendum.json
- 4 quotas and anti-harvesting (hour/day, DELETE persistence, per-activity
  cooldown, real distinct PostgREST connection concurrency)
- 1 browser same-origin / CSRF negative + positive checks
- 4 consent/audio-integrity checks (no retention, checksum comparison, invalid
  or ambiguous files, owner + foreign user Storage UPDATE/DELETE/RLS denial)
- 3 delete-submit/Storage failure races (delete first, submit first, fail/retry)

**Initial status:** All 50 NOT_RUN. Never convert a mock Vitest, PGlite, or
synthetic FFmpeg success to a live E2E PASS. Keep the 38-case original manifest
unchanged except for genuine future evidence.

## 3. Operator-only staging execution order

A. **Prepare disposable and isolated project.** A separate, newly provisioned
Supabase project and isolated Vercel preview/origin (never use production keys,
users, cookies, JWTs or Storage). Record a nonsecret environment alias and the
exact candidate Git SHA. Create controlled staging admin, learner A with signed
S5 proof and learner B without S5 proof; only synthetic / rights-cleared lesson
content and audio. Never upload a copied production database.

B. **Apply migrations in order** to the isolated staging project only:
L14 (202611170003), L15 (202611170004), L17 (202611170005),
L25 (202611170006), L26 (202611170007), L27 (202611170008),
L28 (202611170009). Verify all five S6 QA flags FALSE after migrations. Do not
publish or enable any gates in production.

C. **Locked-state RLS and import tests:** run original E2E 01-05 and 09-17
with admin/learner A/learner B and direct authenticated PostgREST. Import test
revision only once, confirm duplicate/import hash rejection; private bank
unreadable from learner sessions. Test nonadmin preview/import denial.

D. **Isolated short access window:** in this disposable project only, set
staging QA gates TRUE under explicit admin control to test 06-08, then restore
FALSE immediately. Verify eligible A can read published student content, B
cannot, and S5 revocation blocks A. Never expose the private teacher bank.

E. **Real session flows:** test E2E 18-27, Guided step scaffolding,
Independent/Mastery unseen prompt, follow-up timing, retry idempotence,
cross-user attempt isolation, refresh/recovery, and concurrent submits through
actual HTTP sessions. Do not infer answer correctness or band from transcript.

F. **Physical phones:** iOS Safari and Android Chrome (record OS/browser
versions), microphone allow/deny, start/stop/replay, codec containers, consent
on/off, refresh, interrupted upload. Test old E2E 28-34 and additional
consent/audio cases 44-47. Store only consented synthetic test recordings.
Cross-check the stored SHA256 independently against downloaded bytes. The
checksum verifies bytes, not speaker identity or genuine speech.

G. **Anti-harvesting and race tests:** quota/cooldown and six concurrent RPCs
with the guarded, **test-only service-role** L26 harness; do NOT count those as
authenticated learner RLS tests. Test new L29 cases 39-43. Test server delete
tombstone during submit in both orderings, error/retry for Storage deletion,
denied upload after tombstone, and zero residual private audio or attempt rows.
Any privacy failure blocks release.

H. **Cleanup and independent approvals:** restore all five S6 QA flags FALSE,
delete controlled fixture attempts/recordings/test accounts, re-query to prove
absence, disable staging-only access. Complete original case 38 and supplement
case 50 only after cleanup is verified. Five independent reviewers approve
S5 readiness, teacher pedagogy, audio compatibility, privacy and import
integrity using redacted evidence references.

## 4. Evidence contract

For each of 50 cases, supply actual observed results (not predictions):
- status = PASS, FAIL or BLOCKED, otherwise NOT_RUN.
- expected, actual, environment_id, reviewer, run_at_utc (ISO 8601).
- evidence pointer of the form ev:restricted-store/path/identifier (no raw
  signed URLs, cookies, audio, SQL dumps, private answers or learner data).

Original 38-case PASS entries must also meet the existing L22 manifest shape.
The supplementary 12 cases have IDs S6-E2E-39 through S6-E2E-50.

An independent human must check that evidence references point to genuine,
current, redacted artifacts. Merely writing PASS in JSON is not proof.

The optional proof JSON file (not committed by default) at
tests/speaking-s6/m10-l29-review-proof.json may have this structure:

```json
{
  "candidate_sha": "REPLACE_WITH_EXACT_40_HEX_COMMIT",
  "production_untouched": true,
  "ci": {
    "commit_sha": "REPLACE_WITH_SAME_40_HEX_COMMIT",
    "conclusion": "success",
    "run_url": "https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/REPLACE_RUN_ID"
  },
  "staging": {
    "kind": "disposable_supabase",
    "environment_id": "YOUR_NONSECRET_STAGING_ALIAS",
    "not_production": true,
    "migrations_l14_to_l28_verified": true,
    "cleanup": {
      "attempts_zero": true,
      "audio_objects_zero": true,
      "test_accounts_removed": true,
      "release_gates": {
        "s5": false, "teacher": false, "audio": false, "privacy": false, "import": false
      }
    }
  }
}
```

These booleans must be filled from observed checks and signed reviewers, not
guessed or automatically generated. Store sensitive evidence outside GitHub.

The original manifest's `signoffs` needs s5, teacher, audio, privacy and
import keys each having approved=true, a named reviewer and redacted evidence.
The existing `release_status` can be set to REVIEWED_FOR_RELEASE only after
this independent decision. S7 must still remain locked.

## 5. Fail-closed review script

```bash
# Offline, safe for CI. Prints HOLD while evidence is incomplete.
node scripts/speaking-s6-l29-release-gate.mjs

# Operator final review check: exit nonzero unless all 50 entries, approvals,
# staging cleanup, exact CI candidate and evidence shape are present.
node scripts/speaking-s6-l29-release-gate.mjs --require-reviewable

npm test -- tests/speaking-s6-l29-release-gate.test.mjs
```

The report will NEVER authorize a release or unlock S7, even if it prints
READY_FOR_INDEPENDENT_HUMAN_REVIEW. The script only validates metadata
consistency; it cannot authenticate humans, devices, evidence files, JWT
signatures, migrations actually applied, or Supabase data. The mandatory
independent review remains a separate operational requirement.

## 6. Hard release blockers

- Any unresolved FAIL/BLOCKED/NOT_RUN among the 50 scenarios.
- Any privacy leak, foreign-user Storage visibility, private bank exposure,
  invalid or missing consent, orphaned audio, residual staging account,
  inconsistent QA gates, or unsuccessful CI for the exact candidate commit.
- Any missing real mobile Safari/Chrome evidence, inaccurate teacher models,
  unreviewed lesson content, or unreviewed ADD-ONLY import.
- Any attempt to use this project as certified IELTS band scoring; technical
  audio validation does not prove spoken proficiency.

**Decision at this milestone:** S6 remains STAGING_REVIEW_REQUIRED, S7 LOCKED,
production untouched. No real E2E executions have occurred.
