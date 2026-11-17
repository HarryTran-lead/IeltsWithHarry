# IELTS Speaking S6 — M10-L36: ADD-ONLY Correction Packaging & Independent Teacher Review

**Repository:** HarryTran-lead/IeltsWithHarry
**Branch:** `codex/speaking-s6-m10-l14-staging`
**Baseline:** M10-L35 Quality CI PASS at commit `44f96372549572c418dd40db953e9af60f435f88` ([GitHub Actions](https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/44082956245)).
**Actual source availability:** 0/44 owned original+private lesson packages present in this environment. No actual correction revision was authored or imported. Real Supabase E2E 0/50; actual device QA 0/11. S6 HOLD, S7 LOCKED; production untouched.

## 1. Deliverables

- `tests/speaking-s6/m10-l36-correction-manifest.json` — exactly 44 records, **all NOT_REQUESTED**, `revisions_proposed:0`. No fake hashes, authors, editorial scores, approvals or corrections.
- `scripts/speaking-s6-l36-correction-packaging.mjs` — **offline** structural, provenance and review-evidence metadata gate; optional private, read-only comparison of ONE original and ONE proposed ADD-ONLY revision on an authorized local machine.
- `tests/speaking-s6-l36-correction-packaging.test.mjs` — 16 synthetic regression cases covering immutable original hashes, revision uniqueness, separate reviewers, chronology, real teacher rubric constraints, private prompt protection, no-op revisions and changed activity IDs.
- `.github/workflows/quality.yml` — runs the default offline audit without private files or credentials.

**No releases, imports, database writes, account access, audio processing, original content overwrites or production deployments are performed.**

## 2. Correction packaging lifecycle

| State | Meaning | Mandatory evidence |
|---|---|---|
| `NOT_REQUESTED` | No source-backed revision proposed | All revision/hash/review fields NULL, no reason codes |
| `DRAFT_PREPARED` | Actual author proposes a changed, new revision | Original L35 source revision+hash+rights record; target revision+hash; typed reason, author, proposal timestamp and separate redacted proof |
| `TECHNICAL_REVIEWED` | Different reviewer assesses import shape, private-bank isolation, ID stability, hash and backward compatibility | First reviewer alias, separate proof and later UTC timestamp |
| `TEACHER_REVIEWED_PENDING_STAGING` | A third, independent educator evaluates the actual corrected content against the L33 rubric | Another distinct reviewer, different proof, subsequent timestamp and 90+/100 with all critical category floors |

The author, technical reviewer and teacher reviewer must be distinct (case-insensitive identity comparison). Source, revision proposal, technical review and teacher review must **not reuse one evidence reference**. The operator must independently authenticate reviewer identity and private evidence. This script only checks redacted metadata.

Each proposal is linked to a corresponding L35 row marked `RIGHTS_CHECKED_PENDING_TEACHER`. It must pin the same **original** revision, student/private SHA-256 values and source evidence; its new revision ID must differ and have at least one genuinely changed student or private content hash. The L35 claim of permission still requires an independent human rights check: metadata cannot prove license validity.

**Important:** `TEACHER_REVIEWED_PENDING_STAGING` never means published or IELTS-certified. It indicates an operator has recorded a review claim, but the proposed revision must still undergo genuine isolated staging E2E and private RLS tests. The `staging_retest_evidence` field is deliberately NULL for all L36 states and pre-filling it is invalid. Do not promote/merge or toggle QA gates from this tool.

## 3. Original-vs-revised private package comparison

The local-only `compareL36PrivateRevisions(source,revised)` function:

1. Requires the five source-import fields `revision`, `hash`, `privateHash`, `lesson`, `privateLesson` in each package; validates exact lesson identity and different revision names.
2. Verifies canonical original+target SHA-256 values; original is only read, never modified.
3. Requires `status=STAGING_REVIEW_REQUIRED` and `publish_allowed=false` in **both** payloads.
4. Rejects a revision that only renames the revision while leaving both student and private bank hashes unchanged.
5. Requires stable Guided/Independent/Mastery activity IDs, preventing accidental reassignment of existing learner attempts or private references.
6. Runs the L33 structural/privacy inspector against the **target** (guided model and EN/VI reasoning, import-contract fields, unseen Independent/Mastery prompts, follow-ups, 2/7/21 review, private-bank key matching).
7. Outputs only broad change counts for Guided prompts/models/reasoning, Independent and Mastery prompts/follow-ups, plus whether student/private content changed. **Never outputs answer text, prompt text, original file paths or content hashes.**

This comparison is a structural dry run, **not** a real Zod import request, SQL RLS acceptance, pedagogical band judgment or certification. Before import, the operator must also use the actual S6 `validateS6Import` contract and run integration tests against a disposable staging project.

### Safe commands

Run from the repo root:

```bash
# Ordinary CI-safe report: 44 NOT_REQUESTED; no private local files opened
node scripts/speaking-s6-l36-correction-packaging.mjs

# Unit tests use ONLY synthetic, fabricated lesson fixtures
npm test -- tests/speaking-s6-l36-correction-packaging.test.mjs

# Explicitly authorized local-only comparison; no uploads or writes.
node scripts/speaking-s6-l36-correction-packaging.mjs \
  --compare-local-pair /SECURE_PRIVATE/OLD-S6-001.json /SECURE_PRIVATE/NEW-S6-001.json
```

Files must be regular non-symlink JSON under 2 MiB. Use source/private pairs owned by the organization or validly licensed. Both original and modified files remain on the secure operator machine; never commit them to GitHub. For demonstration in CI, use synthetic fixtures only.

## 4. Human review decision checklist

**Technical reviewer** (not author) must confirm:
- Correct new revision naming and ADD-ONLY provenance; old revision and learner progress remain unchanged.
- Student/private SHA-256 correctly recomputed and match the data to import.
- Protected Mastery/Independent question and follow-up delivery is server-only.
- Four Guided, three Independent and two Mastery IDs remain stable; revised prompts/models contain no accidental hidden answer in student-visible content.
- Original rights clearance and evidence reference are valid.
- User-facing consent/audio and 50-case privacy E2E requirements have not been weakened.

**Independent teacher reviewer** (neither author nor technical reviewer) must assess actual spoken pedagogical content:
- Meaningful teach-before-assess progression, three genuinely different hints and a worked example **before** unaided practice.
- Natural, spoken English rather than memorized writing-style sentences; accurate grammar, functional collocations and achievable 6.5-level lexical demands.
- A clear Guided model answer with Vietnamese translation, English teaching explanation and Vietnamese teacher reasoning.
- Three Independent tasks which test transfer and two novel Mastery questions with relevant, non-leading follow-ups.
- Correct guidance for stress, intonation, pronunciation and the 2/7/21 spaced-review cycle.
- Internal 100-point rubric: at least **90/100**, plus critical minimums (learning sequence ≥12/16; scaffolding ≥10/14; Independent ≥9/12; Mastery ≥9/12; bilingual feedback ≥9/12; privacy and accessibility exactly 6/6).

The score is **internal editorial QA**, not an IELTS Speaking candidate band.

After two independent review claims are recorded, repeat the exact target revision's Zod import validation and actual isolated Supabase E2E. The release system remains HOLD until its own 50 real-world cases, 11 physical-device checks, five S5/teacher/audio/privacy/import signoffs and staging cleanup have evidence.

## 5. Defect and remediation priority

**P0:** private prompt or teacher answer leaked to student payload, wrong private bank hash, compromised revision status, unsafe rights. Quarantine and repair first.

**P1:** new revision cannot import, missing required lesson activities/models, broken protected Mastery/Independent flow, duplicate or inauthentic transfer prompts.

**P2:** weak hint progression, missing bilingual examples/explanations, insufficient pronunciation support or spaced-review practice.

Only propose changes backed by an actual source inspection. Do not fabricate work from the 44 empty metadata records. Changes use new ADD-ONLY revisions; the original lesson, its private model bank and previous learner attempts must remain queryable in their own revisions.

## 6. Initial decision and next milestone

**Expected default L36 output:** valid metadata, `HOLD_NO_ORIGINAL_CORRECTION_PACKAGES`, 44 `NOT_REQUESTED`, 0 verified signoffs, release unauthorized, S7 locked. No real private corrections or teacher scores exist yet.

**M10-L37:** evidence-backed, immutable revision traceability and controlled isolated-staging import rehearsal **once** original and corrected private packages become available. If source is still absent, continue only metadata and security coverage and keep all live tests `NOT_RUN`.
